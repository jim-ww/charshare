import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { generateKeyring } from '$lib/crypto/keys';
import { tokenizeName, addToNameIndex, searchByName } from './names';
import { makeCharacterId } from './characterId';

const RADATA_DIR = `test-radata-names-${crypto.randomUUID()}`;

beforeAll(() => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], file: RADATA_DIR }));
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('tokenizeName', () => {
	it('lowercases, splits on non-letters, and dedupes', () => {
		expect(tokenizeName('Aria the Brave, Aria Returns!')).toEqual(['aria', 'the', 'brave', 'returns']);
	});

	it('returns nothing for a blank name', () => {
		expect(tokenizeName('   ')).toEqual([]);
	});
});

describe('addToNameIndex / searchByName', () => {
	it('finds a character by one of its name tokens', async () => {
		const keyring = await generateKeyring();
		const charId = makeCharacterId(keyring.publicKey);
		const suffix = crypto.randomUUID().slice(0, 8);

		await addToNameIndex(`Aria ${suffix}`, charId, Date.now(), keyring);

		expect(await searchByName(suffix)).toEqual([charId]);
		expect(await searchByName(`aria ${suffix}`)).toEqual([charId]);
	});

	it('returns nothing for a name nobody used', async () => {
		expect(await searchByName(`unused-${crypto.randomUUID()}`)).toEqual([]);
	});

	it('returns nothing for a blank query', async () => {
		expect(await searchByName('   ')).toEqual([]);
	});
});
