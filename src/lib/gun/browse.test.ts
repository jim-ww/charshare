import { describe, it, expect, beforeAll } from 'vitest';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { deleteCharacter, publishCharacter } from './characters';
import { browseByTag } from './browse';

const baseFields = {
	image_url: '',
	description: '',
	personality: '',
	scenario: '',
	nsfw: false,
	language: '',
	system_prompt: '',
	first_message: '',
	alternate_greetings: [],
	comments_enabled: true
};

beforeAll(async () => {
	__setGunForTests(new Gun({ radisk: false, localStorage: false, peers: [], axe: false, multicast: false }));
	__setKeyringForTests(await generateKeyring());
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
