import type { CharacterId, Comment, CommentId, Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { getDocument, putDocument, type Validator } from './document';
import { getGun, gunPath } from './client';

function commentPath(id: CommentId): string {
	return `comments/${id}`;
}

function commentIndexPath(characterId: CharacterId): string {
	return `characters/${characterId}/comments`;
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

/** Same index-blob pattern as tags.ts — GUN has no query engine, so listing a
 *  character's comments needs a manually maintained id list. Same known
 *  limitation: concurrent commenters can race/clobber the index, last-write-wins. */
const INDEX_TIMEOUT_MS = 3000;

async function readCommentIndex(characterId: CharacterId): Promise<CommentId[]> {
	const node = gunPath(getGun(), commentIndexPath(characterId));
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve([]);
			}
		}, INDEX_TIMEOUT_MS);
		node.once((data: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			const raw = (data as { json?: string } | null | undefined)?.json;
			if (!raw) {
				resolve([]);
				return;
			}
			try {
				const parsed = JSON.parse(raw);
				resolve(Array.isArray(parsed) ? parsed : []);
			} catch {
				resolve([]);
			}
		});
	});
}

function writeCommentIndex(characterId: CharacterId, ids: CommentId[]): Promise<void> {
	const node = gunPath(getGun(), commentIndexPath(characterId));
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve();
			}
		}, INDEX_TIMEOUT_MS);
		node.put({ json: JSON.stringify(ids) }, () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		});
	});
}

async function addToCommentIndex(characterId: CharacterId, id: CommentId): Promise<void> {
	const ids = await readCommentIndex(characterId);
	if (!ids.includes(id)) await writeCommentIndex(characterId, [...ids, id]);
}

export function getComment(id: CommentId): Promise<Verified<Comment>> {
	return getDocument(commentPath(id), isComment, pubkeyOf);
}

/** Fetches every non-tombstoned comment on `characterId`, dropping any that
 *  fail schema/signature verification (see spec: never partially trust). */
export async function getCommentsForCharacter(characterId: CharacterId): Promise<Comment[]> {
	const ids = await readCommentIndex(characterId);
	const results = await Promise.all(ids.map((id) => getComment(id)));
	return results
		.filter((r) => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.sort((a, b) => a.created_at - b.created_at);
}

async function signAndPublish(draft: Omit<Comment, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Comment> {
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	const doc: Comment = { ...withTimestamp, signature };
	await putDocument(commentPath(doc.id), doc);
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
	await addToCommentIndex(characterId, doc.id);
	return doc;
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
