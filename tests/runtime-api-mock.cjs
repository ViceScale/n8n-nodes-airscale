// Development-only NODE_OPTIONS preload. Never include this file in the npm package.
// All fixture output is synthetic. Other keys may call only credits and table CRUD.
const nock = require('nock');
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const FIXTURE_KEY = 'airscale-n8n-fixture-key';
const TABLE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const SECOND_TABLE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae8';
const ROW_ID = '5108e497-fcb8-48c9-8704-74e73094f2d4';
const COLUMN_IDS = {
	Name: 'c5469dba-83a6-4d04-872d-adbb864c2001',
	Email: 'c5469dba-83a6-4d04-872d-adbb864c2002',
	Count: 'c5469dba-83a6-4d04-872d-adbb864c2003',
	Metadata: 'c5469dba-83a6-4d04-872d-adbb864c2004',
};
const columns = Object.entries(COLUMN_IDS).map(([label, id], position) => ({
	id,
	label,
	position,
	type: { Name: 'text', Email: 'email', Count: 'number', Metadata: 'json' }[label],
}));
const tables = new Map([
	[
		TABLE_ID,
		{
			id: TABLE_ID,
			name: 'Fixture Prospects — Synthetic Data',
			columns,
			created_at: '2026-11-27T00:00:00.000Z',
		},
	],
	[
		SECOND_TABLE_ID,
		{
			id: SECOND_TABLE_ID,
			name: 'Fixture Companies — Synthetic Data',
			columns,
			created_at: '2026-11-27T00:00:00.000Z',
		},
	],
]);
const rows = new Map([
	[
		TABLE_ID,
		[
			{
				id: ROW_ID,
				values: {
					[COLUMN_IDS.Name]: 'Sample Contact',
					[COLUMN_IDS.Email]: 'sample@example.com',
					[COLUMN_IDS.Count]: 7,
					[COLUMN_IDS.Metadata]: { fixture: true, tags: ['synthetic', 'n8n'] },
				},
			},
			{
				id: '5108e497-fcb8-48c9-8704-74e73094f2d5',
				values: {
					[COLUMN_IDS.Name]: 'Second Example',
					[COLUMN_IDS.Email]: null,
					[COLUMN_IDS.Count]: 0,
					[COLUMN_IDS.Metadata]: { fixture: true, active: false },
				},
			},
			{
				id: '5108e497-fcb8-48c9-8704-74e73094f2d6',
				values: {
					[COLUMN_IDS.Name]: 'Third Example',
					[COLUMN_IDS.Email]: 'third@example.com',
					[COLUMN_IDS.Count]: 12,
					[COLUMN_IDS.Metadata]: ['synthetic'],
				},
			},
		],
	],
	[SECOND_TABLE_ID, []],
]);
const idempotency = new Map();
const metrics = { fixtureRequests: 0, blockedRequests: 0, callbacks: [], unknownRoutes: [] };
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (status, code, message) => [status, { error: { code, message } }];

function parsedBody(body) {
	if (typeof body === 'string') {
		try {
			return JSON.parse(body);
		} catch {
			return {};
		}
	}
	return body && typeof body === 'object' ? body : {};
}

function page(collection, url, key) {
	const rawCursor = url.searchParams.get('cursor');
	const match = rawCursor?.match(/^fixture:(\d+)$/);
	if (rawCursor && !match)
		return fail(400, 'invalid_fixture_cursor', 'Use the nextCursor returned by this fixture.');
	const offset = match ? Number(match[1]) : 0;
	const requested = Number(url.searchParams.get('limit') || 100);
	if (!Number.isInteger(requested) || requested < 1)
		return fail(400, 'invalid_limit', 'Limit must be a positive integer.');
	// Deliberately short pages exercise cursor continuation even for a large requested limit.
	const limit = Math.min(requested, 2);
	const end = offset + limit;
	return [
		200,
		{
			[key]: copy(collection.slice(offset, end)),
			nextCursor: end < collection.length ? `fixture:${end}` : null,
		},
	];
}

