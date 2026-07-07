import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { getKeyring, setKeyring } from '$lib/state/auth.svelte';
import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';
import { loadProfileForSwitchedAccount } from '$lib/state/profile.svelte';
import {
	getMyCharacters,
	createOrEditCharacter,
	importCharacterDraft
} from '$lib/state/characters.svelte';
import { getPersonas, createPersona, importPersonaDraft } from '$lib/state/personas.svelte';
import { getChats, importChat } from '$lib/state/chats.svelte';
import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
import type { Preferences } from '$lib/types';

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
		description: "Local-only drafts and characters you've published, together."
	},
	{ id: 'personas', label: 'Personas', description: 'All personas you play as.' },
	{ id: 'chats', label: 'Chats', description: 'Every conversation, with all branches.' },
	{
		id: 'preferences',
		label: 'Preferences',
		description: "Theme, blocked tags, AI provider settings — including any API keys you've entered."
	}
];

const APP_NAME = 'charshare';

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

export function categoryFilename(category: DataCategory): string {
	return `${APP_NAME}-${category}-${dateStamp()}.json`;
}

export function bundleFilename(): string {
	return `${APP_NAME}-export-${dateStamp()}.zip`;
}

// ---- export ----

function buildCategory(category: DataCategory): { filename: string; json: string } | null {
	switch (category) {
		case 'account': {
			const keyring = getKeyring();
			if (!keyring) return null;
			return { filename: categoryFilename(category), json: exportAccountBackup(keyring) };
		}
		case 'characters':
			return {
				filename: categoryFilename(category),
				json: JSON.stringify(getMyCharacters(), null, 2)
			};
		case 'personas':
			return {
				filename: categoryFilename(category),
				json: JSON.stringify(getPersonas(), null, 2)
			};
		case 'chats':
			return { filename: categoryFilename(category), json: JSON.stringify(getChats(), null, 2) };
		case 'preferences':
			return {
				filename: categoryFilename(category),
				json: JSON.stringify(getPreferences(), null, 2)
			};
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
	downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), bundleFilename());
}

// ---- import ----

export interface ImportSummary {
	category: DataCategory;
	/** Number of items imported, for the list-shaped categories. */
	count?: number;
}

/** Guesses which category a file holds — first from its filename (our own
 *  exports are always named `charshare-<category>-<date>.json`, so this
 *  covers the normal case), falling back to sniffing the parsed shape for
 *  files the user renamed. */
function detectCategory(filename: string, parsed: unknown): DataCategory | null {
	const lower = filename.toLowerCase();
	for (const category of DATA_CATEGORIES.map((c) => c.id)) {
		if (lower.includes(category)) return category;
	}
	if (Array.isArray(parsed)) {
		const [first] = parsed as Record<string, unknown>[];
		if (!first) return null;
		if ('auto_name' in first) return 'personas';
		if ('messages' in first && 'character_id' in first) return 'chats';
		if ('system_prompt' in first || 'personality' in first) return 'characters';
		return null;
	}
	if (parsed && typeof parsed === 'object') {
		const obj = parsed as Record<string, unknown>;
		if ('privateKey' in obj && 'publicKey' in obj) return 'account';
		if ('providerConfigs' in obj || 'theme' in obj) return 'preferences';
	}
	return null;
}

async function importAccountFile(json: string): Promise<void> {
	const keyring = parseAccountBackup(json);
	await setKeyring(keyring);
	await loadProfileForSwitchedAccount();
}

async function importCharactersFile(json: string): Promise<number> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('Not a valid characters export.');
	let count = 0;
	for (const item of parsed) {
		const draft = importCharacterDraft(JSON.stringify(item));
		await createOrEditCharacter(draft, { localOnly: true });
		count++;
	}
	return count;
}

async function importPersonasFile(json: string): Promise<number> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('Not a valid personas export.');
	let count = 0;
	for (const item of parsed) {
		const draft = importPersonaDraft(JSON.stringify(item));
		await createPersona(draft);
		count++;
	}
	return count;
}

async function importChatsFile(json: string): Promise<number> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('Not a valid chats export.');
	let count = 0;
	for (const item of parsed as Record<string, unknown>[]) {
		const characterId = item.character_id;
		if (typeof characterId !== 'string') continue;
		const personaId = typeof item.persona_id === 'string' ? item.persona_id : null;
		await importChat(characterId, JSON.stringify(item), personaId);
		count++;
	}
	return count;
}

async function importPreferencesFile(json: string): Promise<void> {
	const parsed: unknown = JSON.parse(json);
	if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a valid preferences export.');
	await updatePreferences(parsed as Partial<Preferences>);
}

async function importOne(filename: string, json: string): Promise<ImportSummary> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error(`${filename}: not valid JSON.`);
	}
	const category = detectCategory(filename, parsed);
	if (!category) throw new Error(`${filename}: couldn't tell what kind of data this is.`);
	switch (category) {
		case 'account':
			await importAccountFile(json);
			return { category };
		case 'characters':
			return { category, count: await importCharactersFile(json) };
		case 'personas':
			return { category, count: await importPersonasFile(json) };
		case 'chats':
			return { category, count: await importChatsFile(json) };
		case 'preferences':
			await importPreferencesFile(json);
			return { category };
	}
}

/** Imports a previously exported file — either a single category's JSON, or
 *  a zip bundle produced when exporting more than one category at once. */
export async function importDataFile(file: File): Promise<ImportSummary[]> {
	const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
	if (!isZip) {
		return [await importOne(file.name, await file.text())];
	}
	const buffer = new Uint8Array(await file.arrayBuffer());
	const entries = unzipSync(buffer);
	// Account first, if present — characters/personas imported afterward get
	// signed under whichever keyring is active at that point.
	const names = Object.keys(entries).sort((a, b) =>
		a.toLowerCase().includes('account') === b.toLowerCase().includes('account')
			? 0
			: a.toLowerCase().includes('account')
				? -1
				: 1
	);
	const summaries: ImportSummary[] = [];
	for (const name of names) {
		summaries.push(await importOne(name, strFromU8(entries[name])));
	}
	return summaries;
}
