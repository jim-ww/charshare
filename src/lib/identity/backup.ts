import type { ISEAPair } from 'gun';
import type { Keyring } from '$lib/types';

/** Plain-JSON export of a keyring, versioned so future format changes don't
 *  break old exports (see spec: schema `version` fields). Framed to users as
 *  "back up / use an existing account" rather than "export your private
 *  key" — same thing, less alarming wording, still calls out the risk. */
interface AccountBackupV1 {
	version: 1;
	pair: ISEAPair;
}

export function exportAccountBackup(keyring: Keyring): string {
	const backup: AccountBackupV1 = { version: 1, pair: keyring.pair };
	return JSON.stringify(backup, null, 2);
}

export function parseAccountBackup(json: string): Keyring {
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
	return { publicKey: d.pair.pub, pair: d.pair };
}
