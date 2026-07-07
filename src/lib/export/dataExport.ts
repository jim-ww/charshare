import { zipSync, strToU8 } from 'fflate';
import { getKeyring } from '$lib/state/auth.svelte';
import { exportAccountBackup } from '$lib/identity/backup';
import { getMyCharacters } from '$lib/state/characters.svelte';
import { getPersonas } from '$lib/state/personas.svelte';
import { getChats } from '$lib/state/chats.svelte';
import { getPreferences } from '$lib/state/preferences.svelte';

export type DataCategory = 'account' | 'characters' | 'personas' | 'chats' | 'preferences';

export const DATA_CATEGORIES: { id: DataCategory; label: string; description: string }[] = [
	{
		id: 'account',
		label: 'Account',
		description: 'Your private key — treat this like a password.'
	},
	{
		id: 'characters',
		label: 'My characters',
		description: 'Local-only drafts and characters you\'ve published, together.'
	},
	{ id: 'personas', label: 'Personas', description: 'All personas you play as.' },
	{ id: 'chats', label: 'Chats', description: 'Every conversation, with all branches.' },
	{
		id: 'preferences',
		label: 'Preferences',
		description: 'Theme, blocked tags, AI provider settings — including any API keys you\'ve entered.'
	}
];

function buildCategory(category: DataCategory): { filename: string; json: string } | null {
	switch (category) {
		case 'account': {
			const keyring = getKeyring();
			if (!keyring) return null;
			return { filename: 'account.json', json: exportAccountBackup(keyring) };
		}
		case 'characters':
			return { filename: 'characters.json', json: JSON.stringify(getMyCharacters(), null, 2) };
		case 'personas':
			return { filename: 'personas.json', json: JSON.stringify(getPersonas(), null, 2) };
		case 'chats':
			return { filename: 'chats.json', json: JSON.stringify(getChats(), null, 2) };
		case 'preferences':
			return { filename: 'preferences.json', json: JSON.stringify(getPreferences(), null, 2) };
	}
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** Exports the selected data categories. A single category downloads as one
 *  plain JSON file; multiple categories are bundled into a zip so the user
 *  gets one download instead of several browser save prompts. */
export function exportData(categories: DataCategory[]): void {
	const parts = categories
		.map(buildCategory)
		.filter((p): p is { filename: string; json: string } => p !== null);
	if (parts.length === 0) return;

	if (parts.length === 1) {
		const [part] = parts;
		downloadBlob(new Blob([part.json], { type: 'application/json' }), part.filename);
		return;
	}

	const files: Record<string, Uint8Array> = {};
	for (const part of parts) files[part.filename] = strToU8(part.json);
	const zipped = zipSync(files);
	downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), 'charshare-export.zip');
}
