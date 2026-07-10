import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { getKeyring, setKeyring } from '$lib/state/auth.svelte';
import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';
import { loadProfileForSwitchedAccount } from '$lib/state/profile.svelte';
import { getMyCharacters, restoreCharacter } from '$lib/state/characters.svelte';
import { getSavedCharacters, restoreSavedCharacter } from '$lib/state/savedCharacters.svelte';
import { getPersonas, restorePersona } from '$lib/state/personas.svelte';
import { getChats, restoreChat } from '$lib/state/chats.svelte';
import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
import { getMyProfile } from '$lib/state/profile.svelte';
import { isWailsDesktop, saveFile } from '$lib/wails';
import type { Character, Chat, Persona, Preferences } from '$lib/types';
import { m } from '$lib/paraglide/messages.js';

export type DataCategory = 'account' | 'characters' | 'savedCharacters' | 'personas' | 'chats' | 'preferences';

/** Fixed id order — labels/descriptions are locale-dependent (see
 *  dataCategories()) but the set/order of ids themselves is not. */
export const CATEGORY_IDS: DataCategory[] = [
	'account',
	'characters',
	'savedCharacters',
	'personas',
	'chats',
	'preferences'
];

export function dataCategories(): { id: DataCategory; label: string; description: string }[] {
	return [
		{ id: 'account', label: m.data_category_account_label(), description: m.data_category_account_description() },
		{
			id: 'characters',
			label: m.data_category_characters_label(),
			description: m.data_category_characters_description()
		},
		{
			id: 'savedCharacters',
			label: m.data_category_savedCharacters_label(),
			description: m.data_category_savedCharacters_description()
		},
		{ id: 'personas', label: m.data_category_personas_label(), description: m.data_category_personas_description() },
		{ id: 'chats', label: m.data_category_chats_label(), description: m.data_category_chats_description() },
		{
			id: 'preferences',
			label: m.data_category_preferences_label(),
			description: m.data_category_preferences_description()
		}
	];
}


const APP_NAME = 'charshare';

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Sanitizes a username for use in a filename — strips anything that isn't
 *  alphanumeric, a dash, or an underscore. */
function sanitizeForFilename(name: string): string {
	return name.trim().replace(/[^a-zA-Z0-9-_]+/g, '_');
}

