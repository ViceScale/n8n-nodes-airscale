const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const dist = path.join(__dirname, '../dist/nodes/Airscale');
const tableId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const rowId = '5108e497-fcb8-48c9-8704-74e73094f2d4';
const columns = [
	{ id: 'name', label: 'Name', type: 'text' },
	{ id: 'count', label: 'Employees', type: 'number' },
	{ id: 'data', label: 'Data', type: 'json' },
	{ id: 'formula', label: 'Score', type: 'formula' },
];
const table = { id: tableId, name: 'Prospects', columns };

function setup(parameters = {}, response = () => ({ table })) {
	assert.ok(fs.existsSync(path.join(dist, 'tables.js')), 'compiled table implementation exists');
	const calls = [];
	const transportPath = path.join(dist, 'transport.js');
	require.cache[transportPath] = {
		id: transportPath,
		filename: transportPath,
		loaded: true,
		exports: {
			airscaleRequest: async (context, path, method, body, options) => {
				const call = { path, method, body, options };
				calls.push(call);
				return response(call, calls.length);
			},
		},
	};
	delete require.cache[path.join(dist, 'tables.js')];
	const api = require(path.join(dist, 'tables.js'));
	const indexes = [];
	const context = {
		getNodeParameter(name, indexOrDefault, defaultValue) {
			indexes.push([name, indexOrDefault]);
			return Object.hasOwn(parameters, name) ? parameters[name] : defaultValue;
		},
		getNode: () => ({
			id: 'node-1',
			name: 'Airscale',
			type: 'airscale',
			typeVersion: 1,
			position: [0, 0],
			parameters,
		}),
		getExecutionId: () => 'exec-123',
		evaluateExpression: () => 0,
	};
	return { ...api, calls, context, indexes };
}

test('table get returns the table and encodes the selected ID', async () => {
	const t = setup({ tableId: { mode: 'list', value: tableId } });
	assert.deepEqual(await t.executeTableOperation.call(t.context, 'table', 'get', 3), [table]);
	assert.equal(t.calls[0].path, `/v1/tables/${tableId}`);
	assert.equal(t.calls[0].method, 'GET');
	assert.deepEqual(t.indexes[0], ['tableId', 3]);
});

test('table listing follows nextCursor even when pages are short and respects Limit', async () => {
	const t = setup({ returnAll: false, limit: 2 }, (_, n) => ({
		tables: [{ id: `t${n}` }],
		nextCursor: `cursor-${n}`,
	}));
	const result = await t.executeTableOperation.call(t.context, 'table', 'getAll', 0);
	assert.deepEqual(
		result.map((x) => x.id),
		['t1', 't2'],
	);
	assert.equal(t.calls.length, 2);
	assert.equal(t.calls[1].options.qs.cursor, 'cursor-1');
	assert.equal(t.calls[1].options.qs.limit, 1);
});

test('Return All fails clearly on a repeating cursor without returning an incomplete list', async () => {
	const t = setup({ returnAll: true }, () => ({ tables: [{ id: 't1' }], nextCursor: 'same' }));
	await assert.rejects(
		t.executeTableOperation.call(t.context, 'table', 'getAll', 0),
		/cursor.*repeat|repeat.*cursor/i,
	);
	assert.equal(t.calls.length, 2);
});

test('Return All enforces the hard page cap', async () => {
	const t = setup({ returnAll: true }, (_, n) => ({ tables: [], nextCursor: `page-${n}` }));
	await assert.rejects(
		t.executeTableOperation.call(t.context, 'table', 'getAll', 0),
		/limit|safety|maximum/i,
	);
	assert.equal(t.calls.length, 100);
});

test('list operations accept an opaque starting cursor and expose the next cursor', async () => {
	const t = setup({ returnAll: false, limit: 1, cursor: 'resume/opaque+==' }, () => ({
		tables: [{ id: tableId, name: 'Prospects' }],
		nextCursor: 'next+page',
	}));
	const [result] = await t.executeTableOperation.call(t.context, 'table', 'getAll', 0);
	assert.equal(t.calls[0].options.qs.cursor, 'resume/opaque+==');
	assert.equal(result._airscale.nextCursor, 'next+page');
});

