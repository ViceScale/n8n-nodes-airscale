import { NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';
import { airscaleRequest } from './transport';

type Context = IExecuteFunctions | ILoadOptionsFunctions;
type Column = IDataObject & { id: string; label: string; type: string; outputKey: string };
const writableTypes = new Set(['text', 'email', 'phone', 'url', 'number', 'json']);
const maxPages = 100;
const maxItems = 10000;
const searchPagesPerCall = 5;

function fail(context: Context, message: string, itemIndex?: number): never {
	throw new NodeOperationError(context.getNode(), message, { itemIndex });
}

function object(value: unknown, context: Context, label: string): IDataObject {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		fail(context, `${label} must be a JSON object`);
	}
	return value as IDataObject;
}

function parseJson(value: unknown, context: Context, label: string): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return fail(context, `${label} must contain valid JSON`);
	}
}

function requiredString(
	value: unknown,
	context: Context,
	label: string,
	maxLength?: number,
): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		(maxLength && value.trim().length > maxLength)
	) {
		fail(
			context,
			`${label} must be a non-empty string${maxLength ? ` of at most ${maxLength} characters` : ''}`,
		);
	}
	return value.trim();
}

function selectedTable(value: unknown, context: Context): string {
	const id = typeof value === 'object' && value !== null ? (value as IDataObject).value : value;
	return requiredString(id, context, 'Table ID');
}

async function getTable(context: Context, tableId: string): Promise<IDataObject> {
	const response = object(
		await airscaleRequest(context, `/v1/tables/${encodeURIComponent(tableId)}`, 'GET'),
		context,
		'Table response',
	);
	return object(response.table, context, 'Table');
}

function columnsForOutput(table: IDataObject, context: Context): Column[] {
	if (!Array.isArray(table.columns)) fail(context, 'The table response did not include columns');
	const columns = table.columns.map((value) => {
		const column = object(value, context, 'Column');
		return {
			...column,
			id: requiredString(column.id, context, 'Column ID'),
			label: requiredString(column.label, context, 'Column label'),
			type: requiredString(column.type, context, 'Column type'),
		};
	});
	const labels = new Map<string, number>();
	for (const column of columns)
		labels.set(column.label.toLowerCase(), (labels.get(column.label.toLowerCase()) ?? 0) + 1);
	const reserved = new Set(columns.map((column) => column.label));
	const used = new Set<string>();
	return columns.map((column) => {
		let outputKey = column.label;
		if ((labels.get(column.label.toLowerCase()) ?? 0) > 1) {
			outputKey = `${column.label} (${column.id})`;
			while (reserved.has(outputKey) || used.has(outputKey)) outputKey += ` (${column.id})`;
		}
		while (used.has(outputKey)) outputKey += ` (${column.id})`;
		used.add(outputKey);
		return { ...column, outputKey };
	});
}

function readableRow(
	row: IDataObject,
	columns: Column[],
	tableId: string,
	metadata: IDataObject = {},
): IDataObject {
	const values = row.values as IDataObject;
	const keys = new Map(columns.map((column) => [column.id, column.outputKey]));
	const used = new Set(columns.map((column) => column.outputKey));
	const entries = Object.entries(values).map(([id, value]) => {
		let key = keys.get(id);
		if (!key) {
			key = id;
			while (used.has(key)) key += ` (${id})`;
			used.add(key);
		}
		return [key, value];
	});
	return {
		...row,
		fields: Object.fromEntries(entries),
		_airscale: { tableId, columns, ...metadata },
	};
}

function readPage(
	response: unknown,
	collection: 'tables' | 'rows',
	context: Context,
): { items: IDataObject[]; cursor?: string } {
	const page = object(response, context, 'List response');
	if (!Array.isArray(page[collection])) fail(context, `The response did not include ${collection}`);
	const items = (page[collection] as unknown[]).map((value) =>
		object(value, context, collection === 'rows' ? 'Row' : 'Table'),
	);
	if (
		page.nextCursor !== null &&
		page.nextCursor !== undefined &&
		typeof page.nextCursor !== 'string'
	) {
		fail(context, 'The API returned an invalid pagination cursor');
	}
	return {
		items,
		cursor: typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined,
	};
}

