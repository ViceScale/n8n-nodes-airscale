import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { airscaleRequest } from './transport';
import { buildLookupBody, LOOKUPS, normalizeResponse } from './lookups';
import { lookupProperties } from './lookupProperties';
import { tableProperties } from './tableProperties';
import { executeTableOperation, tableMethods } from './tables';

export class Airscale implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Airscale',
		name: 'airscale',
		icon: { light: 'file:airscale.svg', dark: 'file:airscale.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Find contact details, enrich profiles, and manage Airscale tables',
		defaults: { name: 'Airscale' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'airscaleApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'person',
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Email', value: 'email' },
					{ name: 'Person', value: 'person' },
					{ name: 'Row', value: 'row' },
					{ name: 'Table', value: 'table' },
					{ name: 'Workspace', value: 'workspace' },
				],
			},
			...lookupProperties,
			...tableProperties,
		],
	};
	methods = tableMethods;

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputs = this.getInputData();
		const results: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < inputs.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				if (resource === 'table' || resource === 'row') {
					if (this.getNode().retryOnFail && operation === 'update')
						throw new NodeOperationError(
							this.getNode(),
							'Disable Retry On Fail for updates. After an uncertain response, read the row before repeating the change.',
							{ itemIndex },
						);
					const output = await executeTableOperation.call(this, resource, operation, itemIndex);
					results.push(...output.map((json) => ({ json, pairedItem: { item: itemIndex } })));
					continue;
				}
				const spec = LOOKUPS[operation];
				if (!spec || spec.resource !== resource)
					throw new NodeOperationError(
						this.getNode(),
						'Unsupported Airscale resource or operation',
						{ itemIndex },
					);
				if (this.getNode().retryOnFail && !['credits', 'companyUrl'].includes(operation))
					throw new NodeOperationError(
						this.getNode(),
						'Disable Retry On Fail for this credit-consuming operation. The API cannot deduplicate repeated requests.',
						{ itemIndex },
					);
				const body = buildLookupBody(operation, (name) => this.getNodeParameter(name, itemIndex));
				const suppliedKey =
					operation === 'companyUrl'
						? String(this.getNodeParameter('lookupIdempotencyKey', itemIndex, '')).trim()
						: '';
				const idempotencyKey =
					operation === 'companyUrl'
						? suppliedKey ||
							`n8n-${this.getExecutionId()}-${encodeURIComponent(this.getNode().id)}-${this.evaluateExpression('{{ $runIndex }}', itemIndex)}-${itemIndex}`
						: undefined;
				try {
					const response = await airscaleRequest(this, `/v1/${spec.endpoint}`, 'POST', body, {
						idempotencyKey,
						timeout: operation === 'verifyEmail' ? 150000 : 130000,
					});
					results.push({
						json: normalizeResponse(operation, response),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (
						operation === 'companyUrl' &&
						error instanceof NodeApiError &&
						error.httpCode === '404'
					) {
						results.push({
							json: { status: 'not_found', linkedin_company_url: null },
							pairedItem: { item: itemIndex },
						});
					} else {
						// Already normalized by the transport; preserve HTTP status and safe retry guidance.
						// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
						throw error;
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					results.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
				} else if (error instanceof NodeApiError || error instanceof NodeOperationError) {
					// Preserve n8n errors and their item context without wrapping a safe error again.
					// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
					throw error;
				} else throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}
		return [results];
	}
}
