import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { generateKeyring } from '$lib/crypto/keys';
import { claimUsername, releaseUsername, getUsernameClaim } from './usernames';

const RADATA_DIR = `test-radata-usernames-${crypto.randomUUID()}`;

beforeAll(() => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], file: RADATA_DIR }));
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('claimUsername / getUsernameClaim', () => {
	it('claims an unclaimed username', async () => {
		const keyring = await generateKeyring();
		const name = `Aria-${crypto.randomUUID()}`;

		await claimUsername(name, keyring);

		const claim = await getUsernameClaim(name);
		expect(claim).toEqual({
			ok: true,
			doc: expect.objectContaining({ authorPub: keyring.publicKey, deleted: false })
		});
	});

	it('rejects claiming a username someone else already holds', async () => {
		const owner = await generateKeyring();
		const other = await generateKeyring();
		const name = `Bob-${crypto.randomUUID()}`;

		await claimUsername(name, owner);

		await expect(claimUsername(name, other)).rejects.toThrow('already taken');
	});

	it('is idempotent for the original claimant, preserving claimed_at', async () => {
		const keyring = await generateKeyring();
		const name = `Cara-${crypto.randomUUID()}`;

		await claimUsername(name, keyring);
		const first = await getUsernameClaim(name);
		await claimUsername(name, keyring);
		const second = await getUsernameClaim(name);

		expect(first.ok && second.ok && first.doc.claimed_at).toBe(second.ok && second.doc.claimed_at);
	});

	it('rejects an empty username', async () => {
		const keyring = await generateKeyring();
		await expect(claimUsername('   ', keyring)).rejects.toThrow('cannot be empty');
	});

	it('is case/whitespace-insensitive', async () => {
		const owner = await generateKeyring();
		const other = await generateKeyring();
		const base = `Dana${crypto.randomUUID().slice(0, 8)}`;

		await claimUsername(base.toLowerCase(), owner);
		await expect(claimUsername(`  ${base.toUpperCase()}  `, other)).rejects.toThrow('already taken');
	});
});

describe('releaseUsername', () => {
	it('frees a claim for the next claimant', async () => {
		const owner = await generateKeyring();
		const newOwner = await generateKeyring();
		const name = `Eve-${crypto.randomUUID()}`;

		await claimUsername(name, owner);
		await releaseUsername(name, owner);

		await expect(claimUsername(name, newOwner)).resolves.toBeUndefined();
	});

	it('does nothing if the caller does not hold the claim', async () => {
		const owner = await generateKeyring();
		const attacker = await generateKeyring();
		const name = `Frank-${crypto.randomUUID()}`;

		await claimUsername(name, owner);
		await releaseUsername(name, attacker);

		const claim = await getUsernameClaim(name);
		expect(claim.ok && !claim.doc.deleted && claim.doc.authorPub === owner.publicKey).toBe(true);
	});
});
