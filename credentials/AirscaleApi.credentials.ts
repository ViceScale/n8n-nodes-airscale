import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class AirscaleApi implements ICredentialType {
	name = 'airscaleApi';
	displayName = 'Airscale API';
	documentationUrl = 'https://docs.airscale.io/api-reference/authentication';
	icon: Icon = {
		light: 'file:../nodes/Airscale/airscale.svg',
		dark: 'file:../nodes/Airscale/airscale.dark.svg',
	};
	httpRequestNode = {
		name: 'Airscale',
		docsUrl: 'https://docs.airscale.io/api-reference/api-overview',
		apiBaseUrl: 'https://api.airscale.io',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Workspace API key from Airscale Settings. Connection testing checks your balance without spending credits.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://api.airscale.io', url: '/v1/credits', method: 'POST' },
	};
}
