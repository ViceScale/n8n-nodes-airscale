import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { airscaleRequest } from '../Airscale/transport';
import { isRecord, MAX_EMAIL_BYTES, validSecret } from './callback';

function requiredText(
	context: IExecuteFunctions,
	name: string,
	label: string,
	index: number,
): string {
	const value = context.getNodeParameter(name, index);
	if (typeof value !== 'string' || !value.trim())
		throw new NodeOperationError(context.getNode(), `${label} is required`, { itemIndex: index });
	return value.trim();
}
function inputFor(context: IExecuteFunctions, index: number): IDataObject {
	if (context.getNodeParameter('identifyBy', index) === 'linkedin') {
		const profile = requiredText(context, 'profileUrl', 'LinkedIn Profile URL', index);
		if (!/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+\/?(?:[?#].*)?$/i.test(profile))
			throw new NodeOperationError(
				context.getNode(),
				'Enter a valid HTTPS LinkedIn person profile URL',
				{ itemIndex: index },
			);
		return { linkedin_profile_url: profile };
	}
	const input: IDataObject = {
		first_name: requiredText(context, 'firstName', 'First Name', index),
		last_name: requiredText(context, 'lastName', 'Last Name', index),
	};
	const domain = String(context.getNodeParameter('domain', index, '')).trim();
	const company = String(context.getNodeParameter('companyName', index, '')).trim();
	if (!domain && !company)
		throw new NodeOperationError(context.getNode(), 'Provide a Company Domain or Company Name', {
			itemIndex: index,
		});
	if (domain) input.domain = domain;
	if (company) input.company_name = company;
	return input;
}
function callbackUrl(context: IExecuteFunctions, index: number, secret: string): string {
	let url: URL;
	try {
		url = new URL(requiredText(context, 'callbackUrl', 'Results Webhook URL', index));
	} catch {
		throw new NodeOperationError(
			context.getNode(),
			'A public HTTPS Results Webhook URL is required',
			{ itemIndex: index },
		);
	}
	const host = url.hostname.toLowerCase();
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.hash ||
		!host.includes('.') ||
		/^[\d.]+$/.test(host) ||
		host.includes(':') ||
		/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
	)
		throw new NodeOperationError(
			context.getNode(),
			'A public HTTPS Results Webhook URL is required',
			{ itemIndex: index },
		);
	url.searchParams.set('token', secret);
	return url.toString();
}
function correlationFor(context: IExecuteFunctions, index: number): IDataObject | undefined {
	const raw = context.getNodeParameter('correlation', index, '');
	if (raw === '' || raw === null || raw === undefined) return undefined;
	let value: unknown = raw;
	if (typeof raw === 'string') {
		try {
			value = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(
				context.getNode(),
				'Correlation must contain a valid JSON object',
				{ itemIndex: index },
			);
		}
	}
	if (!isRecord(value))
		throw new NodeOperationError(context.getNode(), 'Correlation must be a JSON object', {
			itemIndex: index,
		});
	return value;
}
function submissionError(error: Error, index: number, envelope?: IDataObject): INodeExecutionData {
	return {
		json: { status: 'submission_error', error: error.message, ...envelope },
		pairedItem: { item: index },
	};
}

// Paid submissions should not be selected automatically by an AI agent.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class AirscaleEmail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Airscale Email',
		name: 'airscaleEmail',
		icon: { light: 'file:../Airscale/airscale.svg', dark: 'file:../Airscale/airscale.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: 'Submit professional email lookup',
		description:
			'Submit professional email lookups and receive completed results in Airscale Email Results',
		defaults: { name: 'Airscale Email' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// Separate secrets authenticate two peers: outbound Airscale API and inbound n8n callbacks.
		// Neither belongs in exported node parameters, and they are not alternative auth methods.
		// eslint-disable-next-line @n8n/community-nodes/single-credential-per-node
		credentials: [
			{ name: 'airscaleApi', required: true },
			{ name: 'airscaleCallbackApi', required: true },
		],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'professionalEmail' },
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'submit',
				options: [
					{
						name: 'Submit Lookup',
						value: 'submit',
						action: 'Submit a professional email lookup',
						description:
							'Accept a lookup; completed results start the Airscale Email Results workflow',
					},
				],
			},
			{
				displayName:
					'Activate a separate workflow starting with Airscale Email Results before submitting. Copy its Production URL below and select the same Callback Secret credential in both nodes. This node outputs acceptance, not the email result.',
				name: 'callbackNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Results Webhook URL',
				name: 'callbackUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://n8n.example.org/webhook/your-ID/email-results',
				description:
					'Production URL of the active Airscale Email Results trigger. Do not put the callback secret or API key in this field.',
			},
			{
				displayName: 'Find By',
				name: 'identifyBy',
				type: 'options',
				default: 'linkedin',
				options: [
					{ name: 'LinkedIn Profile', value: 'linkedin' },
					{ name: 'Name and Company', value: 'name' },
				],
			},
			{
				displayName: 'LinkedIn Profile URL',
				name: 'profileUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://www.linkedin.com/in/example-person',
				displayOptions: { show: { identifyBy: ['linkedin'] } },
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { identifyBy: ['name'] } },
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { identifyBy: ['name'] } },
			},
			{
				displayName: 'Company Domain',
				name: 'domain',
				type: 'string',
				default: '',
				placeholder: 'example.com',
				description: 'Provide a domain or a company name',
				displayOptions: { show: { identifyBy: ['name'] } },
			},
			{
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				default: '',
				description: 'Used when no company domain is available',
				displayOptions: { show: { identifyBy: ['name'] } },
			},
			{
				displayName: 'Custom ID',
				name: 'customId',
				type: 'string',
				default: '',
				description:
					'Optional contact identifier sent to Airscale and returned as custom_id in the results workflow',
			},
			// This is explicitly opted-in user data, not untyped configuration or arbitrary input forwarding.
			// eslint-disable-next-line @n8n/community-nodes/open-ended-node-fields
			{
				displayName: 'Correlation (JSON)',
				name: 'correlation',
				type: 'json',
				default: '',
				description:
					'Optional JSON object sent to Airscale and echoed in the callback. Include only fields you explicitly want to share; other input data is not sent.',
			},
			{
				displayName:
					'Successful finds cost 2 credits. Retrying a node or workflow can submit and charge again. Keep Retry On Fail disabled. Results arrive in the separate active workflow; acceptance alone does not mean an email was found.',
				name: 'creditNotice',
				type: 'notice',
				default: '',
			},
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		if (!items.length) return [[]];
		if (this.getNode().retryOnFail)
			throw new NodeOperationError(this.getNode(), 'Disable Retry On Fail for Airscale Email', {
				description:
					'Email submission has no idempotency guarantee. Automatic retries could submit and charge the same contact again.',
			});
		const credential = await this.getCredentials('airscaleCallbackApi');
		const secret = credential.callbackSecret;
		if (!validSecret(secret))
			throw new NodeOperationError(
				this.getNode(),
				'Callback Secret must contain 32–512 characters without spaces',
			);
		const plans: Array<{ index: number; body: IDataObject; envelope: IDataObject }> = [];
		const results: INodeExecutionData[] = [];
		// Prevalidate the entire input before any paid submission. Continue-on-fail keeps invalid items as errors.
		for (let index = 0; index < items.length; index++) {
			try {
				const input = inputFor(this, index);
				const customId = String(this.getNodeParameter('customId', index, '')).trim();
				if (customId.length > 1024)
					throw new NodeOperationError(
						this.getNode(),
						'Custom ID must be at most 1024 characters',
						{ itemIndex: index },
					);
				const runIndex = this.evaluateExpression('{{ $runIndex }}', index);
				const correlation = correlationFor(this, index);
				const envelope: IDataObject = {
					request_id: `${this.getExecutionId()}:${this.getNode().id}:${runIndex}:${index}`,
					custom_id: customId || null,
					...(correlation ? { correlation } : {}),
				};
				const body: IDataObject = {
					webhook_url: callbackUrl(this, index, secret),
					inputs: [{ ...input, custom_id: envelope }],
				};
				if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_EMAIL_BYTES)
					throw new NodeOperationError(
						this.getNode(),
						'Email request exceeds the 256 KiB API limit; reduce the correlation data',
						{ itemIndex: index },
					);
				plans.push({ index, body, envelope });
			} catch (error) {
				if (!this.continueOnFail())
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
				results[index] = submissionError(error as Error, index);
			}
		}
		for (const { index, body, envelope } of plans) {
			try {
				const response = await airscaleRequest(this, '/v1/email-bulk', 'POST', body, {
					timeout: 30000,
				});
				if (response.status !== 'accepted' || response.count !== 1)
					throw new NodeOperationError(
						this.getNode(),
						'Unexpected email acceptance response. Check Airscale before retrying; the outcome is uncertain.',
						{ itemIndex: index },
					);
				results[index] = { json: { status: 'accepted', ...envelope }, pairedItem: { item: index } };
			} catch (error) {
				if (!this.continueOnFail())
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
				results[index] = submissionError(error as Error, index, envelope);
			}
		}
		return [results];
	}
}
