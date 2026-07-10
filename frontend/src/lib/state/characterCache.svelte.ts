import type { Character, CharacterId } from '$lib/types';
import { getMyCharacters } from './characters.svelte';
import {
	getSavedCharacter,
	isCharacterAutoSaved,
	isCharacterSaved,
	saveCharacterLocally
} from './savedCharacters.svelte';
import { subscribeCharacterWithRetry } from '$lib/gun/characters';

/** Small lookup cache for characters referenced by id outside "my
 *  characters" (e.g. chatting with someone else's character) — chat UI
 *  needs a name/description to display, not just the raw id. */
let cache = $state<Record<CharacterId, Character>>({});
const subscribed = new Set<CharacterId>();

/** ids that have waited past their timeout without resolving — surfaced so
 *  the UI can offer recovery (pick a different character / import a backup)
 *  instead of showing "Loading…" forever when the network genuinely doesn't
 *  have this character (deleted upstream, no reachable relay, bad id, etc). */
let failed = $state<Record<CharacterId, boolean>>({});
/** How long each id's current wait is — starts at LOAD_TIMEOUT_MS and doubles
 *  every time the user asks to wait longer (see retryCharacterLoad), rather
 *  than being a fixed cutoff for every id forever. */
const timeoutMs: Record<CharacterId, number> = {};
const LOAD_TIMEOUT_MS = 8000;
const unsubscribers = new Map<CharacterId, () => void>();

/** Falls back to a locally-saved copy (see state/savedCharacters.svelte.ts)
 *  if neither "my characters" nor the live GUN cache has the doc — so a
 *  character the user saved still resolves even if the author later deletes
 *  it or no relay with it is reachable. */
export function resolveCharacter(id: CharacterId): Character | undefined {
	return getMyCharacters().find((c) => c.id === id) ?? cache[id] ?? getSavedCharacter(id);
}

export function isCharacterLoadFailed(id: CharacterId): boolean {
	return failed[id] === true;
}

function armTimeout(id: CharacterId): void {
	const ms = timeoutMs[id] ?? LOAD_TIMEOUT_MS;
	timeoutMs[id] = ms;
	setTimeout(() => {
		if (!resolveCharacter(id)) failed = { ...failed, [id]: true };
		unsubscribers.get(id)?.();
		unsubscribers.delete(id);
	}, ms);
}

function startSubscription(id: CharacterId): void {
	unsubscribers.get(id)?.();
	const unsubscribe = subscribeCharacterWithRetry(
		id,
		(result) => {
			if (result.ok) {
				cache = { ...cache, [id]: result.doc };
				if (failed[id]) failed = { ...failed, [id]: false };
				// Keep an already-saved copy current (e.g. picking up the author's
				// latest edits, or a tombstone) without changing whether it was
				// saved manually vs. automatically.
				if (isCharacterSaved(id)) void saveCharacterLocally(result.doc, { auto: isCharacterAutoSaved(id) });
			}
		},
		() => resolveCharacter(id) !== undefined
	);
	unsubscribers.set(id, unsubscribe);
}

/** Subscribes (once per id) rather than doing a single one-shot read — GUN's
 *  local read can momentarily miss data that hasn't synced from a relay yet,
 *  so a plain one-shot get can silently never resolve the character. See
 *  gun/document.ts:subscribeDocumentWithRetry for why the subscription alone
 *  isn't enough on this app's public relays and needs periodic re-polling. A
 *  timeout separately flags the id as failed so the UI can stop waiting and
 *  offer recovery. */
export function ensureCharacterLoaded(id: CharacterId): void {
	// Deliberately doesn't early-return just because a saved copy resolves
	// the character (unlike "my characters"/live cache) — still subscribes
	// so a saved character picks up the author's edits, or a tombstone,
	// instead of silently going stale forever.
	if (getMyCharacters().some((c) => c.id === id) || cache[id] || subscribed.has(id)) return;
	subscribed.add(id);
	startSubscription(id);
	armTimeout(id);
}

/** Gives a failed load more time instead of offering recovery immediately —
 *  each retry doubles the previous wait (see timeoutMs), only for this id, so
 *  a slow relay gets more patience without changing the default timeout for
 *  every other character. */
export function retryCharacterLoad(id: CharacterId): void {
	failed = { ...failed, [id]: false };
	timeoutMs[id] = (timeoutMs[id] ?? LOAD_TIMEOUT_MS) * 2;
	startSubscription(id);
	armTimeout(id);
}
