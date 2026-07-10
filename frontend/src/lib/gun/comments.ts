import type { CharacterId, Comment, CommentId, Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { getDocument, putDocument, type Validator } from './document';
import { authorNode, ensureGunUserAuth, getGun, gunPath, gunPeerReady, type GunNode } from './client';
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
		// undefined is tolerated for comments written before replies existed
		(d.parent_id === null || d.parent_id === undefined || typeof d.parent_id === 'string') &&
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

export async function getComment(id: CommentId): Promise<Verified<Comment>> {
	const result = await getDocument(gunPath(getGun(), commentPath(id)), isComment, pubkeyOf);
	if (!result.ok) return result;
	return { ...result, doc: { ...result.doc, parent_id: result.doc.parent_id ?? null } };
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

/** Per-comment pointer (commentId -> character_id) under the author's own
 *  protected GUN space, letting "my comments" enumerate what a user has
 *  posted without a network-wide scan. Unlike commentIndex above, this needs
 *  no app-level signature/ownership check at all: GUN's own user-auth
 *  already rejects writes to `~pubkey/...` not signed by that keypair, and
 *  each pointer is its own child key (not a shared array), so even the same
 *  account writing from two devices at once can't lose an update to a
 *  read-modify-write race. */
function authoredCommentsNode(pubkey: PubKey): GunNode {
	return authorNode(getGun(), pubkey, ['comments-authored']);
}

const AUTHORED_PUT_TIMEOUT_MS = 3000;

async function indexAuthoredComment(commentId: CommentId, characterId: CharacterId, keyring: Keyring): Promise<void> {
	await ensureGunUserAuth(keyring.pair);
	await new Promise<void>((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve();
			}
		}, AUTHORED_PUT_TIMEOUT_MS);
		authoredCommentsNode(keyring.publicKey)
			.get(commentId)
			.put(characterId, () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve();
			});
	});
}

const ENUMERATE_AUTHORED_TIMEOUT_MS = 1000;

/** Lists the (verified, non-deleted) comments `pubkey` has posted, discovered
 *  via their own protected-space pointer node rather than a network scan.
 *  Same trust model as getCommentsForCharacter: the pointer is discovery-only
 *  and every result is re-verified via getComment, with an author cross-check
 *  since GUN's own write protection only proves who wrote the *pointer*, not
 *  that the pointed-at comment itself hasn't since changed hands. */
export async function getCommentsAuthoredBy(pubkey: PubKey): Promise<Comment[]> {
	const ids = await new Promise<string[]>((resolve) => {
		const ids: string[] = [];
		let settled = false;
		function finish() {
			if (settled) return;
			settled = true;
			resolve(ids);
		}
		gunPeerReady().then(() => {
			if (settled) return;
			setTimeout(finish, ENUMERATE_AUTHORED_TIMEOUT_MS);
			authoredCommentsNode(pubkey)
				.map()
				.once((data: unknown, childKey: string) => {
					if (settled || data === null || data === undefined) return;
					ids.push(childKey);
				});
		});
	});
	const results = await Promise.all(ids.map((id) => getComment(id as CommentId)));
	return results
		.filter((r) => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => c.author === pubkey)
		.sort((a, b) => b.created_at - a.created_at);
}

async function signAndPublish(draft: Omit<Comment, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Comment> {
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	const doc: Comment = { ...withTimestamp, signature };
	await putDocument(gunPath(getGun(), commentPath(doc.id)), doc);
	return doc;
}

export async function postComment(
	characterId: CharacterId,
	content: string,
	parentId: CommentId | null = null,
	// The comment actually being replied to, for the "can't reply to your own
	// comment" check below — distinct from parentId, which is always the
	// thread's root (replies are flattened one level deep, so replying to a
	// reply still stores parent_id = the root, not that reply's id).
	replyToId: CommentId | null = parentId
): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	if (replyToId) {
		const replyTo = await getComment(replyToId);
		if (replyTo.ok && replyTo.doc.author === keyring.publicKey) {
			throw new Error("Can't reply to your own comment.");
		}
	}

	const doc = await signAndPublish(
		{
			id: crypto.randomUUID(),
			character_id: characterId,
			content,
			parent_id: parentId,
			author: keyring.publicKey,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
	await commentIndex.addToIndex(characterId, doc.id, keyring);
	await indexAuthoredComment(doc.id, characterId, keyring);
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
