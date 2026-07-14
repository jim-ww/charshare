import { describe, it, expect, vi } from 'vitest';
import type { Character, CharacterId } from '$lib/types';
import type { LocalCharacterEntry } from '$lib/db/characters';

// Same in-memory swap pattern as characters-relay-resync.test.ts, but with a
// controllable deferred on the *first* loadMyCharacterEntries() call so the
// test can deterministically simulate a slow read (e.g. real network latency
// in refresh()'s per-entry getCharacter calls) racing a second, faster
// refresh() — without depending on real timers/timeouts.
const entryStore = new Map<string, LocalCharacterEntry>();
let firstCallDeferred: { resolve: () => void } | null = null;
let loadCallCount = 0;

vi.mock('$lib/db/characters', () => ({
	loadMyCharacterEntries: async () => {
		loadCallCount += 1;
		if (loadCallCount === 1) {
			// Snapshot taken *now* (while the store is still empty), but the
			// promise doesn't resolve until the test explicitly releases it —
			// simulating a slow resync that started before a later import.
			const snapshot = Array.from(entryStore.values());
			await new Promise<void>((resolve) => {
				firstCallDeferred = { resolve };
			});
			return snapshot;
		}
		return Array.from(entryStore.values());
	},
	addPublishedCharacterId: async (id: CharacterId, character?: Character) => {
		const existing = entryStore.get(id);
		entryStore.set(id, { id, published: true, character: character ?? existing?.character });
	},
	saveLocalOnlyCharacter: async (character: Character) => {
		entryStore.set(character.id, { id: character.id, published: false, character });
	},
	removeMyCharacterEntry: async (id: CharacterId) => {
		entryStore.delete(id);
	}
}));

const { __refreshCharactersForTests, isCharacterLocalOnly, getMyCharacters } = await import('./characters.svelte');

function makeCharacter(id: string): Character {
	return {
		id,
		version: 1,
		name: 'Race Imported',
		image_urls: [],
		description: '',
		personality: '',
		scenario: '',
		tags: [],
		nsfw: false,
		language: '',
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

describe('refresh() overlapping calls', () => {
	it('does not let a slower, older-snapshot refresh clobber a newer one that already landed', async () => {
		// Kick off a "slow" refresh — its loadMyCharacterEntries() read is
		// captured now (entryStore still empty) but withheld until released
		// below, exactly like initCharacters()'s startup resync being slow to
		// resolve while a bulk backup restore runs concurrently.
		const slowRefresh = __refreshCharactersForTests();

		// While that read is still pending, "import" a never-published local
		// character (like restoreCharacter does) and run its own, faster
		// refresh to completion — this is the state that should win.
		const character = makeCharacter('char-race-1');
		entryStore.set(character.id, { id: character.id, published: false, character });
		await __refreshCharactersForTests();

		expect(getMyCharacters().map((c) => c.id)).toContain(character.id);
		expect(isCharacterLocalOnly(character.id)).toBe(true);

		// Now release the slow refresh's stale (empty) snapshot.
		firstCallDeferred?.resolve();
		await slowRefresh;

		// The slow call's outdated, empty snapshot must not have overwritten
		// the correct state the second call already applied.
		expect(getMyCharacters().map((c) => c.id)).toContain(character.id);
		expect(isCharacterLocalOnly(character.id)).toBe(true);
	});
});
