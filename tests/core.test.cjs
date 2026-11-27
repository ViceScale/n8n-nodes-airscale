const { test } = require('node:test');
const assert = require('node:assert/strict');
const { airscaleRequest } = require('../dist/nodes/Airscale/transport');
const { buildLookupBody, normalizeResponse, LOOKUPS } = require('../dist/nodes/Airscale/lookups');
const { AirscaleApi } = require('../dist/credentials/AirscaleApi.credentials');

test('credential keeps key secret and tests free credits endpoint with Bearer auth', () => {
	const c = new AirscaleApi();
	assert.equal(c.properties.find((p) => p.name === 'apiKey').typeOptions.password, true);
	assert.match(c.authenticate.properties.headers.Authorization, /Bearer/);
	assert.equal(c.test.request.method, 'POST');
	assert.equal(c.test.request.url, '/v1/credits');
});
test('transport uses n8n credential helper, fixed origin, timeout, and idempotency', async () => {
	const calls = [];
	const ctx = {
		helpers: {
			httpRequestWithAuthentication: async function (type, opts) {
				calls.push({ type, opts });
				return { ok: true };
			},
		},
	};
	assert.deepEqual(await airscaleRequest(ctx, '/v1/credits'), { ok: true });
	await airscaleRequest(
		ctx,
		'/v1/domain-to-linkedin',
		'POST',
		{ domain: 'example.com' },
		{ idempotencyKey: 'job-1', timeout: 130000 },
	);
	assert.equal(calls[0].type, 'airscaleApi');
	assert.equal(calls[0].opts.url, 'https://api.airscale.io/v1/credits');
	assert.equal(calls[1].opts.headers['Idempotency-Key'], 'job-1');
	assert.equal(calls[1].opts.timeout, 130000);
	await assert.rejects(() => airscaleRequest(ctx, 'https://evil.example'), /path/i);
});
test('uncertain paid failure is never retried and credentials are not exposed', async () => {
	let count = 0;
	const ctx = {
		getNode: () => ({
			name: 'Airscale',
			type: 'test',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		helpers: {
			httpRequestWithAuthentication: async () => {
				count++;
				throw {
					statusCode: 429,
					message: 'Bearer super-secret',
					response: {
						headers: { 'retry-after': '30' },
						body: { error: { code: 'rate_limited', message: 'Limit reached' } },
					},
				};
			},
		},
	};
	await assert.rejects(
		() => airscaleRequest(ctx, '/v1/phone'),
		(e) => !/super-secret/.test(e.message + e.description) && /30/.test(e.description),
	);
	assert.equal(count, 1);
});
test('lookup fields match current API and optional false is preserved', () => {
	const input = { profileUrl: 'https://www.linkedin.com/in/example-person', verification: false };
	assert.deepEqual(
		buildLookupBody('personalEmail', (n) => input[n]),
		{ linkedin_profile_url: input.profileUrl, verification: false },
	);
	assert.deepEqual(
		buildLookupBody('companyUrl', () => 'example.com'),
		{ domain: 'example.com' },
	);
	assert.throws(() => buildLookupBody('phone', () => ''), /required/i);
	assert.equal(Object.keys(LOOKUPS).length, 11);
});
test('normalization preserves arrays, nulls and native types and unwraps known envelopes', () => {
	const phone = {
		status: 'success',
		phone_numbers: '+12025550147',
		all_phone_numbers: ['+12025550147', '+12025550148'],
	};
	assert.deepEqual(normalizeResponse('phone', phone), phone);
	assert.deepEqual(normalizeResponse('credits', { status: 'success', response: { credits: 0 } }), {
		credits: 0,
	});
	assert.deepEqual(
		normalizeResponse('verifyEmail', { body: { score: 0, is_free: false, credits_consumed: 0.5 } }),
		{ score: 0, is_free: false, credits_consumed: 0.5 },
	);
	assert.deepEqual(normalizeResponse('verifyEmail', 'unexpected upstream text'), {
		result: 'unexpected upstream text',
	});
});
test('localized LinkedIn URLs canonicalize and lookalike hosts are rejected', () => {
	assert.deepEqual(
		buildLookupBody(
			'personProfile',
			() => 'https://fr.linkedin.com/in/example-person?originalSubdomain=fr',
		),
		{ linkedin_profile_url: 'https://www.linkedin.com/in/example-person' },
	);
	assert.throws(
		() => buildLookupBody('phone', () => 'https://linkedin.com.evil.example/in/example-person'),
		/LinkedIn/,
	);
});
test('documented reverse-email string miss maps to a consistent status', () => {
	assert.deepEqual(normalizeResponse('reverseEmail', 'not found'), { status: 'not_found' });
});