async function listItems(
	context: IExecuteFunctions,
	path: string,
	collection: 'tables' | 'rows',
	itemIndex: number,
): Promise<{ items: IDataObject[]; cursor?: string }> {
	const returnAll = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? maxItems : Number(context.getNodeParameter('limit', itemIndex, 50));
	if (!Number.isInteger(limit) || limit < 1 || limit > maxItems)
		fail(context, `Limit must be between 1 and ${maxItems}`, itemIndex);
	const items: IDataObject[] = [];
	const seen = new Set<string>();
	const initialCursor = context.getNodeParameter('cursor', itemIndex, '');
	let cursor = initialCursor === '' ? undefined : requiredString(initialCursor, context, 'Cursor');
	if (cursor) seen.add(cursor);
	for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
		const qs: IDataObject = {
			limit: Math.min(100, limit - items.length),
			...(cursor ? { cursor } : {}),
		};
		const page = readPage(
			await airscaleRequest(context, path, 'GET', undefined, { qs }),
			collection,
			context,
		);
		items.push(...page.items.slice(0, limit - items.length));
		cursor = page.cursor;
		if (!cursor) return { items };
		if (!returnAll && items.length >= limit) return { items, cursor };
		if (seen.has(cursor))
			fail(
				context,
				'The API repeated a pagination cursor. No incomplete result was returned.',
				itemIndex,
			);
		seen.add(cursor);
		if (items.length >= maxItems)
			fail(
				context,
				`Return All reached the ${maxItems}-item safety limit. Turn off Return All and use Limit with the returned next cursor to process chunks.`,
				itemIndex,
			);
	}
	return fail(
		context,
		`Pagination reached the ${maxPages}-request safety limit. No incomplete result was returned.`,
		itemIndex,
	);
}

function idempotencyKey(context: IExecuteFunctions, operation: string, itemIndex: number): string {
	const supplied = context.getNodeParameter('idempotencyKey', itemIndex, '');
	if (supplied !== '') return requiredString(supplied, context, 'Idempotency key', 200);
	const runIndex = context.evaluateExpression('{{ $runIndex }}', itemIndex);
	return `n8n:${encodeURIComponent(context.getExecutionId())}:${encodeURIComponent(context.getNode().id)}:${runIndex}:${operation}:${itemIndex}`;
}

function createTableBody(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const name = requiredString(
		context.getNodeParameter('tableName', itemIndex),
		context,
		'Table name',
		200,
	);
	const mode = context.getNodeParameter('columnInputMode', itemIndex, 'builder');
	const input =
		mode === 'json'
			? parseJson(context.getNodeParameter('columnsJson', itemIndex), context, 'Columns JSON')
			: object(context.getNodeParameter('columns', itemIndex, {}), context, 'Columns').column;
	if (!Array.isArray(input) || input.length < 1 || input.length > 50)
		fail(context, 'Provide between 1 and 50 columns', itemIndex);
	const names = new Set<string>();
	const columns = input.map((value) => {
		const column = object(value, context, 'Column');
		const label = requiredString(column.label, context, 'Column label', 200);
		const type = column.type ?? 'text';
		if (typeof type !== 'string' || !writableTypes.has(type))
			fail(context, `Unsupported column type for ${label}`, itemIndex);
		if (names.has(label.toLowerCase()))
			fail(context, 'Column labels must be unique, ignoring case', itemIndex);
		names.add(label.toLowerCase());
		return { label, type };
	});
	return { name, columns };
}

function isJson(value: unknown, ancestors = new Set<unknown>()): boolean {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || ancestors.has(value)) return false;
	ancestors.add(value);
	const valid = Object.values(value).every((child) => isJson(child, ancestors));
	ancestors.delete(value);
	return valid;
}

function writeRows(
	context: IExecuteFunctions,
	columns: Column[],
	operation: string,
	itemIndex: number,
): IDataObject[] {
	const mode = context.getNodeParameter('rowInputMode', itemIndex, 'map');
	let input: unknown;
	if (mode === 'json') {
		input = parseJson(context.getNodeParameter('rowsJson', itemIndex), context, 'Rows JSON');
	} else {
		const mapper = object(context.getNodeParameter('fields', itemIndex, {}), context, 'Fields');
		input = [
			{
				...(operation === 'update' ? { id: context.getNodeParameter('rowId', itemIndex) } : {}),
				values: mapper.value ?? {},
			},
		];
	}
	if (!Array.isArray(input) || input.length < 1 || input.length > 1000)
		fail(context, 'Provide between 1 and 1,000 rows', itemIndex);
	const columnMap = new Map(columns.map((column) => [column.id, column]));
	const ids = new Set<string>();
	return input.map((value) => {
		const row = object(value, context, 'Row');
		const values = object(row.values, context, 'Row values');
		for (const [id, cell] of Object.entries(values)) {
			const column = columnMap.get(id);
			if (!column) fail(context, `Unknown column ID: ${id}. Refresh the table fields.`, itemIndex);
			if (!writableTypes.has(column.type))
				fail(context, `Column ${column.label} is read-only`, itemIndex);
			if (cell === null) continue;
			const valid =
				column.type === 'json'
					? isJson(cell)
					: column.type === 'number'
						? typeof cell === 'number' && Number.isFinite(cell)
						: typeof cell === 'string';
			if (!valid)
				fail(
					context,
					`Invalid value for column ${column.label} (${column.type}). Use the native value type or null to clear it.`,
					itemIndex,
				);
		}
		if (operation !== 'update') return { values };
		const id = requiredString(row.id, context, 'Row ID');
		if (ids.has(id))
			fail(
				context,
				'Each row ID may appear only once in an update; remove duplicate row IDs',
				itemIndex,
			);
		ids.add(id);
		return { id, values };
	});
}

