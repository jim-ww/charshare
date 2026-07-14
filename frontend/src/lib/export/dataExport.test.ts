import { describe, it, expect, beforeEach, vi } from 'vitest';
import { categoryFilename, bundleFilename, importDataFile, CATEGORY_IDS } from './dataExport';
import { __setChatsForTests, createChat, getChats } from '$lib/state/chats.svelte';
import { __setPersonasForTests, createPersona, getPersonas } from '$lib/state/personas.svelte';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/nostr/keys';
import { __setPoolForTests } from '$lib/nostr/pool';
import { createFakePool } from '$lib/nostr/testUtils';
import type { Character } from '$lib/types';
import type { SavedCharacterEntry } from '$lib/db/savedCharacters';
import type { LocalCharacterEntry } from '$lib/db/characters';

// $lib/db/characters wraps idb-keyval, which needs a real IndexedDB that
// isn't available under plain Node/vitest — same in-memory swap as
// characters-relay-resync.test.ts, so the "characters" category's own
// restoreCharacter/keepPublished path can be exercised here.
let characterEntryStore = new Map<string, LocalCharacterEntry>();
vi.mock('$lib/db/characters', () => ({
	loadMyCharacterEntries: async () => Array.from(characterEntryStore.values()),
	addPublishedCharacterId: async (id: string, character?: unknown) => {
		const existing = characterEntryStore.get(id);
		characterEntryStore.set(id, {
			id,
			published: true,
			character: (character ?? existing?.character) as never,
			keepPublished: existing?.keepPublished
		});
	},
	saveLocalOnlyCharacter: async (character: { id: string }) => {
		const existing = characterEntryStore.get(character.id);
		characterEntryStore.set(character.id, {
			id: character.id,
			published: false,
			character: character as never,
			keepPublished: existing?.keepPublished
		});
	},
	removeMyCharacterEntry: async (id: string) => {
		characterEntryStore.delete(id);
	},
	setKeepPublished: async (id: string, keepPublished: boolean) => {
		const existing = characterEntryStore.get(id);
		if (!existing) return;
		characterEntryStore.set(id, { ...existing, keepPublished });
	}
}));

const { __refreshCharactersForTests } = await import('$lib/state/characters.svelte');

// idb-keyval needs a real IndexedDB that isn't available under plain
// Node/vitest — swap it for an in-memory map so updatePreferences (used by
// the preferences import path) doesn't throw.
let idbStore = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
	get: async (key: string) => idbStore.get(key),
	set: async (key: string, value: unknown) => {
		idbStore.set(key, value);
	}
}));

// $lib/db/savedCharacters wraps idb-keyval, which needs a real IndexedDB that
// isn't available under plain Node/vitest — swap it for an in-memory map,
// same pattern as characters-relay-resync.test.ts / savedCharacters.svelte.test.ts.
let savedCharacterStore = new Map<string, SavedCharacterEntry>();
vi.mock('$lib/db/savedCharacters', () => ({
	loadSavedCharacterEntries: async () => Object.fromEntries(savedCharacterStore),
	saveCharacterEntry: async (character: Character, auto: boolean) => {
		const existing = savedCharacterStore.get(character.id);
		savedCharacterStore.set(character.id, { character, auto: existing ? existing.auto && auto : auto });
	},
	removeSavedCharacterEntry: async (id: string) => {
		savedCharacterStore.delete(id);
	}
}));

// The conflict prompt is a singleton UI modal (GlobalConfirmDialog) that
// state modules await external resolution of — swap it for a controllable
// mock so "Replace All" propagation (see importConflict.ts) can be tested
// without mounting the component tree.
const confirmDialogWithExtra = vi.fn(async (_request: unknown) => 'confirm' as 'confirm' | 'extra' | 'cancel');
vi.mock('$lib/state/confirmDialog.svelte', () => ({
	confirmDialogWithExtra: (request: unknown) => confirmDialogWithExtra(request)
}));

const { getSavedCharacters } = await import('$lib/state/savedCharacters.svelte');
const { __setPreferencesForTests, getPreferences, DEFAULT_PREFERENCES } = await import(
	'$lib/state/preferences.svelte'
);

function makeCharacter(id: string): Character {
	return {
		id,
		version: 1,
		name: `Character ${id}`,
		media: [],
		description: '',
		personality: '',
		scenario: '',
		tags: [],
		nsfw: false,
		language: 'en',
		system_prompt: '',
		first_message: '',
		alternate_greetings: [],
		example_dialogues: [],
		comments_enabled: true,
		slideshow_enabled: false,
		forked_from: null,
		author: 'author-pub',
		created_at: 1,
		updated_at: 1,
		deleted: false,
		deleted_at: null
	};
}

function fileOf(name: string, content: string, type = 'application/json'): File {
	return new File([content], name, { type });
}

