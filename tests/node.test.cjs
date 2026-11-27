const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Airscale } = require('../dist/nodes/Airscale/Airscale.node');
const { LOOKUPS } = require('../dist/nodes/Airscale/lookups');
const openapi = require('./fixtures/openapi.json');
function context(params, items = 2) {
	const calls = [];
	return {
		calls,
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		getNodeParameter: (key, i, fallback) =>
			typeof params[key] === 'function' ? params[key](i) : (params[key] ?? fallback),
		getNode: () => ({
			id: 'node-1',
			name: 'Airscale',
			type: 'n8n-nodes-airscale.airscale',
			typeVersion: 1,
			position: [0, 0],
			parameters: params,
			retryOnFail: params.retryOnFail,
		}),
		getExecutionId: () => 'execution-1',
		getExecuteData: () => ({}),
		evaluateExpression: () => params.runIndex || 0,
		continueOnFail: () => !!params.continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (type, options) => {
				calls.push(options);
				return { status: 'success', response: { credits: 123 } };
			},
		},
	};
}
test('each documented lookup sends only current API request fields', async () => {
	for (const [operation, spec] of Object.entries(LOOKUPS)) {
		const ctx = context(
			{
				resource: spec.resource,
				operation,
				profileUrl:
					operation === 'companyProfile'
						? 'https://www.linkedin.com/company/example'
						: 'https://www.linkedin.com/in/example',
				email: 'person@example.com',
				phone: '+12025550147',
				domain: 'example.com',
				firstName: 'Sample',
				lastName: 'Person',
				companyName: 'Example',
				verification: false,
			},
			1,
		);
		await new Airscale().execute.call(ctx);
		const schema =
			openapi.paths[`/v1/${spec.endpoint}`].post.requestBody?.content['application/json'].schema;
		for (const key of Object.keys(ctx.calls[0].body))
			assert.ok(schema?.properties[key], `${operation}.${key}`);
		for (const key of schema?.required || [])
			assert.ok(Object.hasOwn(ctx.calls[0].body, key), `${operation}.${key} required`);
	}
});
test('multiple input items retain pairing for subsequent mapping', async () => {
	const ctx = context({ resource: 'workspace', operation: 'credits' });
	const [output] = await new Airscale().execute.call(ctx);
	assert.equal(ctx.calls.length, 2);
	assert.deepEqual(output, [
		{ json: { credits: 123 }, pairedItem: { item: 0 } },
		{ json: { credits: 123 }, pairedItem: { item: 1 } },
	]);
});
test('continue-on-fail validates each item without dropping good items', async () => {
	const ctx = context({
		resource: 'person',
		operation: 'phone',
		profileUrl: (i) => (i ? 'https://www.linkedin.com/in/example' : ''),
		continueOnFail: true,
	});
	const [output] = await new Airscale().execute.call(ctx);
	assert.equal(ctx.calls.length, 1);
	assert.match(output[0].json.error, /required/);
	assert.deepEqual(output[1].pairedItem, { item: 1 });
});
test('unsafe retries are rejected before paid calls', async () => {
	const ctx = context(
		{ resource: 'company', operation: 'technologies', domain: 'example.com', retryOnFail: true },
		1,
	);
	await assert.rejects(() => new Airscale().execute.call(ctx), /Retry On Fail/);
	assert.equal(ctx.calls.length, 0);
});
test('email verification allows the documented 135 second response plus network margin', async () => {
	const ctx = context(
		{ resource: 'email', operation: 'verifyEmail', email: 'person@example.com' },
		1,
	);
	await new Airscale().execute.call(ctx);
	assert.ok(ctx.calls[0].timeout >= 150000);
});
test('idempotency is stable per execution run but distinct for loop iterations', async () => {
	const keys = [];
	for (const runIndex of [0, 0, 1]) {
		const ctx = context(
			{ resource: 'company', operation: 'companyUrl', domain: 'example.com', runIndex },
			1,
		);
		await new Airscale().execute.call(ctx);
		keys.push(ctx.calls[0].headers['Idempotency-Key']);
	}
	assert.equal(keys[0], keys[1]);
	assert.notEqual(keys[0], keys[2]);
});
