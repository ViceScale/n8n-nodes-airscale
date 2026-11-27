import { NodeConnectionTypes } from 'n8n-workflow';
import type {
	IDataObject,
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
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
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
		credentials: [{ name: 'airscaleCallbackApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'email-results' },
		],
		properties: [
			{
				displayName:
					'Activate this workflow before submitting email lookups. Copy this trigger’s Production URL into Airscale Email and use the same Callback Secret credential in both nodes. Test URLs are temporary.',
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
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('airscaleCallbackApi');
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
