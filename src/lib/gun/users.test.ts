import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { publishProfile, getProfile, deleteProfile } from './users';
import { getUsernameClaim } from './usernames';

const RADATA_DIR = `test-radata-users-${crypto.randomUUID()}`;

beforeAll(() => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], file: RADATA_DIR }));
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('publishProfile', () => {
	it('publishes and claims the username, round-tripping through getProfile', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const username = `alice-${crypto.randomUUID().slice(0, 8)}`;

		const published = await publishProfile({ username, description: 'hi' });
		expect(published.username).toBe(username);

		const fetched = await getProfile(keyring.publicKey);
		expect(fetched).toEqual({ ok: true, doc: published });

		const claim = await getUsernameClaim(username);
		expect(claim.ok && claim.doc.authorPub).toBe(keyring.publicKey);
	});

	it('rejects publishing with a username someone else already claimed', async () => {
		const owner = await generateKeyring();
		__setKeyringForTests(owner);
		const username = `bob-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: '' });

		const other = await generateKeyring();
		__setKeyringForTests(other);
		await expect(publishProfile({ username, description: '' })).rejects.toThrow('already taken');
	});

	it('releases the old username when changed, freeing it for others', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const oldName = `old-${crypto.randomUUID().slice(0, 8)}`;
		const newName = `new-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username: oldName, description: '' });
		await publishProfile({ username: newName, description: '' });

		const oldClaim = await getUsernameClaim(oldName);
		expect(oldClaim.ok && oldClaim.doc.deleted).toBe(true);

		const other = await generateKeyring();
		__setKeyringForTests(other);
		await expect(publishProfile({ username: oldName, description: '' })).resolves.toMatchObject({
			username: oldName
		});
	});

	it('re-publishing under the same username keeps the claim, no error', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const username = `carol-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: 'v1' });
		await expect(publishProfile({ username, description: 'v2' })).resolves.toMatchObject({
			username,
			description: 'v2'
		});
	});
});

describe('deleteProfile', () => {
	it('tombstones instead of removing', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const username = `dave-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: '' });

		const deleted = await deleteProfile();
		expect(deleted.deleted).toBe(true);

		const fetched = await getProfile(keyring.publicKey);
		expect(fetched).toEqual({ ok: true, doc: deleted });
	});
});
