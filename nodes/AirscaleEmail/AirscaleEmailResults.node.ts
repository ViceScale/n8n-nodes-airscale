import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { matchesSecret, validCallback, validSecret } from './callback';

function reject(context: IWebhookFunctions, code: number, message: string): IWebhookResponseData {
	context.getResponseObject().status(code).json({ error: message });
	return { noWebhookResponse: true };
}

// n8n owns this inbound webhook's activation lifecycle; Airscale accepts its URL per submission.
// No remote subscription exists to create, check or delete. A trigger is not an AI action tool.
export class AirscaleEmailResults implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Airscale Email Results',
		name: 'airscaleEmailResults',
		icon: { light: 'file:../Airscale/airscale.svg', dark: 'file:../Airscale/airscale.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'Receive professional email results',
		description: 'Start a workflow when a professional email lookup completes',
		defaults: { name: 'Airscale Email Results' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'airscaleApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'email-results' },
		],
		properties: [
			{
				displayName:
					'Activate this workflow before submitting email lookups. Copy this trigger’s Production URL into Airscale Email and use the same Airscale API credential, with Callback Secret configured, in both nodes. Test URLs are temporary.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName:
					'Each callback starts a new execution. Use request_id as a unique key in your destination to handle duplicates. Airscale currently sends callbacks once; endpoint downtime can lose a result. Acceptance and credit usage are not inferred from callback absence.',
				name: 'deliveryNotice',
				type: 'notice',
				default: '',
			},
		],
	};
	// Airscale has no subscription API: the sender provides this URL per lookup.
	// n8n registers/removes the local endpoint; these hooks validate readiness without spending credits.
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const credential = await this.getCredentials('airscaleApi');
				return (
					validSecret(credential.callbackSecret) &&
					this.getWorkflowStaticData('node').callbackReady === true
				);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const credential = await this.getCredentials('airscaleApi');
				if (!validSecret(credential.callbackSecret))
					throw new NodeOperationError(
						this.getNode(),
						'Callback Secret must contain 32–512 characters without spaces',
					);
				this.getWorkflowStaticData('node').callbackReady = true;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				delete this.getWorkflowStaticData('node').callbackReady;
				return true;
			},
		},
	};
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('airscaleApi');
		const secret = credentials.callbackSecret;
		if (!validSecret(secret))
			return reject(this, 503, 'Callback credential is not configured correctly');
		const query = this.getQueryData() as Record<string, unknown>;
		if (!matchesSecret(secret, query.token))
			return reject(this, 401, 'Invalid callback authentication');
		const body: unknown = this.getBodyData();
		if (!validCallback(body)) return reject(this, 400, 'Invalid email callback');
		const envelope = body.custom_id as IDataObject;
		const result: IDataObject = {
			status: body.status,
			email: body.email,
			request_id: envelope.request_id,
			custom_id: envelope.custom_id,
		};
		if (envelope.correlation !== undefined) result.correlation = envelope.correlation;
		for (const field of ['email_status', 'provider', 'verifier', 'error'])
			if (body[field] !== undefined) result[field] = body[field];
		return { webhookResponse: { received: true }, workflowData: [[{ json: result }]] };
	}
}
