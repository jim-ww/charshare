import { describe, it, expect, beforeAll } from 'vitest';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { __setKeyringForTests, __setRegisteredForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { publishCharacter, createLocalCharacter, publishLocalCharacter } from './characters';
import { postComment } from './comments';

beforeAll(async () => {
	__setGunForTests(new Gun({ radisk: false, localStorage: false, peers: [], axe: false, multicast: false }));
	__setKeyringForTests(await generateKeyring());
});

describe('guests (no registered account)', () => {
	it('rejects publishing a new character', async () => {
		__setRegisteredForTests(false);
		await expect(
			publishCharacter({
				name: 'Guest Character',
				image_urls: [],
				description: '',
				personality: '',
				scenario: '',
				tags: [],
				nsfw: false,
				language: 'en',
				system_prompt: '',
				first_message: '',
				alternate_greetings: [],
				comments_enabled: true
			})
		).rejects.toThrow('Create an account to do this.');
	});

	it('still allows building a local-only signed character (no network write)', async () => {
		__setRegisteredForTests(false);
		const local = await createLocalCharacter({
			name: 'Local Only',
			image_urls: [],
			description: '',
			personality: '',
			scenario: '',
			tags: [],
			nsfw: false,
			language: 'en',
			system_prompt: '',
			first_message: '',
			alternate_greetings: [],
			comments_enabled: true
		});
		expect(local.name).toBe('Local Only');
		expect(local.signature).toBeTruthy();
	});

	it('rejects promoting a local-only character to the network', async () => {
		__setRegisteredForTests(false);
		const local = await createLocalCharacter({
			name: 'Local Only 2',
			image_urls: [],
			description: '',
			personality: '',
			scenario: '',
			tags: [],
			nsfw: false,
			language: 'en',
			system_prompt: '',
			first_message: '',
			alternate_greetings: [],
			comments_enabled: true
		});
		expect(() => publishLocalCharacter(local)).toThrow('Create an account to do this.');
	});

	it('rejects posting a comment', async () => {
		__setRegisteredForTests(false);
		await expect(postComment('some-character-id', 'hello')).rejects.toThrow(
			'Create an account to do this.'
		);
	});
});

describe('registered accounts', () => {
	it('can publish a character', async () => {
		__setRegisteredForTests(true);
		const published = await publishCharacter({
			name: 'Published Character',
			image_urls: [],
			description: '',
			personality: '',
			scenario: '',
			tags: [],
			nsfw: false,
			language: 'en',
			system_prompt: '',
			first_message: '',
			alternate_greetings: [],
			comments_enabled: true
		});
		expect(published.name).toBe('Published Character');
	});
});
