import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import { type CharacterId, type Comment, type CommentId, MAX_COMMENT_LENGTH, type PubKey, type Verified } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { loadDeleteRequestedMap, markCommentDeleteRequested } from '$lib/db/deletedComments';
import { publishEvent, queryEvents } from './event';
import { CHARACTER_KIND, COMMENT_KIND, DELETE_REQUEST_KIND } from './kinds';
import { characterCoordinate, parseCharacterCoordinate, parseCharacterId } from './characterId';
import { readRelaysFor, writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

// Comments on a character aren't scoped to a single author (anyone can
// comment), so "browse everything for this character" stays on the user's
// configured relay set (see getActiveRelays) — only single-author lookups
// (getCommentsAuthoredBy) and publishes resolve NIP-65 outbox relays (see
// relayList.ts).

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

/** Parses a raw relay event into the app-facing `Comment` shape. `deleted`/
 *  `deleted_at` come from this browser's own local delete-request record
 *  (see db/deletedComments.ts) — comments are immutable NIP-22 events, so
 *  there is no network-level tombstone to read instead (see plan: comment
 *  editing/deletion semantics). Returns null (never partially trusted) if
 *  the required root-scope tag is missing. */
function eventToComment(event: NostrEvent, deletedMap: Record<CommentId, number>): Comment | null {
	const rootCoordinate = tagValue(event.tags, 'A');
	if (!rootCoordinate) return null;
	const parentEventId = tagValue(event.tags, 'e');
	const deletedAt = deletedMap[event.id] ?? null;

	return {
		id: event.id,
		character_id: parseCharacterCoordinate(rootCoordinate),
		content: event.content,
		parent_id: parentEventId ?? null,
		author: event.pubkey,
		created_at: event.created_at * 1000,
		updated_at: event.created_at * 1000,
		deleted: deletedAt !== null,
		deleted_at: deletedAt
	};
}

export async function getComment(id: CommentId): Promise<Verified<Comment>> {
	const events = await queryEvents({ ids: [id], kinds: [COMMENT_KIND] }, getActiveRelays());
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const deletedMap = await loadDeleteRequestedMap();
	const comment = eventToComment(events[0], deletedMap);
	return comment ? { ok: true, doc: comment } : { ok: false, reason: 'invalid_schema' };
}

/** Fetches every comment on `characterId`, including ones this browser has
 *  locally requested deletion of (see plan: rendered dimmed/struck-through by
 *  the UI, not hidden — a relay that actually honored the NIP-09 request
 *  simply won't have returned it here at all). Drops anything that fails
 *  schema/signature verification or doesn't actually belong to
 *  `characterId` (see spec: never partially trust). */
export async function getCommentsForCharacter(characterId: CharacterId): Promise<Comment[]> {
	const events = await queryEvents({ kinds: [COMMENT_KIND], '#A': [characterCoordinate(characterId)] }, getActiveRelays());
	const deletedMap = await loadDeleteRequestedMap();
	return events
		.map((e) => eventToComment(e, deletedMap))
		.filter((c): c is Comment => c !== null && c.character_id === characterId)
		.sort((a, b) => a.created_at - b.created_at);
}

/** Lists the comments `pubkey` has posted, found via a plain author-filtered
 *  relay query — no separate per-author index needed, since relays natively
 *  support `authors` filters. */
export async function getCommentsAuthoredBy(pubkey: PubKey): Promise<Comment[]> {
	const relays = await readRelaysFor(pubkey);
	const events = await queryEvents({ kinds: [COMMENT_KIND], authors: [pubkey] }, relays);
	const deletedMap = await loadDeleteRequestedMap();
	return events
		.map((e) => eventToComment(e, deletedMap))
		.filter((c): c is Comment => c !== null && c.author === pubkey)
		.sort((a, b) => b.created_at - a.created_at);
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
	if (content.length > MAX_COMMENT_LENGTH) {
		throw new Error(`Comment exceeds the ${MAX_COMMENT_LENGTH} character limit.`);
	}

	if (replyToId) {
		const replyTo = await getComment(replyToId);
		if (replyTo.ok && replyTo.doc.author === keyring.publicKey) {
			throw new Error("Can't reply to your own comment.");
		}
	}

	const rootCoordinate = characterCoordinate(characterId);
	const { author: characterAuthor } = parseCharacterId(characterId);

	// NIP-22: uppercase tags scope the root (the character being commented
	// on); lowercase tags scope the immediate parent. Flattened to one level
	// (parent always = thread root) to match the app's existing reply model.
	const tags: string[][] = [
		['A', rootCoordinate],
		['K', String(CHARACTER_KIND)],
		['P', characterAuthor],
		['a', rootCoordinate]
	];
	if (parentId) {
		const parent = await getComment(parentId);
		tags.push(['e', parentId], ['k', String(COMMENT_KIND)]);
		if (parent.ok) tags.push(['p', parent.doc.author]);
	} else {
		tags.push(['k', String(CHARACTER_KIND)], ['p', characterAuthor]);
	}

	const template: EventTemplate = {
		kind: COMMENT_KIND,
		tags,
		content,
		created_at: Math.floor(Date.now() / 1000)
	};

	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(template, keyring, relays);
	const deletedMap = await loadDeleteRequestedMap();
	const comment = eventToComment(event, deletedMap);
	if (!comment) throw new Error('Failed to publish comment.');
	return comment;
}

/** Requests deletion of a comment the current user authored. Comments are
 *  immutable NIP-22 events, so — unlike characters — there is no revision to
 *  tombstone; a NIP-09 delete request is published best-effort, and this
 *  browser separately records the request locally so its own UI can render
 *  the comment as "deletion requested" regardless of whether any relay
 *  actually honors the NIP-09 event (see plan: comment deletion). */
export async function deleteComment(id: CommentId): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getComment(id);
	if (!existing.ok) throw new Error('Comment not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this comment.');

	const deletedAt = await markCommentDeleteRequested(id);
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{ kind: DELETE_REQUEST_KIND, tags: [['e', id]], content: '', created_at: Math.floor(Date.now() / 1000) },
			keyring,
			relays
		);
	} catch (err) {
		console.warn('[nostr] delete request failed (ignored, still marked deletion-requested locally)', err);
	}

	return { ...existing.doc, deleted: true, deleted_at: deletedAt };
}
