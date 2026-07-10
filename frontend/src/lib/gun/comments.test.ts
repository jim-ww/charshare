import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import Gun from 'gun/gun.js';
import { __setGunForTests, getGun, gunPath } from './client';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from '$lib/crypto/keys';
import { postComment, editComment, deleteComment, getCommentsForCharacter, getCommentsAuthoredBy } from './comments';

const RADATA_DIR = `test-radata-comments-${crypto.randomUUID()}`;
let mainKeyring: Awaited<ReturnType<typeof generateKeyring>>;

beforeAll(async () => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], axe: false, multicast: false, file: RADATA_DIR }));
	mainKeyring = await generateKeyring();
	__setKeyringForTests(mainKeyring);
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

describe('postComment / getCommentsForCharacter', () => {
	it('posts a comment and finds it via the signed pointer index', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Hello there');

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(1);
		expect(comments[0].id).toBe(comment.id);
		expect(comments[0].content).toBe('Hello there');
	});

	it('excludes a tombstoned comment', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Will be deleted');
		await deleteComment(comment.id);

		expect(await getCommentsForCharacter(characterId)).toEqual([]);
	});

	it('reflects an edit', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Original');
		await editComment(comment.id, 'Edited');

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(1);
		expect(comments[0].content).toBe('Edited');
	});

	it("drops a pointer that resolves to a comment for a different character (index is discovery-only)", async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const otherCharacterId = `char-${crypto.randomUUID()}`;
		// A real comment, genuinely posted under otherCharacterId...
		const comment = await postComment(otherCharacterId, 'Belongs elsewhere');
		const keyring = await generateKeyring();
		// ...but with a forged pointer added under characterId's index too —
		// since ownership on the comments namespace is permissive (() => true),
		// the pointer itself verifies fine; the character_id cross-check in
		// getCommentsForCharacter is what has to catch this.
		const { createSignedPointerIndex } = await import('./signedIndex');
		const commentIndex = createSignedPointerIndex('comments', () => true);
		await commentIndex.addToIndex(characterId, comment.id, keyring);

		expect(await getCommentsForCharacter(characterId)).toEqual([]);
	});

	it('posts a reply with parent_id set, alongside the top-level comment', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const root = await postComment(characterId, 'Top-level');

		__setKeyringForTests(await generateKeyring());
		const reply = await postComment(characterId, 'A reply', root.id);
		__setKeyringForTests(await generateKeyring());

		expect(reply.parent_id).toBe(root.id);

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(2);
		expect(comments.find((c) => c.id === root.id)?.parent_id).toBeNull();
		expect(comments.find((c) => c.id === reply.id)?.parent_id).toBe(root.id);
	});

	it('rejects replying to your own comment', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const root = await postComment(characterId, 'Top-level');

		await expect(postComment(characterId, 'Self-reply', root.id)).rejects.toThrow(
			"Can't reply to your own comment."
		);
	});

	it("allows replying to someone else's reply within your own thread (checks the actual reply target, not the flattened root)", async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const root = await postComment(characterId, 'My top-level comment');

		__setKeyringForTests(await generateKeyring());
		const reply = await postComment(characterId, "Someone else's reply", root.id);

		// Back to the root's author, replying to that reply — parent_id still
		// flattens to root.id, but the reply target (reply.id) isn't self-authored.
		__setKeyringForTests(mainKeyring);
		const nestedReply = await postComment(characterId, 'Thanks for the reply', root.id, reply.id);

		expect(nestedReply.parent_id).toBe(root.id);
	});

	it('rejects an edit from a non-author', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Mine');

		const attacker = await generateKeyring();
		__setKeyringForTests(attacker);
		await expect(editComment(comment.id, 'Hijacked')).rejects.toThrow('Only the author can edit this comment.');

		__setKeyringForTests(await generateKeyring());
	});
});

describe('getCommentsAuthoredBy', () => {
	it("finds comments posted by the given pubkey via their own protected-space pointer", async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Mine, discoverable');

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found.map((c) => c.id)).toEqual([comment.id]);
	});

	it("doesn't surface another author's comments", async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = `char-${crypto.randomUUID()}`;
		await postComment(characterId, 'Belongs to keyring');

		const otherKeyring = await generateKeyring();
		expect(await getCommentsAuthoredBy(otherKeyring.publicKey)).toEqual([]);
	});

	it('excludes a tombstoned comment', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Will be deleted');
		await deleteComment(comment.id);

		expect(await getCommentsAuthoredBy(keyring.publicKey)).toEqual([]);
	});

	it('reflects an edit', async () => {
		const keyring = await generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Original');
		await editComment(comment.id, 'Edited');

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found).toHaveLength(1);
		expect(found[0].content).toBe('Edited');
	});
});

describe('old blob-index path is abandoned, not read', () => {
	it('a comment index pointer written under the old unsigned-blob path is never consulted', async () => {
		const characterId = `char-${crypto.randomUUID()}`;
		const comment = await postComment(characterId, 'Fresh comment');

		// Simulate leftover data at the old scheme's path — should have zero
		// effect on reads, since getCommentsForCharacter no longer looks there.
		await new Promise<void>((resolve) => {
			gunPath(getGun(), `characters/${characterId}/comments`).put(
				{ json: JSON.stringify(['some-orphaned-id']) },
				() => resolve()
			);
		});

		const comments = await getCommentsForCharacter(characterId);
		expect(comments.map((c) => c.id)).toEqual([comment.id]);
	});
});
