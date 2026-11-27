import type { ICredentialType, INodeProperties, Icon, ICredentialTestFunction } from 'n8n-workflow';
import { validSecret } from '../nodes/AirscaleEmail/callback';

export class AirscaleCallbackApi implements ICredentialType {
	name = 'airscaleCallbackApi';
	// Retained so users can retrieve their previous secret while migrating from 0.1.1.
	displayName = 'Airscale Legacy Callback API';
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
				'Legacy credential from 0.1.1. Copy this secret into the Callback Secret field of your Airscale API credential, then select that credential in both email nodes.',
		},
	];
	test: ICredentialTestFunction = async function (credential) {
		return validSecret(credential.data?.callbackSecret)
			? {
					status: 'OK',
					message:
						'Secret format is valid. Migrate it to your Airscale API credential and select that credential in both email nodes.',
				}
			: {
					status: 'Error',
					message: 'Use a random callback secret of 32–512 characters without spaces.',
				};
	};
}
