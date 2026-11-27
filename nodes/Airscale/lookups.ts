import type { IDataObject } from 'n8n-workflow';

export const LOOKUPS: Record<
	string,
	{ resource: string; name: string; endpoint: string; fields: Record<string, string>; help: string }
> = {
	phone: {
		resource: 'person',
		name: 'Find Mobile Phone',
		endpoint: 'phone',
		fields: { profileUrl: 'linkedin_profile_url' },
		help: 'Uses Airscale credits when a result is found. Returns a primary phone and a native array of all available numbers.',
	},
	personalEmail: {
		resource: 'person',
		name: 'Find Personal Email',
		endpoint: 'personal-email',
		fields: { profileUrl: 'linkedin_profile_url' },
		help: 'Uses Airscale credits. Optional verification can affect the cost; see current API pricing.',
	},
	personUrl: {
		resource: 'person',
		name: 'Find Profile URL',
		endpoint: 'url-search-people',
		fields: { firstName: 'first_name', lastName: 'last_name', companyName: 'company_name' },
		help: 'Uses Airscale credits according to current API pricing.',
	},
	personProfile: {
		resource: 'person',
		name: 'Get Profile',
		endpoint: 'profile',
		fields: { profileUrl: 'linkedin_profile_url' },
		help: 'Uses Airscale credits. Provide a person profile URL. Optional response fields vary and can be null.',
	},
	reverseEmail: {
		resource: 'person',
		name: 'Find Profile from Email',
		endpoint: 'reverse-email',
		fields: { email: 'email' },
		help: 'Uses Airscale credits. No-match results return status not_found.',
	},
	reversePhone: {
		resource: 'person',
		name: 'Find Profile from Phone',
		endpoint: 'reverse-phone',
		fields: { phone: 'mobile_phone' },
		help: 'Uses Airscale credits. Enter a phone number including its country calling code.',
	},
	companyProfile: {
		resource: 'company',
		name: 'Get Profile',
		endpoint: 'company',
		fields: { profileUrl: 'linkedin_profile_url' },
		help: 'Uses Airscale credits. Provide a company profile URL. Optional response fields vary and can be null.',
	},
	companyUrl: {
		resource: 'company',
		name: 'Find Profile URL',
		endpoint: 'domain-to-linkedin',
		fields: { domain: 'domain' },
		help: 'A successful lookup costs 0.5 credits and can take 120 seconds. Charges may appear after the result. Idempotency keys protect retries for seven days.',
	},
	technologies: {
		resource: 'company',
		name: 'Find Website Technologies',
		endpoint: 'technologies',
		fields: { domain: 'domain' },
		help: 'Costs 0.5 credits when technologies are found; no results cost 0. Lookup can take 60 seconds. Repeating a request can charge again.',
	},
	verifyEmail: {
		resource: 'email',
		name: 'Verify',
		endpoint: 'email-verifier',
		fields: { email: 'email' },
		help: 'Costs 0.5 credits per successful verification. Provider credits_remaining is not your Airscale balance; use Check Credit Balance.',
	},
	credits: {
		resource: 'workspace',
		name: 'Check Credit Balance',
		endpoint: 'credits',
		fields: {},
		help: 'Checks this workspace’s balance without spending credits.',
	},
};

export function buildLookupBody(operation: string, get: (name: string) => unknown): IDataObject {
	const spec = LOOKUPS[operation];
	if (!spec) throw new Error('Unsupported Airscale operation');
	const body: IDataObject = {};
	for (const [param, key] of Object.entries(spec.fields)) {
		const value = get(param);
		if (typeof value !== 'string' || !value.trim()) throw new Error(`${param} is required`);
		body[key] = value.trim();
	}
	if (operation === 'personalEmail') body.verification = get('verification') === true;
	if (['personProfile', 'phone', 'personalEmail', 'companyProfile'].includes(operation)) {
		const raw = String(body.linkedin_profile_url);
		let url: URL;
		try {
			url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
		} catch {
			// Pure validator; execute() wraps this error in NodeOperationError with the input item index.
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
			throw new Error('A valid LinkedIn profile URL is required');
		}
		const segments = url.pathname.split('/').filter(Boolean);
		const allowed = operation === 'companyProfile' ? ['company', 'school'] : ['in'];
		if (
			!['https:', 'http:'].includes(url.protocol) ||
			!/(^|\.)linkedin\.com$/i.test(url.hostname) ||
			!allowed.includes(segments[0]) ||
			!segments[1]
		)
			throw new Error('A valid LinkedIn profile URL of the selected type is required');
		body.linkedin_profile_url = `https://www.linkedin.com/${segments[0]}/${segments[1]}`;
	}
	return body;
}

export function normalizeResponse(operation: string, value: unknown): IDataObject {
	if (operation === 'reverseEmail' && value === 'not found') return { status: 'not_found' };
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return { result: value as IDataObject['result'] };
	const data = value as IDataObject;
	if (
		operation === 'credits' &&
		data.response &&
		typeof data.response === 'object' &&
		!Array.isArray(data.response)
	)
		return data.response as IDataObject;
	if (
		['verifyEmail', 'reverseEmail', 'reversePhone'].includes(operation) &&
		data.body &&
		typeof data.body === 'object' &&
		!Array.isArray(data.body)
	)
		return data.body as IDataObject;
	return data;
}
