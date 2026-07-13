import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { publishCharacter } from './characters';
import { toggleLike, findOwnLike, likeCountAvailable, getLikeCount } from './reactions';
import { DEFAULT_NOSTR_RELAYS } from './relays';

let nip45Relays = new Set<string>();
vi.mock('nostr-tools/nip11', () => ({
	fetchRelayInformation: async (relay: string) => ({
		supported_nips: nip45Relays.has(relay) ? [45] : []
	})
}));

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
	nip45Relays = new Set();
});

const characterFields = {
	name: 'Aria',
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
	comments_enabled: true
};

describe('toggleLike / findOwnLike', () => {
	it('likes an unliked character', async () => {
		const character = await publishCharacter(characterFields);
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		const liked = await toggleLike({ type: 'character', id: character.id });
		expect(liked).toBe(true);
		expect(await findOwnLike({ type: 'character', id: character.id }, keyring.publicKey)).not.toBeNull();
	});

	it('un-likes an already-liked character on a second toggle', async () => {
		const character = await publishCharacter(characterFields);
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		await toggleLike({ type: 'character', id: character.id });
		const liked = await toggleLike({ type: 'character', id: character.id });
		expect(liked).toBe(false);
	});

	it("doesn't confuse two different characters' likes", async () => {
		const a = await publishCharacter(characterFields);
		const b = await publishCharacter({ ...characterFields, name: 'Other' });
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		await toggleLike({ type: 'character', id: a.id });
		expect(await findOwnLike({ type: 'character', id: b.id }, keyring.publicKey)).toBeNull();
	});
});

describe('likeCountAvailable / getLikeCount', () => {
	it('is unavailable when no configured relay advertises NIP-45', async () => {
		const character = await publishCharacter(characterFields);
		expect(await likeCountAvailable(['wss://no-count.example'])).toBe(false);
		expect(await getLikeCount({ type: 'character', id: character.id }, ['wss://no-count.example'])).toBeNull();
	});

	it('counts reactions via a NIP-45-capable relay', async () => {
		// toggleLike/publishCharacter always publish against the app's fixed
		// default relay set (see reactions.ts/characters.ts RELAYS constant),
		// so the capable relay under test has to be one of those, not an
		// arbitrary URL, for the fake pool's per-relay stores to line up.
		const relay = DEFAULT_NOSTR_RELAYS[0];
		nip45Relays.add(relay);
		const character = await publishCharacter(characterFields);

		__setKeyringForTests(generateKeyring());
		await toggleLike({ type: 'character', id: character.id });
		__setKeyringForTests(generateKeyring());
		await toggleLike({ type: 'character', id: character.id });

		expect(await likeCountAvailable([relay])).toBe(true);
		expect(await getLikeCount({ type: 'character', id: character.id }, [relay])).toBe(2);
	});
});
