import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SavedCharacterEntry } from '$lib/db/savedCharacters';
import type { Character } from '$lib/types';

// $lib/db/savedCharacters wraps idb-keyval, which needs a real IndexedDB that
// isn't available under plain Node/vitest — swap it for an in-memory map, same
// pattern as characters-relay-resync.test.ts.
let entryStore = new Map<string, SavedCharacterEntry>();
vi.mock('$lib/db/savedCharacters', () => ({
	loadSavedCharacterEntries: async () => Object.fromEntries(entryStore),
	saveCharacterEntry: async (character: Character, auto: boolean) => {
		const existing = entryStore.get(character.id);
		entryStore.set(character.id, { character, auto: existing ? existing.auto && auto : auto });
	},
	removeSavedCharacterEntry: async (id: string) => {
		entryStore.delete(id);
	}
}));

const {
	initSavedCharacters,
	getSavedCharacters,
	getSavedCharacter,
	isCharacterSaved,
	isCharacterAutoSaved,
	saveCharacterLocally,
	unsaveCharacter
} = await import('./savedCharacters.svelte');

function makeCharacter(id: string, overrides: Partial<Character> = {}): Character {
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
		forked_from: null,
		author: 'author-pub',
		created_at: 1,
		updated_at: 1,
		deleted: false,
		deleted_at: null,
		...overrides
	} as Character;
}

beforeEach(async () => {
	entryStore = new Map();
	await initSavedCharacters();
});

describe('saveCharacterLocally / unsaveCharacter', () => {
	it('saves and lists a character', async () => {
		const character = makeCharacter('char-1');
		await saveCharacterLocally(character, { auto: false });
		expect(isCharacterSaved('char-1')).toBe(true);
		expect(getSavedCharacter('char-1')).toEqual(character);
		expect(getSavedCharacters()).toEqual([character]);
	});

	it('removes a saved character', async () => {
		const character = makeCharacter('char-1');
		await saveCharacterLocally(character);
		await unsaveCharacter('char-1');
		expect(isCharacterSaved('char-1')).toBe(false);
		expect(getSavedCharacter('char-1')).toBeUndefined();
	});

	it('keeps a deliberate manual save from being demoted by a later auto-save', async () => {
		const character = makeCharacter('char-1');
		await saveCharacterLocally(character, { auto: false });
		await saveCharacterLocally({ ...character, version: 2 }, { auto: true });
		expect(isCharacterAutoSaved('char-1')).toBe(false);
		expect(getSavedCharacter('char-1')?.version).toBe(2);
	});

	it('marks an auto-save as such', async () => {
		const character = makeCharacter('char-2');
		await saveCharacterLocally(character, { auto: true });
		expect(isCharacterAutoSaved('char-2')).toBe(true);
	});

	it('keeps a tombstoned character visible once saved', async () => {
		const character = makeCharacter('char-3');
		await saveCharacterLocally(character, { auto: false });
		await saveCharacterLocally({ ...character, deleted: true, deleted_at: 2 }, { auto: false });
		expect(getSavedCharacter('char-3')?.deleted).toBe(true);
	});

	it("backfills a missing media array on entries cached before the field existed, instead of crashing render code that indexes into it", async () => {
		const { media: _omitted, ...withoutMedia } = makeCharacter('char-4');
		entryStore.set('char-4', { character: withoutMedia as unknown as Character, auto: false });

		// initSavedCharacters() memoizes its init promise at module scope, so a
		// fresh module instance is needed to re-run it against entryStore's
		// pre-seeded (pre-media-field) data above.
		vi.resetModules();
		const fresh = await import('./savedCharacters.svelte');
		await fresh.initSavedCharacters();

		expect(fresh.getSavedCharacter('char-4')?.media).toEqual([]);
		expect(fresh.getSavedCharacters()[0].media).toEqual([]);
	});
});
