import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// Unlike the other gun/*.test.ts files, this one deliberately wants real
// networking (a live relay + independent client peers), so it imports the
// full node build (server/http support) rather than the bare 'gun/gun.js'
// graph engine the other tests use to stay off the network.
import Gun from 'gun';
import { __setGunForTests, __resetGunUserAuthForTests } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { publishCharacter, getCharacter } from './characters';

/** Every other gun test reuses a single in-process Gun instance for both the
 *  "write" and the "read" — which only proves a document survives a
 *  round-trip through one instance's own local graph/radisk cache, never that
 *  it actually reached a relay another peer can read from. This test spins up
 *  a real local relay (Gun's own http server) and two fully independent
 *  client instances — separate radisk dirs, never sharing process state other
 *  than the relay — to confirm a published character is genuinely synced to
 *  the relay, not just cached locally. */

let relayServer: Server;
let relayUrl: string;

const RELAY_DIR = `test-radata-relay-${crypto.randomUUID()}`;
const CLIENT_A_DIR = `test-radata-relay-client-a-${crypto.randomUUID()}`;
const CLIENT_B_DIR = `test-radata-relay-client-b-${crypto.randomUUID()}`;

beforeAll(async () => {
	relayServer = createServer((Gun as unknown as { serve: (req: unknown, res: unknown) => void }).serve);
	await new Promise<void>((resolve) => relayServer.listen(0, resolve));
	const { port } = relayServer.address() as AddressInfo;
	relayUrl = `http://localhost:${port}/gun`;
	new Gun({ web: relayServer, radisk: true, file: RELAY_DIR, localStorage: false });
});

afterAll(() => {
	// Clients keep their WebSocket connections to the relay open, so
	// server.close()'s callback never fires while they're alive; just tear
	// the sockets down and let the process exit instead of waiting on it.
	relayServer.closeAllConnections();
	relayServer.close();
	for (const dir of [RELAY_DIR, CLIENT_A_DIR, CLIENT_B_DIR]) {
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

describe('relay sync', () => {
	it('a character published by one client is readable by a second, independent client via the relay alone', async () => {
		const keyring = await generateKeyring();

		// Client A: publishes the character through the relay.
		__setGunForTests(
			new Gun({ peers: [relayUrl], radisk: true, localStorage: false, axe: false, multicast: false, file: CLIENT_A_DIR })
		);
		__setKeyringForTests(keyring);
		const created = await publishCharacter(baseFields);

		// Give the relay a moment to actually persist the write server-side,
		// since putDocument (see document.ts) resolves optimistically and
		// doesn't wait on relay-side ack.
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Client B: a brand-new instance with its own on-disk cache, wired to
		// the same relay but never shown client A's data directly — anything
		// it can read had to come from the relay.
		__resetGunUserAuthForTests();
		__setGunForTests(
			new Gun({ peers: [relayUrl], radisk: true, localStorage: false, axe: false, multicast: false, file: CLIENT_B_DIR })
		);

		const fetched = await getCharacter(created.id);
		expect(fetched).toEqual({ ok: true, doc: created });
	}, 15000);
});
