import type { ICredentialType, INodeProperties, Icon, ICredentialTestFunction } from 'n8n-workflow';
import { validSecret } from '../nodes/AirscaleEmail/callback';

export class AirscaleCallbackApi implements ICredentialType {
	name = 'airscaleCallbackApi';
	// This credential holds an inbound webhook secret, not a remote API key.
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-missing-api
	displayName = 'Airscale Callback Secret';
	documentationUrl = 'https://github.com/ViceScale/n8n-nodes-airscale#professional-email-results';
	icon: Icon = {
		light: 'file:../nodes/Airscale/airscale.svg',
		dark: 'file:../nodes/Airscale/airscale.dark.svg',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'Callback Secret',
			name: 'callbackSecret',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A random secret of at least 32 characters, without spaces. Use the same credential in Airscale Email and Airscale Email Results. This is not your Airscale API key.',
		},
	];
	test: ICredentialTestFunction = async function (credential) {
		return validSecret(credential.data?.callbackSecret)
			? {
					status: 'OK',
					message:
						'Secret format is valid. Use the same credential in both email nodes and verify delivery with an active Results workflow.',
				}
			: {
					status: 'Error',
					message: 'Use a random callback secret of 32–512 characters without spaces.',
				};
	};
}