export const tableMethods = {
	listSearch: {
		async searchTables(
			this: ILoadOptionsFunctions,
			filter = '',
			paginationToken?: string,
		): Promise<INodeListSearchResult> {
			let cursor: string | undefined;
			const seen = new Set<string>();
			if (paginationToken) {
				let state: IDataObject;
				try {
					state = object(
						JSON.parse(decodeURIComponent(paginationToken)),
						this,
						'Search pagination',
					);
				} catch {
					return fail(this, 'Invalid table search pagination token. Start a new search.');
				}
				cursor = requiredString(state.cursor, this, 'Search cursor');
				if (!Array.isArray(state.seen) || state.seen.some((value) => typeof value !== 'string'))
					fail(this, 'Invalid table search pagination token');
				for (const value of state.seen as string[]) seen.add(value);
			}
			const results: INodeListSearchResult['results'] = [];
			for (let i = 0; i < searchPagesPerCall; i++) {
				if (seen.size >= maxPages)
					fail(this, 'Table search reached its safety limit. Enter a table ID directly.');
				const page = readPage(
					await airscaleRequest(this, '/v1/tables', 'GET', undefined, {
						qs: { limit: 100, ...(cursor ? { cursor } : {}) },
					}),
					'tables',
					this,
				);
				for (const table of page.items) {
					const name = requiredString(table.name, this, 'Table name');
					if (name.toLowerCase().includes(filter.toLowerCase()))
						results.push({ name, value: requiredString(table.id, this, 'Table ID') });
				}
				cursor = page.cursor;
				if (!cursor) return { results };
				if (seen.has(cursor))
					fail(this, 'The API repeated a table search cursor. Start a new search.');
				seen.add(cursor);
				if (results.length > 0) break;
			}
			return {
				results,
				paginationToken: encodeURIComponent(JSON.stringify({ cursor, seen: [...seen] })),
			};
		},
	},
	resourceMapping: {
		async getColumns(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
			const tableId = selectedTable(this.getNodeParameter('tableId'), this);
			const columns = columnsForOutput(await getTable(this, tableId), this);
			return {
				fields: columns
					.filter((column) => writableTypes.has(column.type))
					.map((column) => ({
						id: column.id,
						displayName: column.outputKey,
						defaultMatch: false,
						canBeUsedToMatch: false,
						required: false,
						display: true,
						// JSON accepts every JSON shape. An object-only mapper type rejects arrays and primitives.
						...(column.type === 'json'
							? {}
							: { type: column.type === 'number' ? ('number' as const) : ('string' as const) }),
					})),
				emptyFieldsNotice:
					'This table has no writable columns. Enrichment, formula and date columns are read-only.',
			};
		},
	},
};

export async function executeTableOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (resource === 'table' && operation === 'getAll') {
		const page = await listItems(this, '/v1/tables', 'tables', itemIndex);
		return page.items.map((table) => ({
			...table,
			_airscale: { nextCursor: page.cursor ?? null },
		}));
	}
	if (resource === 'table' && operation === 'create') {
		const body = createTableBody(this, itemIndex);
		const response = object(
			await airscaleRequest(this, '/v1/tables', 'POST', body, {
				idempotencyKey: idempotencyKey(this, 'create-table', itemIndex),
			}),
			this,
			'Create table response',
		);
		return [object(response.table, this, 'Created table')];
	}
	const tableId = selectedTable(this.getNodeParameter('tableId', itemIndex), this);
	const table = await getTable(this, tableId);
	if (resource === 'table' && operation === 'get') return [table];
	if (resource !== 'row' || !['getAll', 'create', 'update'].includes(operation))
		return fail(this, `Unsupported table operation: ${resource}.${operation}`, itemIndex);
	const columns = columnsForOutput(table, this);
	const path = `/v1/tables/${encodeURIComponent(tableId)}/rows`;
	if (operation === 'getAll') {
		const page = await listItems(this, path, 'rows', itemIndex);
		return page.items.map((row) => {
			object(row.values, this, 'Row values');
			return readableRow(row, columns, tableId, { nextCursor: page.cursor ?? null });
		});
	}
	const rows = writeRows(this, columns, operation, itemIndex);
	if (operation === 'update') {
		return [object(await airscaleRequest(this, path, 'PATCH', { rows }), this, 'Update response')];
	}
	const response = object(
		await airscaleRequest(
			this,
			path,
			'POST',
			{ rows },
			{ idempotencyKey: idempotencyKey(this, 'create-rows', itemIndex) },
		),
		this,
		'Insert response',
	);
	if (!Array.isArray(response.rows))
		fail(this, 'The insert response did not include rows', itemIndex);
	if (response.rows.length === 0) return [{ inserted: 0, skipped: response.skipped ?? 0, tableId }];
	return response.rows.map((value) => {
		const row = object(value, this, 'Inserted row');
		object(row.values, this, 'Row values');
		return readableRow(row, columns, tableId, { skipped: response.skipped ?? 0 });
	});
}