test('search locates a table on a later page by case-insensitive name', async () => {
	const t = setup({}, (_, n) =>
		n === 1
			? { tables: [{ id: 'first', name: 'Customers' }], nextCursor: 'later' }
			: { tables: [{ id: tableId, name: 'Prospects' }], nextCursor: null },
	);
	const result = await t.tableMethods.listSearch.searchTables.call(t.context, 'PROS');
	assert.deepEqual(result.results, [{ name: 'Prospects', value: tableId }]);
	assert.equal(t.calls[1].options.qs.cursor, 'later');
});

test('search is bounded and returns a resumable continuation token', async () => {
	const t = setup({}, (_, n) => ({
		tables: [{ id: `t${n}`, name: 'Table' }],
		nextCursor: `p${n}`,
	}));
	const result = await t.tableMethods.listSearch.searchTables.call(t.context, 'no match');
	assert.equal(t.calls.length, 5);
	assert.equal(result.results.length, 0);
	assert.ok(result.paginationToken);
	await t.tableMethods.listSearch.searchTables.call(t.context, 'no match', result.paginationToken);
	assert.equal(t.calls[5].options.qs.cursor, 'p5');
});

test('dynamic mapper excludes read-only columns and preserves the numeric type', async () => {
	const t = setup({ tableId: { mode: 'id', value: tableId } });
	const result = await t.tableMethods.resourceMapping.getColumns.call(t.context);
	assert.deepEqual(
		result.fields.map((x) => x.id),
		['name', 'count', 'data'],
	);
	assert.equal(result.fields[0].displayName, 'Name');
	assert.equal(result.fields[0].type, 'string');
	assert.equal(result.fields[1].type, 'number');
	assert.equal(
		result.fields[2].type,
		undefined,
		'JSON accepts arrays and primitives, not just objects',
	);
});

test('friendly table columns produce an API body and stable per-item idempotency key', async () => {
	const t = setup({
		tableName: 'Prospects',
		columns: {
			column: [
				{ label: 'Name', type: 'text' },
				{ label: 'Data', type: 'json' },
			],
		},
	});
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	await t.executeTableOperation.call(t.context, 'table', 'create', 1);
	assert.deepEqual(t.calls[0].body, {
		name: 'Prospects',
		columns: [
			{ label: 'Name', type: 'text' },
			{ label: 'Data', type: 'json' },
		],
	});
	assert.ok(t.calls[0].options.idempotencyKey);
	assert.equal(t.calls[0].options.idempotencyKey, t.calls[1].options.idempotencyKey);
	assert.notEqual(t.calls[0].options.idempotencyKey, t.calls[2].options.idempotencyKey);
});

test('user-supplied idempotency key remains stable across manual executions', async () => {
	const t = setup({
		tableName: 'Prospects',
		columns: { column: [{ label: 'Name' }] },
		idempotencyKey: 'my-table-creation-001',
	});
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	t.context.getExecutionId = () => 'another-execution';
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	assert.equal(t.calls[0].options.idempotencyKey, 'my-table-creation-001');
	assert.equal(t.calls[1].options.idempotencyKey, 'my-table-creation-001');
});

test('different loop runs have different default idempotency keys', async () => {
	const t = setup({ tableName: 'Prospects', columns: { column: [{ label: 'Name' }] } });
	t.context.getExecuteData = () => ({});
	t.context.evaluateExpression = (expression, itemIndex) => {
		assert.equal(expression, '{{ $runIndex }}');
		assert.equal(itemIndex, 0);
		return 0;
	};
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	t.context.evaluateExpression = () => 1;
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	assert.notEqual(t.calls[0].options.idempotencyKey, t.calls[1].options.idempotencyKey);
});

test('duplicate table column names are rejected before any write', async () => {
	const t = setup({
		tableName: 'Prospects',
		columns: { column: [{ label: 'Email' }, { label: 'email' }] },
	});
	await assert.rejects(
		t.executeTableOperation.call(t.context, 'table', 'create', 0),
		/unique|duplicate/i,
	);
	assert.equal(t.calls.length, 0);
});

