import { describe, it, expect, beforeAll } from 'vitest';
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import {
	publishCharacter,
	deleteCharacter,
	forkCharacter,
	getCharacter,
	createLocalCharacter,
	editLocalCharacter,
	publishLocalCharacter
} from './characters';

beforeAll(async () => {
	__setGunForTests(new Gun({ radisk: false, localStorage: false, peers: [], axe: false, multicast: false }));
	__setKeyringForTests(await generateKeyring());
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
	comments_enabled: true
};

/** GUN's `.once()` never fires for a path that's never been written to, so
 *  getCharacter(id) would hang forever for a truly local-only id. Races it
 *  against a short timeout to confirm the read never resolves. */
async function neverWrittenToGun(id: string): Promise<boolean> {
	const timeout = Symbol('timeout');
	const result = await Promise.race([
		getCharacter(id),
		new Promise((resolve) => setTimeout(() => resolve(timeout), 500))
	]);
	return result === timeout;
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
		__setKeyringForTests(await generateKeyring());
		await expect(publishCharacter({ ...baseFields, id: created.id })).rejects.toThrow('Only the author');
	});
});

describe('deleteCharacter', () => {
	it('tombstones instead of removing', async () => {
		__setKeyringForTests(await generateKeyring());
		const created = await publishCharacter(baseFields);
		const deleted = await deleteCharacter(created.id);
		expect(deleted.deleted).toBe(true);
		expect(deleted.deleted_at).not.toBeNull();

		const fetched = await getCharacter(created.id);
		expect(fetched).toEqual({ ok: true, doc: deleted });
	});
});

describe('forkCharacter', () => {
	it('copies fields under a new id, authored by the forker, without publishing to GUN', async () => {
		__setKeyringForTests(await generateKeyring());
		const original = await publishCharacter(baseFields);

		const forker = await generateKeyring();
		__setKeyringForTests(forker);
		const fork = await forkCharacter(original.id);

		expect(fork.id).not.toBe(original.id);
		expect(fork.forked_from).toBe(original.id);
		expect(fork.author).toBe(forker.publicKey);
		expect(fork.name).toBe(original.name);
		expect(fork.version).toBe(1);

		// GUN's .once() never fires at all for a path that's never been written
		// to (see document.ts) — a resolved "not found" isn't observable here,
		// so instead assert the read doesn't resolve within a short window.
		expect(await neverWrittenToGun(fork.id)).toBe(true);
	});
});

describe('local-only characters', () => {
	it('createLocalCharacter signs a document without writing it to GUN', async () => {
		__setKeyringForTests(await generateKeyring());
		const draft = await createLocalCharacter(baseFields);

		expect(draft.version).toBe(1);
		expect(draft.forked_from).toBeNull();
		expect(await neverWrittenToGun(draft.id)).toBe(true);
	});

	it('editLocalCharacter re-signs a new version, still without touching GUN', async () => {
		__setKeyringForTests(await generateKeyring());
		const draft = await createLocalCharacter(baseFields);
		const edited = await editLocalCharacter(draft, { ...baseFields, name: 'Aria v2' });

		expect(edited.id).toBe(draft.id);
		expect(edited.version).toBe(2);
		expect(edited.name).toBe('Aria v2');
		expect(await neverWrittenToGun(draft.id)).toBe(true);
	});

	it('publishLocalCharacter writes the already-signed doc to GUN as-is', async () => {
		__setKeyringForTests(await generateKeyring());
		const draft = await createLocalCharacter(baseFields);
		const published = await publishLocalCharacter(draft);

		expect(published).toEqual(draft);
		const fetched = await getCharacter(draft.id);
		expect(fetched).toEqual({ ok: true, doc: draft });
	});
});
