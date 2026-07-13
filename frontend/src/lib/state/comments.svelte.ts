import type { CharacterId, Comment, PubKey } from '$lib/types';
import { deleteComment, getCommentsAuthoredBy, getCommentsForCharacter, postComment } from '$lib/nostr/comments';

let comments = $state<Record<CharacterId, Comment[]>>({});
let loading = $state<Record<CharacterId, boolean>>({});

let myComments = $state<Comment[]>([]);
let myCommentsLoading = $state(false);

export function getMyComments(): Comment[] {
	return myComments;
}

export function isLoadingMyComments(): boolean {
	return myCommentsLoading;
}

export async function loadMyComments(pubkey: PubKey): Promise<void> {
	myCommentsLoading = true;
	try {
		myComments = await getCommentsAuthoredBy(pubkey);
	} finally {
		myCommentsLoading = false;
	}
}

export function getCommentsFor(characterId: CharacterId): Comment[] {
	return comments[characterId] ?? [];
}

export function isLoadingComments(characterId: CharacterId): boolean {
	return loading[characterId] ?? false;
}

// A cold relay pool can have its WebSocket connected but still not have
// synced this character's comment events yet — the very first load of a
// session can come back empty even though comments actually exist (same
// cold-start gap search.svelte.ts's network feed retries around; comments
// never got the same treatment since this is a one-shot queryEvents call
// with no live subscription to eventually catch up on its own). Retrying a
// couple times with a growing delay picks up the data once it arrives,
// without the user having to notice and reload the page themselves.
const COMMENTS_RETRY_DELAYS_MS = [1500, 3000];

export async function loadComments(characterId: CharacterId): Promise<void> {
	loading = { ...loading, [characterId]: true };
	try {
		comments = { ...comments, [characterId]: await getCommentsForCharacter(characterId) };
		for (const delay of COMMENTS_RETRY_DELAYS_MS) {
			if ((comments[characterId]?.length ?? 0) > 0) return;
			await new Promise((resolve) => setTimeout(resolve, delay));
			comments = { ...comments, [characterId]: await getCommentsForCharacter(characterId) };
		}
	} finally {
		loading = { ...loading, [characterId]: false };
	}
}

export async function addComment(
	characterId: CharacterId,
	content: string,
	parentId: Comment['parent_id'] = null,
	replyToId: Comment['parent_id'] = parentId
): Promise<void> {
	await postComment(characterId, content, parentId, replyToId);
	await loadComments(characterId);
}

/** Requests deletion of a comment (see nostr/comments.ts: comments are
 *  immutable Nostr events, so this is a best-effort NIP-09 request, not a
 *  guaranteed removal — the comment still shows up here afterward, marked
 *  `deleted`, for the UI to render as "deletion requested" rather than
 *  silently disappearing). */
export async function removeComment(characterId: CharacterId, commentId: string): Promise<void> {
	await deleteComment(commentId);
	await loadComments(characterId);
}

export async function removeMyComment(commentId: string): Promise<void> {
	const updated = await deleteComment(commentId);
	myComments = myComments.map((c) => (c.id === commentId ? updated : c));
}
