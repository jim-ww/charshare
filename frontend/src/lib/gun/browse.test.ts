import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { deleteCharacter, publishCharacter } from './characters';
import { browseByTag, browseNetwork, browseByName, browseByAuthor } from './browse';
import { publishProfile } from './users';
import { __setPreferencesForTests } from '$lib/state/preferences.svelte';

const RADATA_DIR = `test-radata-browse-${crypto.randomUUID()}`;

const baseFields = {
	image_urls: [],
	description: '',
	personality: '',
	scenario: '',
	nsfw: false,
	language: '',
	system_prompt: '',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: [],
	comments_enabled: true
};

beforeAll(async () => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], axe: false, multicast: false, file: RADATA_DIR }));
	__setKeyringForTests(await generateKeyring());
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('browseByTag', () => {
	it('finds published characters carrying the tag', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Aria', tags: [tag] });

		const results = await browseByTag(tag);

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('excludes tombstoned characters', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Gone', tags: [tag] });
		await deleteCharacter(created.id);

		const results = await browseByTag(tag);
		expect(results.map((c) => c.id)).not.toContain(created.id);
	});

	it('returns nothing for an unused tag', async () => {
		const results = await browseByTag(`unused-${crypto.randomUUID()}`);
		expect(results).toEqual([]);
	});
});

describe('browseNetwork', () => {
	it('finds a published character regardless of its tags', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Nova', tags: [tag] });

		const results = await browseNetwork();

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('excludes tombstoned characters', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'GoneNetwork', tags: [tag] });
		await deleteCharacter(created.id);

		const results = await browseNetwork();
		expect(results.map((c) => c.id)).not.toContain(created.id);
	});
});

describe('browseByName', () => {
	it('finds a published character by a name token', async () => {
		const suffix = crypto.randomUUID().slice(0, 8);
		const created = await publishCharacter({ ...baseFields, name: `Aria ${suffix}`, tags: [] });

		const results = await browseByName(suffix);

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('returns nothing for an unused name', async () => {
		const results = await browseByName(`unused-${crypto.randomUUID()}`);
		expect(results).toEqual([]);
	});
});

describe('author blocklist', () => {
	afterAll(() => {
		__setPreferencesForTests({ blockedAuthors: [] });
	});

	it('excludes characters from a locally-blocked author', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Blocked', tags: [tag] });

		__setPreferencesForTests({ blockedAuthors: [keyring.publicKey] });

		expect((await browseByTag(tag)).map((c) => c.id)).not.toContain(created.id);
		expect((await browseNetwork()).map((c) => c.id)).not.toContain(created.id);

		__setPreferencesForTests({ blockedAuthors: [] });
		expect((await browseByTag(tag)).map((c) => c.id)).toContain(created.id);
	});
});

describe('browseByAuthor', () => {
	it('finds characters authored by a raw pubkey', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const created = await publishCharacter({ ...baseFields, name: 'ByPubkey', tags: [] });

		const results = await browseByAuthor(keyring.publicKey);

		expect(results.map((c) => c.id)).toEqual([created.id]);
	});

	it('resolves a claimed username to its author', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const username = `author-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: '' });
		const created = await publishCharacter({ ...baseFields, name: 'ByUsername', tags: [] });

		const results = await browseByAuthor(username);

		expect(results.map((c) => c.id)).toEqual([created.id]);
	});
});