beforeEach(() => {
	__setChatsForTests({});
	__setPersonasForTests({});
	savedCharacterStore = new Map();
	idbStore = new Map();
	characterEntryStore = new Map();
	__setPreferencesForTests(DEFAULT_PREFERENCES);
	confirmDialogWithExtra.mockReset();
	confirmDialogWithExtra.mockResolvedValue('confirm');
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

	it('"Replace All" on the first conflict resolves every later conflict without re-prompting', async () => {
		const alice = await createPersona({ name: 'Alice', description: 'original' });
		const bob = await createPersona({ name: 'Bob', description: 'original' });
		const file = fileOf(
			'charshare-personas-2026-01-01.json',
			JSON.stringify(getPersonas(), null, 2)
		);

		// Diverge both personas locally (same id, different content) so
		// re-importing the backup below conflicts for both.
		__setPersonasForTests({
			[alice.id]: { ...alice, description: 'local edit' },
			[bob.id]: { ...bob, description: 'local edit' }
		});
		confirmDialogWithExtra.mockResolvedValueOnce('extra');

		const summaries = await importDataFile(file);

		expect(confirmDialogWithExtra).toHaveBeenCalledTimes(1);
		expect(summaries).toEqual([
			{ category: 'personas', count: 2, added: 0, updated: 2, skipped: 0 }
		]);
		const imported = getPersonas();
		expect(imported.find((p) => p.id === alice.id)?.description).toBe('original');
		expect(imported.find((p) => p.id === bob.id)?.description).toBe('original');
	});
});

describe('characters import', () => {
	it("round-trips a local-only character's \"keep published\" setting through export and re-import", async () => {
		const { pool } = createFakePool();
		__setPoolForTests(pool);
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		const { createOrEditCharacter, getMyCharacters, isKeepPublished, setCharacterKeepPublished } = await import(
			'$lib/state/characters.svelte'
		);
		const draft = makeCharacter('char-1');
		const character = await createOrEditCharacter(
			{
				name: draft.name,
				media: draft.media,
				description: draft.description,
				personality: draft.personality,
				scenario: draft.scenario,
				tags: draft.tags,
				nsfw: draft.nsfw,
				language: draft.language,
				system_prompt: draft.system_prompt,
				first_message: draft.first_message,
				alternate_greetings: draft.alternate_greetings,
				example_dialogues: draft.example_dialogues,
				comments_enabled: draft.comments_enabled,
				slideshow_enabled: draft.slideshow_enabled
			},
			{ localOnly: true }
		);
		await setCharacterKeepPublished(character.id, true);
		expect(isKeepPublished(character.id)).toBe(true);

		const file = fileOf(
			'charshare-characters-2026-01-01.json',
			JSON.stringify(getMyCharacters().map((c) => ({ ...c, keep_published: isKeepPublished(c.id) })), null, 2)
		);

		// Simulate restoring onto a fresh browser with no local index yet.
		characterEntryStore = new Map();
		await __refreshCharactersForTests();

		const summaries = await importDataFile(file);

		expect(summaries).toEqual([
			{ category: 'characters', count: 1, added: 1, updated: 0, skipped: 0 }
		]);
		expect(isKeepPublished(character.id)).toBe(true);
	});
});

describe('saved characters import', () => {
	it('restores an exported saved-characters array, preserving ids', async () => {
		const character = makeCharacter('char-1');
		const file = fileOf(
			'charshare-savedCharacters-2026-01-01.json',
			JSON.stringify([character], null, 2)
		);

		const summaries = await importDataFile(file);

		expect(summaries).toEqual([
			{ category: 'savedCharacters', count: 1, added: 1, updated: 0, skipped: 0 }
		]);
		expect(getSavedCharacters()).toEqual([character]);
	});

	it("doesn't misdetect a saved-characters filename as plain 'characters'", async () => {
		// "savedcharacters" contains "characters" as a substring — regression
		// test for the filename-sniffing collision in detectCategory().
		const character = makeCharacter('char-2');
		const file = fileOf(
			'charshare-savedCharacters-2026-01-01.json',
			JSON.stringify([character], null, 2)
		);

		const [summary] = await importDataFile(file);

		expect(summary.category).toBe('savedCharacters');
	});
});

describe('preferences import', () => {
	it("backfills a provider missing from an older backup instead of leaving it undefined", async () => {
		// Simulates importing a backup taken with an older app version, before
		// the 'openai_compatible' provider existed — its providerConfigs entry
		// (and the active provider itself, in this case) is simply absent.
		const { openai_compatible: _omitted, ...oldProviderConfigs } = DEFAULT_PREFERENCES.providerConfigs;
		const oldBackup = {
			...DEFAULT_PREFERENCES,
			provider: DEFAULT_PREFERENCES.providerConfigs.huggingface,
			providerConfigs: oldProviderConfigs
		};
		const file = fileOf('charshare-preferences-2025-01-01.json', JSON.stringify(oldBackup, null, 2));

		await importDataFile(file);

		expect(getPreferences().providerConfigs.openai_compatible).toEqual(
			DEFAULT_PREFERENCES.providerConfigs.openai_compatible
		);
	});

	it("doesn't clobber the active provider with an undefined one from a malformed import", async () => {
		const file = fileOf(
			'charshare-preferences-2025-01-01.json',
			JSON.stringify({ ...DEFAULT_PREFERENCES, provider: undefined }, null, 2)
		);

		await importDataFile(file);

		expect(getPreferences().provider).toEqual(DEFAULT_PREFERENCES.provider);
	});
});

describe('detection', () => {
	it('rejects a file with unrecognizable contents', async () => {
		const file = fileOf('mystery.json', JSON.stringify({ nothing: 'here' }));
		await expect(importDataFile(file)).rejects.toThrow("couldn't tell what kind of data this is");
	});

	it('lists every category exactly once', () => {
		expect(new Set(CATEGORY_IDS).size).toBe(CATEGORY_IDS.length);
	});
});
