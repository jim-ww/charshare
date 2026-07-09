import { describe, it, expect, beforeEach } from 'vitest';
import { categoryFilename, bundleFilename, importDataFile, DATA_CATEGORIES } from './dataExport';
import { __setChatsForTests, createChat, getChats } from '$lib/state/chats.svelte';
import { __setPersonasForTests, createPersona, getPersonas } from '$lib/state/personas.svelte';

function fileOf(name: string, content: string, type = 'application/json'): File {
	return new File([content], name, { type });
}

beforeEach(() => {
	__setChatsForTests({});
	__setPersonasForTests({});
});

describe('export filenames', () => {
	it('prefixes with the app name, category, and today\'s date', () => {
		const today = new Date().toISOString().slice(0, 10);
		expect(categoryFilename('preferences')).toBe(`charshare-preferences-${today}.json`);
		expect(categoryFilename('account')).toBe(`charshare-account-${today}.json`);
	});

	it('names a multi-category bundle as a zip with the app name and date', () => {
		const today = new Date().toISOString().slice(0, 10);
		expect(bundleFilename()).toBe(`charshare-export-${today}.zip`);
	});
});

describe('chats import', () => {
	it('restores an exported chats array, preserving ids', async () => {
		const chat = await createChat('char-1', 'Original');
		const file = fileOf('charshare-chats-2026-01-01.json', JSON.stringify(getChats(), null, 2));

		__setChatsForTests({});
		const summaries = await importDataFile(file);

		expect(summaries).toEqual([{ category: 'chats', count: 1, added: 1, updated: 0, skipped: 0 }]);
		const imported = getChats();
		expect(imported).toHaveLength(1);
		expect(imported[0].name).toBe(chat.name);
		expect(imported[0].character_id).toBe('char-1');
		expect(imported[0].id).toBe(chat.id);
	});

	it('merges re-importing the same backup instead of duplicating', async () => {
		await createChat('char-1', 'Original');
		const file = fileOf('charshare-chats-2026-01-01.json', JSON.stringify(getChats(), null, 2));

		const summaries = await importDataFile(file);

		expect(summaries).toEqual([{ category: 'chats', count: 0, added: 0, updated: 0, skipped: 1 }]);
		expect(getChats()).toHaveLength(1);
	});
});

describe('personas import', () => {
	it('restores an exported personas array, preserving ids', async () => {
		const persona = await createPersona({ name: 'Alice', description: 'A test persona' });
		const file = fileOf(
			'charshare-personas-2026-01-01.json',
			JSON.stringify(getPersonas(), null, 2)
		);

		__setPersonasForTests({});
		const summaries = await importDataFile(file);

		expect(summaries).toEqual([
			{ category: 'personas', count: 1, added: 1, updated: 0, skipped: 0 }
		]);
		const imported = getPersonas();
		expect(imported).toHaveLength(1);
		expect(imported[0].name).toBe('Alice');
		expect(imported[0].id).toBe(persona.id);
	});

	it('merges re-importing the same backup instead of duplicating', async () => {
		await createPersona({ name: 'Alice', description: 'A test persona' });
		const file = fileOf(
			'charshare-personas-2026-01-01.json',
			JSON.stringify(getPersonas(), null, 2)
		);

		const summaries = await importDataFile(file);

		expect(summaries).toEqual([
			{ category: 'personas', count: 0, added: 0, updated: 0, skipped: 1 }
		]);
		expect(getPersonas()).toHaveLength(1);
	});
});

describe('detection', () => {
	it('rejects a file with unrecognizable contents', async () => {
		const file = fileOf('mystery.json', JSON.stringify({ nothing: 'here' }));
		await expect(importDataFile(file)).rejects.toThrow("couldn't tell what kind of data this is");
	});

	it('lists every category exactly once', () => {
		const ids = DATA_CATEGORIES.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
