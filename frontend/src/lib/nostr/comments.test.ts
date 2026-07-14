import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { __setPreferencesForTests } from '$lib/state/preferences.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { DEFAULT_NOSTR_RELAYS } from './relays';
import { publishRelayList } from './relayList';
import { publishCharacter } from './characters';
import { postComment, deleteComment, getComment, getCommentsForCharacter, getCommentsAuthoredBy } from './comments';
import { MAX_COMMENT_LENGTH } from '$lib/types';

// $lib/db/deletedComments wraps idb-keyval, which needs a real IndexedDB
// unavailable under plain Node/vitest — swap it for an in-memory map, same
// pattern every other db-backed test in this repo uses.
let deleteRequests: Record<string, number> = {};
vi.mock('$lib/db/deletedComments', () => ({
	loadDeleteRequestedMap: async () => deleteRequests,
	markCommentDeleteRequested: async (id: string) => {
		const timestamp = Date.now();
		deleteRequests = { ...deleteRequests, [id]: timestamp };
		return timestamp;
	}
}));

let mainKeyring: ReturnType<typeof generateKeyring>;

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	mainKeyring = generateKeyring();
	__setKeyringForTests(mainKeyring);
	__setPreferencesForTests({ nostrRelays: DEFAULT_NOSTR_RELAYS });
	deleteRequests = {};
});

const characterFields = {
	name: 'Aria',
	image_urls: [],
	description: 'A test character',
	personality: '',
	scenario: '',
	tags: [],
	nsfw: false,
	language: '',
	system_prompt: '',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: [],
	comments_enabled: true,
	slideshow_enabled: false
};

async function realCharacterId(): Promise<string> {
	return (await publishCharacter(characterFields)).id;
}

describe('postComment / getCommentsForCharacter', () => {
	it('posts a comment and finds it via a relay filter', async () => {
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Hello there');

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(1);
		expect(comments[0].id).toBe(comment.id);
		expect(comments[0].content).toBe('Hello there');
	});

	it('marks a deleted comment as deletion-requested rather than dropping it', async () => {
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Will be deleted');
		await deleteComment(comment.id);

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(1);
		expect(comments[0].deleted).toBe(true);
		expect(comments[0].deleted_at).not.toBeNull();
	});

	it("drops a comment event that doesn't actually match the requested character (never partially trusted)", async () => {
		const characterId = await realCharacterId();
		const otherCharacterId = await realCharacterId();
		await postComment(otherCharacterId, 'Belongs elsewhere');

		expect(await getCommentsForCharacter(characterId)).toEqual([]);
	});

	it('posts a reply with parent_id set, alongside the top-level comment', async () => {
		const characterId = await realCharacterId();
		const root = await postComment(characterId, 'Top-level');

		__setKeyringForTests(generateKeyring());
		const reply = await postComment(characterId, 'A reply', root.id);
		__setKeyringForTests(generateKeyring());

		expect(reply.parent_id).toBe(root.id);

		const comments = await getCommentsForCharacter(characterId);
		expect(comments).toHaveLength(2);
		expect(comments.find((c) => c.id === root.id)?.parent_id).toBeNull();
		expect(comments.find((c) => c.id === reply.id)?.parent_id).toBe(root.id);
	});

	it('rejects replying to your own comment', async () => {
		const characterId = await realCharacterId();
		const root = await postComment(characterId, 'Top-level');

		await expect(postComment(characterId, 'Self-reply', root.id)).rejects.toThrow(
			"Can't reply to your own comment."
		);
	});

	it("allows replying to someone else's reply within your own thread (checks the actual reply target, not the flattened root)", async () => {
		const characterId = await realCharacterId();
		const root = await postComment(characterId, 'My top-level comment');

		__setKeyringForTests(generateKeyring());
		const reply = await postComment(characterId, "Someone else's reply", root.id);

		// Back to the root's author, replying to that reply — parent_id still
		// flattens to root.id, but the reply target (reply.id) isn't self-authored.
		__setKeyringForTests(mainKeyring);
		const nestedReply = await postComment(characterId, 'Thanks for the reply', root.id, reply.id);

		expect(nestedReply.parent_id).toBe(root.id);
	});

	it('rejects a comment over the max length', async () => {
		const characterId = await realCharacterId();
		await expect(postComment(characterId, 'a'.repeat(MAX_COMMENT_LENGTH + 1))).rejects.toThrow(
			`Comment exceeds the ${MAX_COMMENT_LENGTH} character limit.`
		);
	});

	it('accepts a comment at exactly the max length', async () => {
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'a'.repeat(MAX_COMMENT_LENGTH));
		expect(comment.content).toHaveLength(MAX_COMMENT_LENGTH);
	});
});

describe('cross-relay-configuration visibility', () => {
	it("finds a comment via the character author's own declared relay, even when the commenter's and reader's own configured relays don't overlap at all", async () => {
		// The character author declaring a NIP-65 write relay is the only thing
		// that can bridge two otherwise fully disjoint relay configurations —
		// see comments.ts's module doc comment on why both postComment and
		// getCommentsForCharacter include readRelaysFor(characterAuthor).
		const authorKeyring = mainKeyring;
		await publishRelayList([{ url: 'wss://author-hub.example', read: true, write: true }], authorKeyring);
		const characterId = await realCharacterId();

		__setPreferencesForTests({ nostrRelays: ['wss://commenter-only.example'] });
		__setKeyringForTests(generateKeyring());
		const comment = await postComment(characterId, 'From a differently-configured browser');

		__setPreferencesForTests({ nostrRelays: ['wss://reader-only.example'] });
		__setKeyringForTests(authorKeyring);

		const comments = await getCommentsForCharacter(characterId);
		expect(comments.map((c) => c.id)).toContain(comment.id);
	});
});

describe('deleteComment', () => {
	it('rejects deletion from a non-author', async () => {
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Mine');

		__setKeyringForTests(generateKeyring());
		await expect(deleteComment(comment.id)).rejects.toThrow('Only the author can delete this comment.');
	});

	it('still resolves the comment via getComment afterward, marked deleted', async () => {
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Bye');
		await deleteComment(comment.id);

		const fetched = await getComment(comment.id);
		expect(fetched.ok).toBe(true);
		expect(fetched.ok && fetched.doc.deleted).toBe(true);
	});
});

describe('getCommentsAuthoredBy', () => {
	it('finds comments posted by the given pubkey via an author-filtered query', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Mine, discoverable');

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found.map((c) => c.id)).toEqual([comment.id]);
	});

	it("doesn't surface another author's comments", async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = await realCharacterId();
		await postComment(characterId, 'Belongs to keyring');

		const otherKeyring = generateKeyring();
		expect(await getCommentsAuthoredBy(otherKeyring.publicKey)).toEqual([]);
	});

	it('still surfaces a deletion-requested comment, marked deleted', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const characterId = await realCharacterId();
		const comment = await postComment(characterId, 'Will be deleted');
		await deleteComment(comment.id);

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found).toHaveLength(1);
		expect(found[0].deleted).toBe(true);
	});
});
