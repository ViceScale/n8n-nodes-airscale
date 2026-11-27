import { NodeApiError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

type Context = IExecuteFunctions | ILoadOptionsFunctions;
export type RequestOptions = { qs?: IDataObject; idempotencyKey?: string; timeout?: number };

export async function airscaleRequest(
	context: Context,
	path: string,
	method: IHttpRequestMethods = 'POST',
	body?: IDataObject,
	options: RequestOptions = {},
): Promise<IDataObject> {
	if (!/^\/v1\/[a-z0-9/-]+(?:[?][^#]*)?$/i.test(path) || path.includes('..'))
		throw new Error('Invalid Airscale API path');
	if (options.idempotencyKey && !/^[!-~]{1,200}$/.test(options.idempotencyKey))
		throw new Error('Idempotency key must contain 1–200 printable ASCII characters without spaces');
	const request: IHttpRequestOptions = {
		method,
		url: `https://api.airscale.io${path}`,
		json: true,
		timeout: options.timeout ?? 130000,
		headers: {
			Accept: 'application/json',
			...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
		},
		...(body ? { body } : {}),
		...(options.qs ? { qs: options.qs } : {}),
	};
	try {
		// n8n injects the encrypted connection credential; never handle or log the key here.
		return (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'airscaleApi',
			request,
		)) as IDataObject;
	} catch (caught) {
		const error = caught as {
			statusCode?: number;
			httpCode?: string;
			code?: string;
			response?: {
				status?: number;
				statusCode?: number;
				headers?: Record<string, string>;
				body?: { error?: { code?: string } | string; code?: string };
			};
		};
		const status =
			error.statusCode ??
			error.response?.statusCode ??
			error.response?.status ??
			(Number(error.httpCode) || undefined);
		const bodyError = error.response?.body?.error;
		const code = typeof bodyError === 'object' ? bodyError?.code : error.response?.body?.code;
		const retryAfter = error.response?.headers?.['retry-after'];
		let message = 'Airscale request failed';
		let description =
			'No automatic retry was performed. A timed-out lookup may still complete and consume credits. Check the outcome before retrying.';
		if (status === 401) {
			message = 'Airscale API key is invalid';
			description =
				'Use a current workspace API key from Airscale Settings and test the credential again.';
		} else if (status === 403) {
			message =
				code === 'subscription_required'
					? 'An active Airscale subscription is required'
					: 'Airscale access or credit balance is insufficient';
			description =
				'Check this workspace’s plan, permissions and credit balance in Airscale. No plan change is made by this node.';
		} else if (status === 429 || status === 503 || status === 409) {
			message =
				status === 409
					? 'Airscale request conflicts with another operation'
					: 'Airscale is busy or rate limited';
			description = `${retryAfter ? `Wait at least ${retryAfter} seconds. ` : ''}No automatic retry was performed. For supported creates, reuse the same idempotency key and identical body. For updates, read the current value before retrying.`;
		} else if (status === 404) {
			message = 'Airscale resource or result was not found';
			description = 'Check the table or row ID. For a lookup, there may be no matching result.';
		} else if (status === 400 || status === 413) {
			message = 'Airscale rejected the request';
			description =
				'Check required fields, input types, row size and column permissions against the API documentation.';
		}
		// Construct a fresh safe error: upstream errors can contain request headers and API keys.
		throw new NodeApiError(
			context.getNode(),
			{ message, ...(status ? { statusCode: status } : {}) },
			{ message, description, httpCode: status ? String(status) : undefined },
		);
	}
}