function sendCallback(webhookUrl, input) {
	if (input.first_name === 'NoCallback') return;
	let remote;
	try {
		remote = new URL(webhookUrl);
	} catch {
		throw new Error('Fixture email request needs a valid webhook_url');
	}
	// The destination is fixed. Never connect to a host supplied in an API request.
	setTimeout(() => {
		const payload = JSON.stringify({
			custom_id: input.custom_id,
			status: 'success',
			email: 'sample@example.com',
			email_status: 'valid',
			provider: 'Synthetic Fixture',
			verifier: 'Synthetic Fixture',
		});
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port: 5682,
				method: 'POST',
				path: `${remote.pathname}${remote.search}`,
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(payload),
				},
				timeout: 10000,
			},
			(res) => {
				res.resume();
				metrics.callbacks.push({ status: res.statusCode });
				console.info(`[Airscale fixture] Synthetic email callback HTTP ${res.statusCode}.`);
			},
		);
		req.on('timeout', () => req.destroy(new Error('Fixture callback timed out')));
		req.on('error', () => {
			metrics.callbacks.push({ error: 'local_callback_failed' });
			console.error(
				'[Airscale fixture] Local synthetic callback failed. Check the isolated server on port 5682.',
			);
		});
		req.end(payload);
	}, 1500).unref();
}

function route(method, uri, rawBody) {
	const url = new URL(uri, 'https://api.airscale.io');
	const path = url.pathname;
	const body = parsedBody(rawBody);
	if (method === 'POST' && path === '/v1/credits')
		return [200, { status: 'success', response: { credits: 1234 } }];
	if (method === 'GET' && path === '/v1/tables') return page([...tables.values()], url, 'tables');
	if (method === 'POST' && path === '/v1/tables') {
		if (typeof body.name !== 'string' || !Array.isArray(body.columns))
			return fail(400, 'invalid_table', 'Fixture table creation requires name and columns.');
		const table = {
			id: randomUUID(),
			name: body.name,
			columns: body.columns.map((column, position) => ({ ...column, id: randomUUID(), position })),
			created_at: new Date().toISOString(),
		};
		tables.set(table.id, table);
		rows.set(table.id, []);
		return [201, { table: copy(table) }];
	}
	const match = path.match(/^\/v1\/tables\/([^/]+)(?:\/(rows)(?:\/([^/]+))?)?$/);
	if (match) {
		const [, tableId, rowPath, rowId] = match;
		if (!tables.has(tableId))
			return fail(404, 'table_not_found', 'This fixture table ID does not exist.');
		if (!rowPath && method === 'GET') return [200, { table: copy(tables.get(tableId)) }];
		const tableRows = rows.get(tableId);
		if (rowPath && method === 'GET') {
			if (!rowId) return page(tableRows, url, 'rows');
			const row = tableRows.find((item) => item.id === rowId);
			return row
				? [200, { row: copy(row) }]
				: fail(404, 'row_not_found', 'This fixture row ID does not exist.');
		}
		if (rowPath && method === 'POST' && !rowId) {
			if (!Array.isArray(body.rows))
				return fail(400, 'invalid_rows', 'Fixture insertion requires a rows array.');
			const inserted = body.rows.map((row) => ({
				id: randomUUID(),
				values: copy(row.values || {}),
				created_at: new Date().toISOString(),
			}));
			tableRows.push(...inserted);
			return [201, { rows: copy(inserted), inserted: inserted.length, skipped: 0 }];
		}
		if (rowPath && method === 'PATCH') {
			const updates = rowId ? [{ id: rowId, ...body }] : body.rows;
			if (!Array.isArray(updates))
				return fail(400, 'invalid_rows', 'Fixture update requires a rows array.');
			if (updates.some((update) => !tableRows.some((row) => row.id === update.id)))
				return fail(404, 'row_not_found', 'A fixture update row ID does not exist.');
			for (const update of updates) {
				const row = tableRows.find((item) => item.id === update.id);
				row.values = { ...row.values, ...copy(update.values || {}) };
			}
			return [200, { updated: updates.length }];
		}
	}
	if (method === 'POST' && path === '/v1/email-bulk') {
		if (
			!Array.isArray(body.inputs) ||
			body.inputs.length < 1 ||
			body.inputs.length > 100 ||
			typeof body.webhook_url !== 'string'
		)
			return fail(
				400,
				'invalid_email_fixture',
				'Expected webhook_url and between 1 and 100 inputs.',
			);
		for (const input of body.inputs) sendCallback(body.webhook_url, input);
		return [202, { status: 'accepted', count: body.inputs.length }];
	}
	if (method === 'POST' && path === '/v1/phone')
		return [
			200,
			{
				status: 'success',
				linkedin_profile_url: body.linkedin_profile_url,
				phone_numbers: '+12025550147',
				all_phone_numbers: ['+12025550147', '+12025550148'],
				provider: 'Synthetic Fixture',
			},
		];
	if (method === 'POST' && path === '/v1/domain-to-linkedin')
		return [
			200,
			{ linkedin_company_url: 'https://www.linkedin.com/company/example-company-000000' },
		];
	if (method === 'POST' && path === '/v1/technologies')
		return [200, { domain: body.domain, technologies: ['React', 'Vite'], credits_consumed: 0.5 }];
	metrics.unknownRoutes.push(`${method} ${path}`);
	return fail(
		501,
		'fixture_route_not_implemented',
		`No synthetic fixture for ${method} ${path}. Add this route to tests/runtime-api-mock.cjs; no real request was sent.`,
	);
}

