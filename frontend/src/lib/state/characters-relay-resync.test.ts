import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// Full node build, not 'gun/gun.js' — this test needs real relay networking
// (see gun/relay-sync.test.ts for why).
import Gun from 'gun';
import { __setGunForTests, __resetGunUserAuthForTests } from '$lib/gun/client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { publishCharacter, getCharacter } from '$lib/gun/characters';
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
		entryStore.set(id, { id, published: true, character: (character ?? existing?.character) as never });
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
 *  it's missing and republish the exact cached signed copy — not silently
 *  drop the character from "My Characters". */

function startRelay(dir: string): Promise<{ server: Server; url: string }> {
	return new Promise((resolve) => {
		const server = createServer((Gun as unknown as { serve: (req: unknown, res: unknown) => void }).serve);
		server.listen(0, () => {
			const { port } = server.address() as AddressInfo;
			new Gun({ web: server, radisk: true, file: dir, localStorage: false });
			resolve({ server, url: `http://localhost:${port}/gun` });
		});
	});
}

function stopRelay(server: Server) {
	server.closeAllConnections();
	server.close();
}

let relayA: { server: Server; url: string };
let relayB: { server: Server; url: string };

const RELAY_A_DIR = `test-radata-resync-relay-a-${crypto.randomUUID()}`;
const RELAY_B_DIR = `test-radata-resync-relay-b-${crypto.randomUUID()}`;
const CLIENT_DIR_1 = `test-radata-resync-client-1-${crypto.randomUUID()}`;
const CLIENT_DIR_2 = `test-radata-resync-client-2-${crypto.randomUUID()}`;

beforeAll(async () => {
	relayA = await startRelay(RELAY_A_DIR);
	relayB = await startRelay(RELAY_B_DIR);
});

afterAll(() => {
	stopRelay(relayA.server);
	stopRelay(relayB.server);
	for (const dir of [RELAY_A_DIR, RELAY_B_DIR, CLIENT_DIR_1, CLIENT_DIR_2]) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const baseFields = {
	name: 'Aria',
	image_urls: [],
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
	comments_enabled: true
};

describe('startup resync across a relay switch', () => {
	it('republishes an already-published character to a relay that has never seen it', async () => {
		const keyring = await generateKeyring();

		// Session 1: connected to relay A, publishes a character. This is the
		// same local "my characters" IndexedDB index a real app session builds
		// up via createOrEditCharacter -> addPublishedCharacterId.
		__setGunForTests(
			new Gun({ peers: [relayA.url], radisk: true, localStorage: false, axe: false, multicast: false, file: CLIENT_DIR_1 })
		);
		__setKeyringForTests(keyring);
		const created = await publishCharacter(baseFields);
		entryStore.set(created.id, { id: created.id, published: true, character: created });

		// Relay A definitely has it.
		const onRelayA = await getCharacter(created.id);
		expect(onRelayA).toEqual({ ok: true, doc: created });

		// Session 2: same local cache/keyring, but the app is now connected to
		// relay B instead — which has never heard of this character.
		__resetGunUserAuthForTests();
		__setGunForTests(
			new Gun({ peers: [relayB.url], radisk: true, localStorage: false, axe: false, multicast: false, file: CLIENT_DIR_2 })
		);

		const beforeResync = await getCharacter(created.id);
		expect(beforeResync.ok).toBe(false);

		await __refreshCharactersForTests({ resyncMissing: true });

		// The resync should have noticed and republished it to relay B...
		const afterResync = await getCharacter(created.id);
		expect(afterResync).toEqual({ ok: true, doc: created });

		// ...and "My Characters" should still show it, not have dropped it.
		expect(getMyCharacters().map((c) => c.id)).toContain(created.id);

		// The local index entry itself should still be intact too.
		expect(entryStore.get(created.id)?.published).toBe(true);
	}, 20000);
});
