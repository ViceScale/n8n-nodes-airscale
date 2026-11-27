const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AirscaleEmail } = require('../dist/nodes/AirscaleEmail/AirscaleEmail.node');
const { AirscaleEmailResults } = require('../dist/nodes/AirscaleEmail/AirscaleEmailResults.node');
const { AirscaleCallbackApi } = require('../dist/credentials/AirscaleCallbackApi.credentials');
const secret = 'synthetic-callback-secret-with-32-characters';
function harness(
	parameters = {},
	items = [{ json: { secretPrivateField: 'must-never-leave-n8n' } }],
) {
	const calls = [];
	const node = {
		id: 'email-node',
		name: 'Airscale Email',
		type: 'n8n-nodes-airscale.airscaleEmail',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const defaults = {
		identifyBy: 'linkedin',
		profileUrl: 'https://www.linkedin.com/in/example-person',
		callbackUrl: 'https://n8n.example.org/webhook/unique-id/email-results',
		customId: 'crm-7',
		correlation: '',
		...parameters,
	};
	const context = {
		getNode: () => node,
		getInputData: () => items,
		getExecutionId: () => '73',
		getNodeParameter: (name, index) =>
			typeof defaults[name] === 'function' ? defaults[name](index) : defaults[name],
		getCredentials: async () => ({ callbackSecret: secret }),
		evaluateExpression: () => 2,
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, ...options });
				return { status: 'accepted', count: 1 };
			},
		},
	};
	return { context, calls, items };
}
function callback(body, token = secret) {
	const response = {
		statusCode: 200,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(value) {
			this.body = value;
			return this;
		},
	};
	return {
		response,
		context: {
			getCredentials: async () => ({ callbackSecret: secret }),
			getBodyData: () => body,
			getQueryData: () => ({ token }),
			getResponseObject: () => response,
		},
	};
}
function payload(overrides = {}) {
	return {
		status: 'success',
		email: 'sample@example.com',
		custom_id: { request_id: '73:email-node:2:0', custom_id: 'crm-7' },
		provider: 'Synthetic Fixture',
		...overrides,
	};
}

