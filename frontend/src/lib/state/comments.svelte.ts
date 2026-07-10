import type { CharacterId, Comment } from '$lib/types';
import {
	deleteComment as gunDeleteComment,
	editComment as gunEditComment,
	getCommentsForCharacter,
	postComment
} from '$lib/gun/comments';

let comments = $state<Record<CharacterId, Comment[]>>({});
let loading = $state<Record<CharacterId, boolean>>({});

export function getCommentsFor(characterId: CharacterId): Comment[] {
	return comments[characterId] ?? [];
}

export function isLoadingComments(characterId: CharacterId): boolean {
	return loading[characterId] ?? false;
}

export async function loadComments(characterId: CharacterId): Promise<void> {
	loading = { ...loading, [characterId]: true };
	try {
		comments = { ...comments, [characterId]: await getCommentsForCharacter(characterId) };
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

export async function removeComment(characterId: CharacterId, commentId: string): Promise<void> {
	await gunDeleteComment(commentId);
	await loadComments(characterId);
}

export async function editComment(characterId: CharacterId, commentId: string, content: string): Promise<void> {
	await gunEditComment(commentId, content);
	await loadComments(characterId);
}
