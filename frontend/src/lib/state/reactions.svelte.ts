import type { CharacterId, CommentId, PubKey } from '$lib/types';
import { getCurrentUser } from '$lib/state/auth.svelte';
import {
	toggleLike as nostrToggleLike,
	findOwnLike,
	getLikeCount,
	likeCountAvailable,
	type LikeTarget
} from '$lib/nostr/reactions';

/** Keyed by a plain string (character id, or a comment id) rather than the
 *  richer LikeTarget union, since Svelte's reactive object keys need to be
 *  primitives. */
function targetKey(target: LikeTarget): string {
	return target.id;
}

let liked = $state<Record<string, boolean>>({});
let counts = $state<Record<string, number | null>>({});
let countAvailable = $state(false);
let countAvailabilityChecked = false;

export function isLiked(target: LikeTarget): boolean {
	return liked[targetKey(target)] ?? false;
}

export function getLikeCountFor(target: LikeTarget): number | null {
	return counts[targetKey(target)] ?? null;
}

/** Whether like *counts* can be shown at all — false until at least one
 *  configured relay is confirmed to support NIP-45 (see plan: no
 *  client-side aggregate-counting fallback). */
export function isLikeCountAvailable(): boolean {
	return countAvailable;
}

async function ensureCountAvailabilityChecked(): Promise<void> {
	if (countAvailabilityChecked) return;
	countAvailabilityChecked = true;
	countAvailable = await likeCountAvailable();
}

export async function loadLikeState(target: LikeTarget, pubkey: PubKey | null = getCurrentUser()): Promise<void> {
	const key = targetKey(target);
	await ensureCountAvailabilityChecked();
	const [ownLike, count] = await Promise.all([
		pubkey ? findOwnLike(target, pubkey) : Promise.resolve(null),
		countAvailable ? getLikeCount(target) : Promise.resolve(null)
	]);
	liked = { ...liked, [key]: ownLike !== null };
	counts = { ...counts, [key]: count };
}

export async function toggleLike(target: LikeTarget): Promise<void> {
	const key = targetKey(target);
	const nowLiked = await nostrToggleLike(target);
	liked = { ...liked, [key]: nowLiked };
	if (countAvailable) {
		counts = { ...counts, [key]: await getLikeCount(target) };
	}
}

export function characterLikeTarget(id: CharacterId): LikeTarget {
	return { type: 'character', id };
}

export function commentLikeTarget(id: CommentId, author: PubKey): LikeTarget {
	return { type: 'comment', id, author };
}