test('submission is clearly accepted, uses callback credential, and does not send arbitrary input', async () => {
	const h = harness();
	const result = await new AirscaleEmail().execute.call(h.context);
	assert.equal(h.calls.length, 1);
	assert.equal(h.calls[0].credential, 'airscaleApi');
	assert.equal(h.calls[0].url, 'https://api.airscale.io/v1/email-bulk');
	assert.equal(new URL(h.calls[0].body.webhook_url).searchParams.get('token'), secret);
	assert.deepEqual(h.calls[0].body.inputs[0].custom_id, {
		request_id: '73:email-node:2:0',
		custom_id: 'crm-7',
	});
	assert.doesNotMatch(JSON.stringify(h.calls[0].body), /secretPrivateField|must-never-leave/);
	assert.equal(result[0][0].json.status, 'accepted');
	assert.equal(result[0][0].json.email, undefined);
	assert.deepEqual(result[0][0].pairedItem, { item: 0 });
	assert.doesNotMatch(JSON.stringify(result), /token|synthetic-callback-secret/);
});
test('multiple inputs are submitted once each with unique item correlation and item linking', async () => {
	const h = harness({}, [{ json: {} }, { json: {} }]);
	const result = await new AirscaleEmail().execute.call(h.context);
	assert.equal(h.calls.length, 2);
	assert.notEqual(
		h.calls[0].body.inputs[0].custom_id.request_id,
		h.calls[1].body.inputs[0].custom_id.request_id,
	);
	assert.deepEqual(
		result[0].map((i) => i.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
});
test('all inputs are validated before any submission', async () => {
	const h = harness({ profileUrl: (i) => (i === 0 ? 'https://www.linkedin.com/in/person' : '') }, [
		{ json: {} },
		{ json: {} },
	]);
	await assert.rejects(() => new AirscaleEmail().execute.call(h.context), /Profile URL/);
	assert.equal(h.calls.length, 0);
});
test('explicit correlation object is sent and unwrapped by the persistent results trigger', async () => {
	const h = harness({ correlation: '{"crmRecordId":"c-42","tags":["opted-in"]}' });
	await new AirscaleEmail().execute.call(h.context);
	const cb = callback(payload({ custom_id: h.calls[0].body.inputs[0].custom_id }));
	const result = await new AirscaleEmailResults().webhook.call(cb.context);
	assert.deepEqual(result.workflowData[0][0].json.correlation, {
		crmRecordId: 'c-42',
		tags: ['opted-in'],
	});
	assert.equal(result.workflowData[0][0].json.custom_id, 'crm-7');
	assert.equal(result.workflowData[0][0].json.email, 'sample@example.com');
	assert.equal(result.workflowData[0][0].json.provider, 'Synthetic Fixture');
	assert.equal(result.workflowData[0][0].json.input, undefined);
	assert.equal(
		result.workflowData[0][0].pairedItem,
		undefined,
		'trigger starts a distinct execution',
	);
});
test('callback authentication rejects missing, invalid or array tokens before reading the body', async () => {
	for (const token of [undefined, '', 'wrong', [secret]]) {
		const cb = callback(payload(), token);
		cb.context.getQueryData = () => ({ token });
		cb.context.getBodyData = () => {
			throw new Error('unauthenticated body was read');
		};
		const result = await new AirscaleEmailResults().webhook.call(cb.context);
		assert.equal(cb.response.statusCode, 401);
		assert.equal(result.workflowData, undefined);
	}
});
test('unknown, malformed, missing-correlation and invalid-email callbacks never start a workflow', async () => {
	for (const body of [
		null,
		[],
		payload({ custom_id: 'raw-id' }),
		payload({ status: 'accepted' }),
		payload({ email: null }),
		payload({ email: 'invalid' }),
		payload({ status: 'not_found', email: 'sample@example.com' }),
		payload({ custom_id: { request_id: '', custom_id: null } }),
	]) {
		const cb = callback(body);
		const result = await new AirscaleEmailResults().webhook.call(cb.context);
		assert.equal(cb.response.statusCode, 400);
		assert.equal(result.workflowData, undefined);
	}
});
test('miss, provider timeout and insufficient credits are delivered as completed callback results', async () => {
	for (const status of ['not_found', 'timeout', 'error']) {
		const cb = callback(
			payload({
				status,
				email: null,
				...(status === 'error' ? { error: 'insufficient_credits' } : {}),
			}),
		);
		const result = await new AirscaleEmailResults().webhook.call(cb.context);
		assert.equal(result.workflowData[0][0].json.status, status);
		assert.equal(result.workflowData[0][0].json.email, null);
	}
});
test('repeat callbacks keep request_id stable for downstream deduplication, without exactly-once claims', async () => {
	const cb = callback(payload());
	const node = new AirscaleEmailResults();
	const a = await node.webhook.call(cb.context);
	const b = await node.webhook.call(cb.context);
	assert.equal(a.workflowData[0][0].json.request_id, b.workflowData[0][0].json.request_id);
});
test('trigger uses an activation-managed production webhook and no execution restart', () => {
	const d = new AirscaleEmailResults().description;
	assert.deepEqual(d.inputs, []);
	assert.ok(d.group.includes('trigger'));
	assert.equal(d.webhooks[0].restartWebhook, undefined);
	assert.equal(d.webhooks[0].httpMethod, 'POST');
	assert.equal(d.webhooks[0].responseMode, 'onReceived');
	assert.equal(new AirscaleEmail().description.webhooks, undefined);
});
test('callback credential is password protected and short secrets fail before spending', async () => {
	const c = new AirscaleCallbackApi();
	assert.equal(c.properties[0].typeOptions.password, true);
	const h = harness();
	h.context.getCredentials = async () => ({ callbackSecret: 'too-short' });
	await assert.rejects(() => new AirscaleEmail().execute.call(h.context), /32/);
	assert.equal(h.calls.length, 0);
});
test('unsafe retry and nonpublic HTTPS callback URLs are rejected before spending', async () => {
	const retry = harness();
	retry.context.getNode().retryOnFail = true;
	await assert.rejects(() => new AirscaleEmail().execute.call(retry.context), /Retry On Fail/);
	assert.equal(retry.calls.length, 0);
	for (const url of [
		'http://n8n.example.org/callback',
		'https://localhost/callback',
		'https://127.0.0.1/callback',
		'https://[::1]/callback',
		'https://user:password@example.org/callback',
	]) {
		const h = harness({ callbackUrl: url });
		await assert.rejects(() => new AirscaleEmail().execute.call(h.context), /public HTTPS/);
		assert.equal(h.calls.length, 0);
	}
});
test('invalid or oversized explicit correlation is rejected before spending', async () => {
	for (const correlation of ['[1,2]', '{broken', JSON.stringify({ large: 'é'.repeat(150000) })]) {
		const h = harness({ correlation });
		await assert.rejects(() => new AirscaleEmail().execute.call(h.context));
		assert.equal(h.calls.length, 0);
	}
});
test('name/company inputs omit optional empty fields', async () => {
	const h = harness({
		identifyBy: 'name',
		firstName: ' Sample ',
		lastName: ' Contact ',
		domain: '',
		companyName: ' Example ',
	});
	await new AirscaleEmail().execute.call(h.context);
	const { custom_id, ...input } = h.calls[0].body.inputs[0];
	assert.deepEqual(input, { first_name: 'Sample', last_name: 'Contact', company_name: 'Example' });
});
test('submission errors are never retried and continue-on-fail keeps item association', async () => {
	const h = harness({}, [{ json: {} }, { json: {} }]);
	let attempts = 0;
	h.context.continueOnFail = () => true;
	h.context.helpers.httpRequestWithAuthentication = async () => {
		attempts++;
		if (attempts === 1) throw { statusCode: 502 };
		return { status: 'accepted', count: 1 };
	};
	const result = await new AirscaleEmail().execute.call(h.context);
	assert.equal(attempts, 2);
	assert.equal(result[0][0].json.status, 'submission_error');
	assert.equal(result[0][1].json.status, 'accepted');
	assert.deepEqual(result[0][0].pairedItem, { item: 0 });
});
test('unknown callback fields and authentication token are not sent downstream', async () => {
	const cb = callback(payload({ arbitrary: 'omit', token: secret }));
	const result = await new AirscaleEmailResults().webhook.call(cb.context);
	assert.equal(result.workflowData[0][0].json.arbitrary, undefined);
	assert.doesNotMatch(JSON.stringify(result), /synthetic-callback-secret|token/);
});

test('array-valued status is rejected instead of coerced into a valid result', async () => {
	const cb = callback(payload({ status: ['not_found'], email: null }));
	const result = await new AirscaleEmailResults().webhook.call(cb.context);
	assert.equal(cb.response.statusCode, 400);
	assert.equal(result.workflowData, undefined);
});

test('maximum-size submissions allow bounded callback metadata without rejecting the result', async () => {
	const maximum = 256 * 1024;
	const base = harness({ correlation: { large: '' } });
	await new AirscaleEmail().execute.call(base.context);
	const available = maximum - Buffer.byteLength(JSON.stringify(base.calls[0].body));
	const h = harness({ correlation: { large: 'a'.repeat(available) } });
	await new AirscaleEmail().execute.call(h.context);
	assert.equal(Buffer.byteLength(JSON.stringify(h.calls[0].body)), maximum);
	const cb = callback(
		payload({
			custom_id: h.calls[0].body.inputs[0].custom_id,
			provider: 'p'.repeat(1024),
			verifier: 'v'.repeat(1024),
			email_status: 'e'.repeat(1024),
			error: 'x'.repeat(1024),
		}),
	);
	const result = await new AirscaleEmailResults().webhook.call(cb.context);
	assert.equal(cb.response.statusCode, 200);
	assert.equal(result.workflowData[0][0].json.status, 'success');
	const oversized = harness({ correlation: { large: 'a'.repeat(available + 1) } });
	await assert.rejects(() => new AirscaleEmail().execute.call(oversized.context), /256 KiB/);
	assert.equal(oversized.calls.length, 0);
	const excessiveCallback = callback(
		payload({
			custom_id: {
				request_id: '73:email-node:2:0',
				custom_id: null,
				correlation: { large: 'a'.repeat(maximum + 32769) },
			},
		}),
	);
	assert.equal(
		(await new AirscaleEmailResults().webhook.call(excessiveCallback.context)).workflowData,
		undefined,
	);
	assert.equal(excessiveCallback.response.statusCode, 400);
});

test('callback credential tests only local secret format', async () => {
	const credential = new AirscaleCallbackApi();
	assert.equal((await credential.test({ data: { callbackSecret: secret } })).status, 'OK');
	assert.equal((await credential.test({ data: { callbackSecret: 'short' } })).status, 'Error');
	assert.equal(
		(await credential.test({ data: { callbackSecret: ' '.repeat(40) } })).status,
		'Error',
	);
});

test('lost submission response preserves correlation for a later callback and never retries', async () => {
	const h = harness({ correlation: { crmRecordId: 'c-42' } });
	h.context.continueOnFail = () => true;
	let attempts = 0,
		sent;
	h.context.helpers.httpRequestWithAuthentication = async (_credential, options) => {
		attempts++;
		sent = options.body.inputs[0].custom_id;
		throw { code: 'ETIMEDOUT' };
	};
	const acceptedUnknown = await new AirscaleEmail().execute.call(h.context);
	const cb = callback(payload({ custom_id: sent }));
	const completed = await new AirscaleEmailResults().webhook.call(cb.context);
	assert.equal(attempts, 1);
	assert.equal(acceptedUnknown[0][0].json.status, 'submission_error');
	assert.equal(acceptedUnknown[0][0].json.request_id, completed.workflowData[0][0].json.request_id);
	assert.equal(acceptedUnknown[0][0].json.custom_id, 'crm-7');
	assert.deepEqual(acceptedUnknown[0][0].json.correlation, { crmRecordId: 'c-42' });
	assert.doesNotMatch(
		JSON.stringify(acceptedUnknown),
		/synthetic-callback-secret|must-never-leave/,
	);
	const invalid = harness({ profileUrl: '' });
	invalid.context.continueOnFail = () => true;
	assert.equal(
		(await new AirscaleEmail().execute.call(invalid.context))[0][0].json.request_id,
		undefined,
	);
});
