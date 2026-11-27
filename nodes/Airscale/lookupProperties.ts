import type { INodeProperties } from 'n8n-workflow';
import { LOOKUPS } from './lookups';

export const lookupProperties: INodeProperties[] = [];
for (const resource of ['person', 'company', 'email', 'workspace']) {
	const entries = Object.entries(LOOKUPS)
		.filter(([, v]) => v.resource === resource)
		.sort((a, b) => a[1].name.localeCompare(b[1].name));
	lookupProperties.push({
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		default: '',
		options: entries.map(([key, v]) => ({
			name: v.name,
			value: key,
			description: v.help,
			action: v.name,
		})),
	});
	lookupProperties[lookupProperties.length - 1].default = entries[0][0];
}
const fields: Record<string, { label: string; placeholder: string }> = {
	profileUrl: { label: 'Profile URL', placeholder: 'https://www.linkedin.com/in/example-person' },
	firstName: { label: 'First Name', placeholder: 'Sample' },
	lastName: { label: 'Last Name', placeholder: 'Person' },
	companyName: { label: 'Company Name', placeholder: 'Example Company' },
	domain: { label: 'Domain', placeholder: 'example.com' },
	email: { label: 'Email', placeholder: 'person@example.com' },
	phone: { label: 'Phone', placeholder: '+12025550147' },
};
for (const [param, field] of Object.entries(fields)) {
	lookupProperties.push({
		displayName: field.label,
		name: param,
		type: 'string',
		required: true,
		default: '',
		placeholder: field.placeholder,
		displayOptions: {
			show: {
				operation: Object.entries(LOOKUPS)
					.filter(([, v]) => param in v.fields)
					.map(([key]) => key),
			},
		},
	});
}
lookupProperties.push(
	{
		displayName: 'Verify Personal Email',
		name: 'verification',
		type: 'boolean',
		default: false,
		description: 'Whether to verify the returned personal email; this may affect credit usage',
		displayOptions: { show: { operation: ['personalEmail'] } },
	},
	{
		displayName: 'Idempotency Key',
		name: 'lookupIdempotencyKey',
		type: 'string',
		default: '',
		description:
			'Optional stable business-operation key. An execution-specific key is generated when blank. Reuse the same key and domain after an uncertain result; a manual rerun otherwise starts a new paid operation.',
		displayOptions: { show: { operation: ['companyUrl'] } },
	},
	{
		displayName:
			'Credit-consuming lookups run once per input item. Retry On Fail is blocked where the API cannot deduplicate calls; manually rerunning can still charge again. See <a href="https://docs.airscale.io/api-reference/api-overview" target="_blank">current API pricing</a>.',
		name: 'creditNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['person', 'company', 'email'] } },
	},
	{
		displayName:
			'Professional email discovery is asynchronous. Use Airscale Email to submit contacts and Airscale Email Results to receive results. Publish the results workflow before submitting contacts.',
		name: 'emailNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['person', 'email'] } },
	},
);
