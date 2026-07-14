import { describe, it, expect, vi } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/nostr/keys';
import { publishCharacter, getCharacter } from '$lib/nostr/characters';
import { __setPoolForTests } from '$lib/nostr/pool';
import { createFakePool } from '$lib/nostr/testUtils';
import type { LocalCharacterEntry } from '$lib/db/characters';

// $lib/db/characters wraps idb-keyval, which needs a real IndexedDB that
// isn't available under plain Node/vitest (every other state test avoids it
// the same way — e.g. chats.svelte.test.ts's __setChatsForTests disabling
// persistence). Swap it for an in-memory map so this test can exercise the
// real resync logic in characters.svelte.ts without touching IndexedDB.
const entryStore = new Map<string, LocalCharacterEntry>();
vi.mock('$lib/db/characters', () => ({
	loadMyCharacterEntries: async () => Array.from(entryStore.values()),
	addPublishedCharacterId: async (id: string, character?: unknown) => {
		const existing = entryStore.get(id);
		entryStore.set(id, {
			id,
			published: true,
			character: (character ?? existing?.character) as never,
			keepPublished: existing?.keepPublished
		});
	},
	saveLocalOnlyCharacter: async (character: { id: string }) => {
		entryStore.set(character.id, { id: character.id, published: false, character: character as never });
	},
	removeMyCharacterEntry: async (id: string) => {
		entryStore.delete(id);
	}
}));

const { __refreshCharactersForTests, getMyCharacters } = await import('./characters.svelte');

/** Covers the scenario from the spec discussion: a user's connected relay can
 *  change between app launches (configurable relays, or just a different
 *  relay happening to answer first). If the newly-connected relay has never
 *  seen one of this browser's own already-published characters, launch-time
 *  resync (see characters.svelte.ts:refresh, resyncMissing) should notice
 *  it's missing and republish it — not silently drop the character from "My
 *  Characters". Two disjoint fake-relay URL sets stand in for two real
 *  relays that genuinely disagree about what they've seen. */

const baseFields = {
	name: 'Aria',
	media: [],
	description: 'A test character',
	personality: '',
	scenario: '',
	tags: ['test'],
	nsfw: false,
	language: '',
	system_prompt: '',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: [],
	comments_enabled: true,
	slideshow_enabled: false
};

describe('startup resync across a relay switch', () => {
	it('republishes an already-published character to a relay that has never seen it', async () => {
		const keyring = generateKeyring();
		const { pool } = createFakePool();
		__setPoolForTests(pool);
		__setKeyringForTests(keyring);

		// nostr/characters.ts always publishes/queries against its own fixed
		// default relay set — the fake pool's per-relay isolation (see
		// testUtils.ts) still lets us simulate "relay never saw this" by
		// wiping just one of those relay's stores below, standing in for a
		// user having switched to a fresh relay between sessions.
		const created = await publishCharacter(baseFields);
		entryStore.set(created.id, { id: created.id, published: true, character: created });

		const onRelay = await getCharacter(created.id);
		expect(onRelay).toEqual({ ok: true, doc: created });

		// Simulate switching to relays that have never seen this character.
		const { pool: freshPool } = createFakePool();
		__setPoolForTests(freshPool);

		const beforeResync = await getCharacter(created.id);
		expect(beforeResync.ok).toBe(false);

		await __refreshCharactersForTests({ resyncMissing: true });

		// The resync should have noticed and republished it...
		const afterResync = await getCharacter(created.id);
		expect(afterResync.ok).toBe(true);
		expect(afterResync.ok && afterResync.doc.id).toBe(created.id);

		// ...and "My Characters" should still show it, not have dropped it.
		expect(getMyCharacters().map((c) => c.id)).toContain(created.id);

		// The local index entry itself should still be intact too.
		expect(entryStore.get(created.id)?.published).toBe(true);
	});
});

describe('"keep published" opt-in', () => {
	it('republishes a missing character on a normal (non-resync) refresh when keepPublished is set', async () => {
		const keyring = generateKeyring();
		const { pool } = createFakePool();
		__setPoolForTests(pool);
		__setKeyringForTests(keyring);

		const created = await publishCharacter(baseFields);
		entryStore.set(created.id, { id: created.id, published: true, character: created, keepPublished: true });

		// Simulate switching to relays that have never seen this character.
		const { pool: freshPool } = createFakePool();
		__setPoolForTests(freshPool);
		expect((await getCharacter(created.id)).ok).toBe(false);

		// A plain refresh — not a startup resyncMissing call — should still
		// notice and republish it, since keepPublished opts into that on every
		// refresh rather than only once per app start.
		await __refreshCharactersForTests();

		const afterRefresh = await getCharacter(created.id);
		expect(afterRefresh.ok).toBe(true);
		expect(getMyCharacters().map((c) => c.id)).toContain(created.id);
	});

	it("doesn't republish a missing character on a normal refresh without keepPublished set", async () => {
		const keyring = generateKeyring();
		const { pool } = createFakePool();
		__setPoolForTests(pool);
		__setKeyringForTests(keyring);

		const created = await publishCharacter(baseFields);
		entryStore.set(created.id, { id: created.id, published: true, character: created });

		const { pool: freshPool } = createFakePool();
		__setPoolForTests(freshPool);

		await __refreshCharactersForTests();

		expect((await getCharacter(created.id)).ok).toBe(false);
		// Still shown locally (from cache), just not republished.
		expect(getMyCharacters().map((c) => c.id)).toContain(created.id);
	});
});
