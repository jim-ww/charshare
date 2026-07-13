import { describe, it, expect, beforeEach } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import {
	publishCharacter,
	deleteCharacter,
	forkCharacter,
	forkCharacterFromDoc,
	getCharacter,
	createLocalCharacter,
	editLocalCharacter,
	publishLocalCharacter
} from './characters';

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
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

async function neverPublished(id: string): Promise<boolean> {
	const result = await getCharacter(id);
	return !result.ok;
}

describe('publishCharacter', () => {
	it('creates then edits, incrementing version', async () => {
		const created = await publishCharacter(baseFields);
		expect(created.version).toBe(1);

		const edited = await publishCharacter({ ...baseFields, id: created.id, name: 'Aria v2' });
		expect(edited.version).toBe(2);
		expect(edited.id).toBe(created.id);
		expect(edited.name).toBe('Aria v2');
		expect(edited.created_at).toBe(created.created_at);

		const fetched = await getCharacter(created.id);
		expect(fetched).toEqual({ ok: true, doc: edited });
	});

	it('rejects edits from a non-author', async () => {
		const created = await publishCharacter(baseFields);
		__setKeyringForTests(generateKeyring());
		await expect(publishCharacter({ ...baseFields, id: created.id })).rejects.toThrow('Only the author');
	});
});

describe('deleteCharacter', () => {
	it('tombstones instead of removing', async () => {
		const created = await publishCharacter(baseFields);
		const deleted = await deleteCharacter(created.id);
		expect(deleted.deleted).toBe(true);
		expect(deleted.deleted_at).not.toBeNull();

		const fetched = await getCharacter(created.id);
		expect(fetched).toEqual({ ok: true, doc: deleted });
	});
});

describe('forkCharacter', () => {
	it('copies fields under a new id, authored by the forker, without publishing', async () => {
		const original = await publishCharacter(baseFields);

		const forker = generateKeyring();
		__setKeyringForTests(forker);
		const fork = await forkCharacter(original.id);

		expect(fork.id).not.toBe(original.id);
		expect(fork.forked_from).toBe(original.id);
		expect(fork.author).toBe(forker.publicKey);
		expect(fork.name).toBe(original.name);
		expect(fork.version).toBe(1);

		expect(await neverPublished(fork.id)).toBe(true);
	});

	it('rejects forking by id when the character is unreachable on the network', async () => {
		const original = await publishCharacter(baseFields);
		__setPoolForTests(createFakePool().pool); // simulate a relay switch that's never seen this character

		await expect(forkCharacter(original.id)).rejects.toThrow('Character not found.');
	});

	it('forkCharacterFromDoc forks an already-known character with no network call at all — e.g. a saved character whose author is currently unreachable', async () => {
		const original = await publishCharacter(baseFields);
		__setPoolForTests(createFakePool().pool); // now unreachable — same as above

		const forker = generateKeyring();
		__setKeyringForTests(forker);
		const fork = forkCharacterFromDoc(original);

		expect(fork.id).not.toBe(original.id);
		expect(fork.forked_from).toBe(original.id);
		expect(fork.author).toBe(forker.publicKey);
		expect(fork.name).toBe(original.name);
		expect(fork.version).toBe(1);
	});
});

describe('local-only characters', () => {
	it('createLocalCharacter signs a document without publishing it', async () => {
		const draft = await createLocalCharacter(baseFields);

		expect(draft.version).toBe(1);
		expect(draft.forked_from).toBeNull();
		expect(await neverPublished(draft.id)).toBe(true);
	});

	it('editLocalCharacter re-signs a new version, still without publishing', async () => {
		const draft = await createLocalCharacter(baseFields);
		const edited = await editLocalCharacter(draft, { ...baseFields, name: 'Aria v2' });

		expect(edited.id).toBe(draft.id);
		expect(edited.version).toBe(2);
		expect(edited.name).toBe('Aria v2');
		expect(await neverPublished(draft.id)).toBe(true);
	});

	it('publishLocalCharacter publishes the local draft\'s content unchanged', async () => {
		// The published event is re-signed at publish time (a fresh revision,
		// same as any other publish), so id/signature/updated_at legitimately
		// differ from the local-only draft's — only the character's own fields
		// must round-trip unchanged.
		const draft = await createLocalCharacter(baseFields);
		const published = await publishLocalCharacter(draft);

		expect(published.id).toBe(draft.id);
		expect(published.author).toBe(draft.author);
		expect(published.name).toBe(draft.name);
		expect(published.version).toBe(draft.version);
		expect(published.created_at).toBe(draft.created_at);

		const fetched = await getCharacter(draft.id);
		expect(fetched).toEqual({ ok: true, doc: published });
	});
});
