import licenseText from '../../../../../LICENSE?raw';
import assetsLicenseText from '../../../../../LICENSE-ASSETS?raw';

export const prerender = true;

export function load() {
	return { licenseText, assetsLicenseText };
}
