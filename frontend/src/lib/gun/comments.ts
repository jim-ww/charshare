import type { CharacterId, Comment, CommentId, Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { getDocument, putDocument, type Validator } from './document';
import { getGun, gunPath } from './client';
import { createSignedPointerIndex } from './signedIndex';

function commentPath(id: CommentId): string {
	return `comments/${id}`;
}

const isComment: Validator<Comment> = (data): data is Comment => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.id === 'string' &&
		typeof d.character_id === 'string' &&
		typeof d.content === 'string' &&
		typeof d.author === 'string' &&
		typeof d.signature === 'string' &&
		typeof d.created_at === 'number' &&
		typeof d.updated_at === 'number' &&
		typeof d.deleted === 'boolean' &&
		(d.deleted_at === null || typeof d.deleted_at === 'number')
	);
};

const pubkeyOf = (doc: Comment): PubKey => doc.author;

/** Signed pointer index of comment ids, keyed by the character they belong
 *  to (see signedIndex.ts) — replaces an older unsigned-blob-array scheme
 *  that was race-prone under concurrent commenters. Ownership is permissive
 *  (`() => true`) because comment ids are plain UUIDs, unlike CharacterId,
 *  so they don't encode their author for the default check to use — the
 *  pointer index here is discovery-only. The real trust boundary is each
 *  comment's independently-verified signature (see getComment) plus the
 *  character_id cross-check in getCommentsForCharacter below, matching how
 *  tag/name pointers are also always re-verified against the real character
 *  afterward in browse.ts:resolveIndex. */
const commentIndex = createSignedPointerIndex('comments', () => true);

export function getComment(id: CommentId): Promise<Verified<Comment>> {
	return getDocument(gunPath(getGun(), commentPath(id)), isComment, pubkeyOf);
}

/** Fetches every non-tombstoned comment on `characterId`, dropping any that
 *  fail schema/signature verification or don't actually belong to
 *  `characterId` (see spec: never partially trust). */
export async function getCommentsForCharacter(characterId: CharacterId): Promise<Comment[]> {
	const ids = await commentIndex.getIndex(characterId);
	const results = await Promise.all(ids.map((id) => getComment(id as CommentId)));
	return results
		.filter((r) => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => c.character_id === characterId)
		.sort((a, b) => a.created_at - b.created_at);
}

async function signAndPublish(draft: Omit<Comment, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Comment> {
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	const doc: Comment = { ...withTimestamp, signature };
	await putDocument(gunPath(getGun(), commentPath(doc.id)), doc);
	return doc;
}

export async function postComment(characterId: CharacterId, content: string): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const doc = await signAndPublish(
		{
			id: crypto.randomUUID(),
			character_id: characterId,
			content,
			author: keyring.publicKey,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
	await commentIndex.addToIndex(characterId, doc.id, keyring);
	return doc;
}

/** Edits a comment's content — a new signed snapshot with the same id and
 *  created_at but a fresh updated_at, so readers can tell it was edited
 *  (updated_at !== created_at) without a separate flag or edit history. Only
 *  the original author can do this (enforced both here and by other peers
 *  re-verifying the signature against the unchanged author field) — nobody
 *  else ever has the power to alter someone else's comment (see spec: no
 *  moderation power over other users' speech). */
export async function editComment(id: CommentId, content: string): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getComment(id);
	if (!existing.ok) throw new Error('Comment not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can edit this comment.');

	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing.doc;
	return signAndPublish({ ...rest, content }, keyring);
}

/** Tombstones a comment the current user authored — a new signed snapshot
 *  with `deleted: true`, not a graph removal (see document.ts / spec). */
export async function deleteComment(id: CommentId): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getComment(id);
	if (!existing.ok) throw new Error('Comment not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this comment.');

	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing.doc;
	return signAndPublish({ ...rest, deleted: true, deleted_at: Date.now() }, keyring);
}
