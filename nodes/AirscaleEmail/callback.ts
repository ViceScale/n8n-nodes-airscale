import { timingSafeEqual } from 'node:crypto';
import type { IDataObject } from 'n8n-workflow';

export const MAX_EMAIL_BYTES = 256 * 1024;
// The echoed envelope may fill the outgoing limit. Allow bounded result metadata,
// including JSON escaping of the four 1024-character optional strings, in addition.
const MAX_CALLBACK_BYTES = MAX_EMAIL_BYTES + 32 * 1024;
export function isRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validSecret(value: unknown): value is string {
	return (
		typeof value === 'string' && value.length >= 32 && value.length <= 512 && !/\s/.test(value)
	);
}
export function matchesSecret(expected: string, provided: unknown): boolean {
	if (typeof provided !== 'string' || provided.length !== expected.length) return false;
	const left = Buffer.from(expected),
		right = Buffer.from(provided);
	return left.length === right.length && timingSafeEqual(left, right);
}
export function validCallback(body: unknown): body is IDataObject {
	if (!isRecord(body) || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_CALLBACK_BYTES)
		return false;
	const envelope = body.custom_id;
	if (
		!isRecord(envelope) ||
		typeof envelope.request_id !== 'string' ||
		!envelope.request_id ||
		envelope.request_id.length > 256
	)
		return false;
	if (
		envelope.custom_id !== null &&
		(typeof envelope.custom_id !== 'string' || envelope.custom_id.length > 1024)
	)
		return false;
	if (envelope.correlation !== undefined && !isRecord(envelope.correlation)) return false;
	if (
		typeof body.status !== 'string' ||
		!['success', 'not_found', 'timeout', 'error'].includes(body.status)
	)
		return false;
	if (body.status === 'success') {
		if (
			typeof body.email !== 'string' ||
			body.email.length > 320 ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
		)
			return false;
	} else if (body.email !== null) return false;
	for (const key of ['provider', 'verifier', 'email_status', 'error']) {
		if (
			body[key] !== undefined &&
			body[key] !== null &&
			(typeof body[key] !== 'string' || String(body[key]).length > 1024)
		)
			return false;
	}
	return true;
}
