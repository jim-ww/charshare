import licenseText from '../../../../../LICENSE?raw';

export const prerender = true;

export function load() {
	return { licenseText };
}