export function categoryFilename(category: DataCategory): string {
	if (category === 'account') {
		const username = getMyProfile()?.username;
		const suffix = username ? `-${sanitizeForFilename(username)}` : '';
		return `${APP_NAME}-${category}${suffix}-${dateStamp()}.json`;
	}
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
			return {
				filename: categoryFilename(category),
				json: exportAccountBackup(keyring, getMyProfile())
			};
		}
		case 'characters':
			return {
				filename: categoryFilename(category),
				json: JSON.stringify(getMyCharacters(), null, 2)
			};
		case 'savedCharacters':
			return {
				filename: categoryFilename(category),
				json: JSON.stringify(getSavedCharacters(), null, 2)
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

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** In the Wails desktop build, a browser-style `<a download>`/blob-URL click
 *  has no browser chrome to catch the download — the webview just does
 *  nothing. Route through the native "Save As" dialog there instead. */
async function downloadBlob(bytes: Uint8Array, filename: string): Promise<void> {
	if (isWailsDesktop()) {
		const err = await saveFile(filename, bytesToBase64(bytes));
		if (err) throw new Error(err);
		return;
	}
	const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** Exports the selected data categories. A single category downloads as one
 *  plain JSON file; multiple categories are bundled into a zip so the user
 *  gets one download instead of several browser save prompts. */
export async function exportData(categories: DataCategory[]): Promise<void> {
	const parts = categories
		.map(buildCategory)
		.filter((p): p is { filename: string; json: string } => p !== null);
	if (parts.length === 0) return;

	if (parts.length === 1) {
		const [part] = parts;
		await downloadBlob(strToU8(part.json), part.filename);
		return;
	}

	const files: Record<string, Uint8Array> = {};
	for (const part of parts) files[part.filename] = strToU8(part.json);
	const zipped = zipSync(files);
	await downloadBlob(zipped, bundleFilename());
}

// ---- import ----

export interface ImportSummary {
	category: DataCategory;
	/** Number of items imported, for the list-shaped categories. */
	count?: number;
	/** How many of `count` were new vs. replaced an existing item with the
	 *  same id vs. left untouched because an existing item was preferred —
	 *  only set for categories that dedupe by id (characters/personas/chats). */
	added?: number;
	updated?: number;
	skipped?: number;
}

/** Tallies restore outcomes ('added' | 'updated' | 'skipped') into the
 *  count/added/updated/skipped shape ImportSummary expects. */
function summarizeRestoreResults(
	category: DataCategory,
	results: ('added' | 'updated' | 'skipped')[]
): ImportSummary {
	const added = results.filter((r) => r === 'added').length;
	const updated = results.filter((r) => r === 'updated').length;
	const skipped = results.filter((r) => r === 'skipped').length;
	return { category, count: added + updated, added, updated, skipped };
}

/** Guesses which category a file holds — first from its filename (our own
 *  exports are always named `charshare-<category>-<date>.json`, so this
 *  covers the normal case), falling back to sniffing the parsed shape for
 *  files the user renamed. */
function detectCategory(filename: string, parsed: unknown): DataCategory | null {
	const lower = filename.toLowerCase();
	// Longest id first — "savedCharacters" contains "characters" as a
	// substring, so checking the shorter id first would misdetect a
	// "charshare-savedcharacters-....json" filename as plain "characters".
	const idsByLengthDesc = [...CATEGORY_IDS].sort((a, b) => b.length - a.length);
	for (const category of idsByLengthDesc) {
		if (lower.includes(category.toLowerCase())) return category;
	}
	if (Array.isArray(parsed)) {
		const [first] = parsed as Record<string, unknown>[];
		if (!first) return null;
		if ('auto_name' in first) return 'personas';
		if ('messages' in first && 'character_id' in first) return 'chats';
		// A renamed characters/savedCharacters export can't be told apart by
		// shape alone (both are Character[]) — defaults to 'characters' here,
		// an accepted limitation since filename detection above is the normal path.
		if ('system_prompt' in first || 'personality' in first) return 'characters';
		return null;
	}
	if (parsed && typeof parsed === 'object') {
		const obj = parsed as Record<string, unknown>;
		if ('pair' in obj && obj.pair && typeof (obj.pair as { pub?: unknown }).pub === 'string') return 'account';
		if ('providerConfigs' in obj || 'theme' in obj) return 'preferences';
	}
	return null;
}

async function importAccountFile(json: string): Promise<void> {
	const backup = parseAccountBackup(json);
	await setKeyring({ publicKey: backup.pair.pub, pair: backup.pair });
	await loadProfileForSwitchedAccount(backup.profileFields);
}

/** Restores a full "characters" backup, preserving each character's original
 *  id — re-restoring the same backup merges by id (see restoreCharacter)
 *  instead of piling up duplicates like the single-item share/import flow. */
async function importCharactersFile(json: string): Promise<ImportSummary> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error(m.data_export_error_not_valid_characters());
	const results: ('added' | 'updated' | 'skipped')[] = [];
	for (const item of parsed as Character[]) {
		results.push(await restoreCharacter(item));
	}
	return summarizeRestoreResults('characters', results);
}

/** Restores a "saved characters" backup — always overwrites by id (no
 *  version-conflict prompt like restoreCharacter needs, since saved
 *  characters have no local edit chain of our own to protect). */
async function importSavedCharactersFile(json: string): Promise<ImportSummary> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error(m.data_export_error_not_valid_saved_characters());
	const results: ('added' | 'updated' | 'skipped')[] = [];
	for (const item of parsed as Character[]) {
		results.push(await restoreSavedCharacter(item));
	}
	return summarizeRestoreResults('savedCharacters', results);
}

async function importPersonasFile(json: string): Promise<ImportSummary> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error(m.data_export_error_not_valid_personas());
	const results: ('added' | 'updated' | 'skipped')[] = [];
	for (const item of parsed as Persona[]) {
		results.push(await restorePersona(item));
	}
	return summarizeRestoreResults('personas', results);
}

async function importChatsFile(json: string): Promise<ImportSummary> {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error(m.data_export_error_not_valid_chats());
	const results: ('added' | 'updated' | 'skipped')[] = [];
	for (const item of parsed as Chat[]) {
		results.push(await restoreChat(item));
	}
	return summarizeRestoreResults('chats', results);
}

async function importPreferencesFile(json: string): Promise<void> {
	const parsed: unknown = JSON.parse(json);
	if (typeof parsed !== 'object' || parsed === null) throw new Error(m.data_export_error_not_valid_preferences());
	await updatePreferences(parsed as Partial<Preferences>);
}

async function importOne(filename: string, json: string): Promise<ImportSummary> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error(m.data_export_error_not_json({ filename }));
	}
	const category = detectCategory(filename, parsed);
	if (!category) throw new Error(m.data_export_error_unknown_category({ filename }));
	switch (category) {
		case 'account':
			await importAccountFile(json);
			return { category };
		case 'characters':
			return importCharactersFile(json);
		case 'savedCharacters':
			return importSavedCharactersFile(json);
		case 'personas':
			return importPersonasFile(json);
		case 'chats':
			return importChatsFile(json);
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
