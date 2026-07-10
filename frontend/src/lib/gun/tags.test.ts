import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests, getGun, gunPath } from './client';
import { generateKeyring } from '$lib/crypto/keys';
import { signDocument } from '$lib/crypto/sign';
import { putDocument } from './document';
import { getTagIndex, addToTagIndex } from './tags';
import { makeCharacterId } from './characterId';

const RADATA_DIR = `test-radata-tags-${crypto.randomUUID()}`;

beforeAll(() => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], file: RADATA_DIR }));
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('addToTagIndex / getTagIndex', () => {
	it('finds a pointer added for a tag', async () => {
		const keyring = await generateKeyring();
		const tag = `t-${crypto.randomUUID()}`;
		const charId = makeCharacterId(keyring.publicKey);

		await addToTagIndex(tag, charId, keyring);

		expect(await getTagIndex(tag)).toEqual([charId]);
	});

	it('two authors tagging the same tag concurrently both survive', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const a = await generateKeyring();
		const b = await generateKeyring();
		const idA = makeCharacterId(a.publicKey);
		const idB = makeCharacterId(b.publicKey);

		await Promise.all([addToTagIndex(tag, idA, a), addToTagIndex(tag, idB, b)]);

		const results = await getTagIndex(tag);
		expect(results).toContain(idA);
		expect(results).toContain(idB);
	});

	it('returns nothing for a tag nobody has used', async () => {
		expect(await getTagIndex(`unused-${crypto.randomUUID()}`)).toEqual([]);
	});

	it('rejects a pointer whose claimed author does not match the charId author', async () => {
		const owner = await generateKeyring();
		const attacker = await generateKeyring();
		const tag = `t-${crypto.randomUUID()}`;
		const charId = makeCharacterId(owner.publicKey);

		// Forge a pointer for owner's charId but signed by attacker, claiming
		// attacker as the author.
		const forged = { tag, docId: charId, authorPub: attacker.publicKey, signature: '' };
		forged.signature = await signDocument(forged, attacker);
		await putDocument(
			gunPath(getGun(), `tags/${encodeURIComponent(tag)}/${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`).get(
				encodeURIComponent(charId)
			),
			forged
		);

		expect(await getTagIndex(tag)).toEqual([]);
	});
});