function liveSafe(method, path) {
	if (method === 'POST' && path === '/v1/credits') return true;
	if (method === 'GET') return /^\/v1\/tables(?:\/[^/]+(?:\/rows(?:\/[^/]+)?)?)?$/.test(path);
	if (method === 'POST') return /^\/v1\/tables(?:\/[^/]+\/rows)?$/.test(path);
	if (method === 'PATCH') return /^\/v1\/tables\/[^/]+\/rows(?:\/[^/]+)?$/.test(path);
	return false;
}

for (const origin of ['https://api.airscale.io', 'http://api.airscale.io']) {
	for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
		nock(origin, { allowUnmocked: true })
			.persist()
			.matchHeader('authorization', `Bearer ${FIXTURE_KEY}`)
			.intercept(/.*/, method)
			.reply(function (uri, body) {
				metrics.fixtureRequests++;
				const header = this.req.headers['idempotency-key'];
				const key = header && method === 'POST' ? `${method}:${uri}:${header}` : undefined;
				const fingerprint = JSON.stringify(parsedBody(body));
				if (key && idempotency.has(key)) {
					const existing = idempotency.get(key);
					return existing.fingerprint === fingerprint
						? copy(existing.response)
						: fail(
								409,
								'idempotency_conflict',
								'Fixture idempotency key was reused with different data.',
							);
				}
				const response = route(method, uri, body);
				response.push({ 'Content-Type': 'application/json', 'X-Airscale-Test-Fixture': 'true' });
				if (key && response[0] < 300)
					idempotency.set(key, { fingerprint, response: copy(response) });
				return response;
			});
		// Generic safety net: live requests are allowed only for the explicitly free CRUD routes.
		nock(origin, { allowUnmocked: true })
			.persist()
			.intercept((uri) => !liveSafe(method, new URL(uri, origin).pathname), method)
			.reply(() => {
				metrics.blockedRequests++;
				return fail(
					403,
					'paid_test_blocked',
					'Paid and unknown Airscale routes are blocked in the isolated n8n test runtime. Use the fixture credential for synthetic tests.',
				);
			});
	}
}

console.info('[Airscale fixture] Synthetic fixtures enabled; paid live API requests blocked.');
module.exports = { FIXTURE_KEY, TABLE_ID, SECOND_TABLE_ID, ROW_ID, COLUMN_IDS, metrics };
