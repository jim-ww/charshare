import type { ISEAPair } from 'gun';
import type { Keyring, User } from '$lib/types';

/** Plain-JSON export of a keyring, versioned so future format changes don't
 *  break old exports (see spec: schema `version` fields). Framed to users as
 *  "back up / use an existing account" rather than "export your private
 *  key" — same thing, less alarming wording, still calls out the risk.
 *
 *  Carries the profile fields too (not just the keypair) so restoring on a
 *  fresh browser shows the right username/avatar immediately, without
 *  depending on GUN still having (and serving) that pubkey's profile. */
interface AccountBackupV1 {
	version: 1;
	pair: ISEAPair;
	username?: string;
	description?: string;
	image_url?: string;
}

export interface AccountBackup {
	pair: ISEAPair;
	profileFields?: { username: string; description: string; image_url?: string };
}

export function exportAccountBackup(keyring: Keyring, profile?: User | null): string {
	const backup: AccountBackupV1 = {
		version: 1,
		pair: keyring.pair,
		...(profile
			? {
					username: profile.username,
					description: profile.description,
					...(profile.image_url ? { image_url: profile.image_url } : {})
				}
			: {})
	};
	return JSON.stringify(backup, null, 2);
}

export function parseAccountBackup(json: string): AccountBackup {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		throw new Error('That doesn\'t look like a valid backup file.');
	}
	const d = data as Partial<AccountBackupV1> | null;
	if (!d || d.version !== 1 || !d.pair || typeof d.pair.pub !== 'string' || typeof d.pair.priv !== 'string') {
		throw new Error('Unrecognized backup format.');
	}
	return {
		pair: d.pair,
		...(typeof d.username === 'string' && typeof d.description === 'string'
			? { profileFields: { username: d.username, description: d.description, ...(d.image_url ? { image_url: d.image_url } : {}) } }
			: {})
	};
}