test('raw table columns are accepted without malformed numeric object keys', async () => {
	const t = setup({
		tableName: 'Prospects',
		columnInputMode: 'json',
		columnsJson: '[{"label":"Name","type":"text"}]',
	});
	await t.executeTableOperation.call(t.context, 'table', 'create', 0);
	assert.deepEqual(t.calls[0].body.columns, [{ label: 'Name', type: 'text' }]);
});

test('mapped row creation preserves zero, false, null, and nested arrays', async () => {
	for (const value of [false, null, ['a', { nested: [1, 2] }]]) {
		const t = setup(
			{ tableId, fields: { value: { name: null, count: 0, data: value } } },
			(call) =>
				call.method === 'GET'
					? { table }
					: { rows: [{ id: rowId, values: call.body.rows[0].values }], skipped: 0 },
		);
		const result = await t.executeTableOperation.call(t.context, 'row', 'create', 2);
		assert.deepEqual(t.calls[1].body, {
			rows: [{ values: { name: null, count: 0, data: value } }],
		});
		assert.equal(t.calls[1].method, 'POST');
		assert.ok(t.calls[1].options.idempotencyKey);
		assert.deepEqual(result[0].fields, { Name: null, Employees: 0, Data: value });
		assert.deepEqual(result[0].values, { name: null, count: 0, data: value });
	}
});

test('raw row batches remain arrays and preserve JSON arrays', async () => {
	const rows = [{ values: { data: [false, 0, null] } }, { values: { name: 'Alex' } }];
	const t = setup({ tableId, rowInputMode: 'json', rowsJson: rows }, (call) =>
		call.method === 'GET' ? { table } : { rows: [], skipped: 2 },
	);
	const result = await t.executeTableOperation.call(t.context, 'row', 'create', 0);
	assert.deepEqual(t.calls[1].body, { rows });
	assert.equal(result[0].skipped, 2);
	assert.equal(result[0].inserted, 0);
});

test('row updates report notFound and only send selected fields', async () => {
	const t = setup({ tableId, rowId, fields: { value: { name: null } } }, (call) =>
		call.method === 'GET' ? { table } : { updated: 0, ids: [], notFound: [rowId] },
	);
	const result = await t.executeTableOperation.call(t.context, 'row', 'update', 0);
	assert.deepEqual(t.calls[1].body, { rows: [{ id: rowId, values: { name: null } }] });
	assert.equal(t.calls[1].method, 'PATCH');
	assert.equal(t.calls[1].options?.idempotencyKey, undefined);
	assert.deepEqual(result, [{ updated: 0, ids: [], notFound: [rowId] }]);
});

test('uncertain PATCH failures are never automatically retried', async () => {
	const t = setup({ tableId, rowId, fields: { value: { name: 'Alex' } } }, (call) => {
		if (call.method === 'GET') return { table };
		throw new Error('504 unknown write result');
	});
	await assert.rejects(t.executeTableOperation.call(t.context, 'row', 'update', 0), /504/);
	assert.equal(t.calls.filter((x) => x.method === 'PATCH').length, 1);
});

test('invalid mapped values and readonly columns are rejected before mutation', async () => {
	for (const values of [
		{ count: '42' },
		{ name: false },
		{ formula: 1 },
		{ missing: 'x' },
		{ count: Infinity },
	]) {
		const t = setup({ tableId, fields: { value: values } });
		await assert.rejects(
			t.executeTableOperation.call(t.context, 'row', 'create', 0),
			/column|number|value/i,
		);
		assert.equal(t.calls.filter((x) => x.method !== 'GET').length, 0);
	}
});

test('duplicate update row IDs are rejected before mutation', async () => {
	const t = setup({
		tableId,
		rowInputMode: 'json',
		rowsJson: [
			{ id: rowId, values: { name: 'a' } },
			{ id: rowId, values: { name: 'b' } },
		],
	});
	await assert.rejects(
		t.executeTableOperation.call(t.context, 'row', 'update', 0),
		/duplicate|once/i,
	);
	assert.equal(t.calls.filter((x) => x.method !== 'GET').length, 0);
});

