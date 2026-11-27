import type { INodeProperties } from 'n8n-workflow';

const tableLocator: INodeProperties = {
	displayName: 'Table',
	name: 'tableId',
	type: 'resourceLocator',
	required: true,
	default: { mode: 'list', value: '' },
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchTables', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
		},
	],
	description: 'Choose a table, or enter its ID using an expression',
};

export const tableProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['table'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a table and its columns',
				action: 'Create a table',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a table and its columns',
				action: 'Get a table',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List workspace tables',
				action: 'Get many tables',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['row'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Insert one or more rows',
				action: 'Create rows',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Read table rows with labeled fields',
				action: 'Get many rows',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update selected cells in one or more rows',
				action: 'Update rows',
			},
		],
		default: 'getAll',
	},
	{
		displayName:
			'Tables require an active Airscale paid plan. Table operations do not spend credits or start enrichments.',
		name: 'tableNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['table', 'row'] } },
	},
	{
		...tableLocator,
		displayOptions: { show: { resource: ['table'], operation: ['get'] } },
	},
	{
		...tableLocator,
		displayOptions: { show: { resource: ['row'], operation: ['getAll', 'create', 'update'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['table', 'row'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 10000 },
		displayOptions: {
			show: { resource: ['table', 'row'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['table', 'row'], operation: ['getAll'] } },
		description:
			'Optional starting cursor from _airscale.nextCursor in a previous result. Leave empty to start from the first page.',
	},
	{
		displayName:
			'Return All stops with an error after 10,000 results or 100 requests. Airscale allows 30 reads per minute; a rate-limit error is not retried automatically.',
		name: 'paginationNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: { resource: ['table', 'row'], operation: ['getAll'], returnAll: [true] },
		},
	},
	{
		displayName: 'Table Name',
		name: 'tableName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['table'], operation: ['create'] } },
		description: 'A unique table name in this workspace, up to 200 characters',
	},
	{
		displayName: 'Columns Input',
		name: 'columnInputMode',
		type: 'options',
		default: 'builder',
		displayOptions: { show: { resource: ['table'], operation: ['create'] } },
		options: [
			{ name: 'Build Columns', value: 'builder' },
			{ name: 'JSON', value: 'json' },
		],
	},
	{
		displayName: 'Columns',
		name: 'columns',
		type: 'fixedCollection',
		default: {},
		required: true,
		typeOptions: { multipleValues: true },
		placeholder: 'Add Column',
		displayOptions: {
			show: { resource: ['table'], operation: ['create'], columnInputMode: ['builder'] },
		},
		options: [
			{
				displayName: 'Column',
				name: 'column',
				values: [
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						required: true,
						description: 'Unique column label, up to 200 characters',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 'text',
						options: [
							{ name: 'Email', value: 'email' },
							{ name: 'JSON', value: 'json' },
							{ name: 'Number', value: 'number' },
							{ name: 'Phone', value: 'phone' },
							{ name: 'Text', value: 'text' },
							{ name: 'URL', value: 'url' },
						],
					},
				],
			},
		],
		description: 'Create between 1 and 50 columns',
	},
	{
		displayName: 'Columns JSON',
		name: 'columnsJson',
		type: 'json',
		required: true,
		default:
			'[\n  { "label": "Name", "type": "text" },\n  { "label": "Email", "type": "email" }\n]',
		displayOptions: {
			show: { resource: ['table'], operation: ['create'], columnInputMode: ['json'] },
		},
		description: 'Array of 1–50 column definitions with label and optional type',
	},
	{
		displayName: 'Row Input',
		name: 'rowInputMode',
		type: 'options',
		default: 'map',
		displayOptions: { show: { resource: ['row'], operation: ['create', 'update'] } },
		options: [
			{ name: 'Map Fields', value: 'map' },
			{ name: 'JSON Batch', value: 'json' },
		],
	},
	{
		displayName: 'Row ID',
		name: 'rowId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['row'], operation: ['update'], rowInputMode: ['map'] } },
		description: 'ID of the row to update',
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		default: { mappingMode: 'defineBelow', value: null },
		noDataExpression: true,
		required: true,
		displayOptions: {
			show: { resource: ['row'], operation: ['create', 'update'], rowInputMode: ['map'] },
		},
		typeOptions: {
			loadOptionsDependsOn: ['tableId.value'],
			resourceMapper: {
				resourceMapperMethod: 'getColumns',
				mode: 'add',
				supportAutoMap: false,
				addAllFields: false,
				allowEmptyValues: true,
				showTypeConversionOptions: false,
				fieldWords: { singular: 'column', plural: 'columns' },
			},
		},
		description:
			'Map writable columns. Use native expression values for JSON arrays or objects, and null to clear a cell. Omitted fields are unchanged on update.',
	},
	{
		displayName: 'Rows JSON',
		name: 'rowsJson',
		type: 'json',
		required: true,
		default: '[\n  { "values": {} }\n]',
		displayOptions: {
			show: { resource: ['row'], operation: ['create', 'update'], rowInputMode: ['json'] },
		},
		description:
			'Array of 1–1,000 rows. Each row has values keyed by column ID. Updates also require the row ID. Use native JSON values; null clears a cell.',
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['table', 'row'], operation: ['create'] } },
		description:
			'Optional unique key per write (up to 200 printable ASCII characters without spaces). Reuse the same key and body for a manual retry. Otherwise generated from this execution, node, run and item; a new execution gets a new key.',
	},
	{
		displayName:
			'Updates are not retried automatically. If a request times out, read the current row before retrying so you do not overwrite a later edit.',
		name: 'updateNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['row'], operation: ['update'] } },
	},
];