test('malformed JSON and oversized batches fail before any row mutation', async () => {
	for (const rowsJson of ['{broken', [], Array.from({ length: 1001 }, () => ({ values: {} }))]) {
		const t = setup({ tableId, rowInputMode: 'json', rowsJson });
		await assert.rejects(t.executeTableOperation.call(t.context, 'row', 'create', 0), /JSON|1,000/);
		assert.equal(t.calls.filter((x) => x.method !== 'GET').length, 0);
	}
});

test('readable row fields safely disambiguate labels and preserve raw IDs', async () => {
	const duplicateColumns = [
		{ id: 'a', label: 'Name', type: 'text' },
		{ id: 'b', label: 'Name', type: 'text' },
		{ id: 'c', label: 'Name (a)', type: 'text' },
		{ id: 'd', label: '__proto__', type: 'json' },
	];
	const values = { a: 'Alex', b: 'Sam', c: 'Chris', d: { safe: true }, unknown: 0 };
	const t = setup({ tableId, returnAll: false, limit: 1 }, (call) =>
		call.path.endsWith('/rows')
			? { rows: [{ id: rowId, values }], nextCursor: null }
			: { table: { ...table, columns: duplicateColumns } },
	);
	const [result] = await t.executeTableOperation.call(t.context, 'row', 'getAll', 0);
	assert.equal(Object.keys(result.fields).length, 5);
	assert.deepEqual(result.fields.__proto__, { safe: true });
	assert.deepEqual(result.values, values);
	assert.equal(Object.getPrototypeOf(result.fields), Object.prototype);
	const outputKeys = result._airscale.columns.map((c) => c.outputKey);
	assert.equal(new Set(outputKeys).size, 4);
	assert.equal(result.fields[outputKeys[0]], 'Alex');
	assert.equal(result.fields[outputKeys[1]], 'Sam');
	assert.equal(result.fields[outputKeys[2]], 'Chris');
});

test('row listing follows an empty intermediate page and returns all rows', async () => {
	let pages = 0;
	const t = setup({ tableId, returnAll: true }, (call) => {
		if (!call.path.endsWith('/rows')) return { table };
		pages++;
		return pages === 1
			? { rows: [], nextCursor: 'next' }
			: { rows: [{ id: rowId, values: { count: 0 } }], nextCursor: null };
	});
	const result = await t.executeTableOperation.call(t.context, 'row', 'getAll', 0);
	assert.equal(result.length, 1);
	assert.equal(result[0].fields.Employees, 0);
	assert.equal(pages, 2);
});

test('node properties expose the native table locator, mapper, and friendly builder', () => {
	assert.ok(
		fs.existsSync(path.join(dist, 'tableProperties.js')),
		'compiled table properties exist',
	);
	const { tableProperties } = require(path.join(dist, 'tableProperties.js'));
	const locator = tableProperties.find((p) => p.name === 'tableId');
	assert.equal(locator.type, 'resourceLocator');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'searchTables');
	assert.equal(tableProperties.find((p) => p.name === 'fields').type, 'resourceMapper');
	assert.equal(tableProperties.find((p) => p.name === 'columns').type, 'fixedCollection');
});

test('the table selector is visible for all row operations and table Get only', () => {
	const { NodeHelpers } = require('n8n-workflow');
	const { tableProperties } = require(path.join(dist, 'tableProperties.js'));
	for (const [resource, operation, expected] of [
		['table', 'get', 1],
		['table', 'getAll', 0],
		['table', 'create', 0],
		['row', 'getAll', 1],
		['row', 'create', 1],
		['row', 'update', 1],
	]) {
		const visible = tableProperties.filter(
			(property) =>
				property.name === 'tableId' &&
				NodeHelpers.displayParameter({ resource, operation }, property, null, null),
		);
		assert.equal(visible.length, expected, `${resource}.${operation}`);
	}
});
