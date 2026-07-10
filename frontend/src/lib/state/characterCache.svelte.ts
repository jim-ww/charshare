import type { Character, CharacterId } from '$lib/types';
import { getMyCharacters } from './characters.svelte';
import { getCharacter, subscribeCharacter } from '$lib/gun/characters';

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
/** How often to re-ask for a not-yet-resolved character while its timeout is
 *  still running. Public community relays (see NetworkTab/gunRelays) don't
 *  reliably answer a `.get()`/`.on()` ask on the first try — a subscription
 *  left running isn't enough on its own, unlike this app's other network
 *  reads (browse/search), which implicitly get multiple tries by re-querying
 *  several index buckets/peers. Re-issuing a one-shot getCharacter() poke
 *  gives a flaky relay repeated chances within the same wait window. */
const RETRY_INTERVAL_MS = 2000;
const retryTimers = new Map<CharacterId, ReturnType<typeof setInterval>>();

export function resolveCharacter(id: CharacterId): Character | undefined {
	return getMyCharacters().find((c) => c.id === id) ?? cache[id];
}

export function isCharacterLoadFailed(id: CharacterId): boolean {
	return failed[id] === true;
}

function armTimeout(id: CharacterId): void {
	const ms = timeoutMs[id] ?? LOAD_TIMEOUT_MS;
	timeoutMs[id] = ms;
	setTimeout(() => {
		if (!resolveCharacter(id)) failed = { ...failed, [id]: true };
		stopRetrying(id);
	}, ms);
}

function stopRetrying(id: CharacterId): void {
	const timer = retryTimers.get(id);
	if (timer !== undefined) {
		clearInterval(timer);
		retryTimers.delete(id);
	}
}

function startRetrying(id: CharacterId): void {
	stopRetrying(id);
	const timer = setInterval(() => {
		if (resolveCharacter(id)) {
			stopRetrying(id);
			return;
		}
		void getCharacter(id).then((result) => {
			if (result.ok) {
				cache = { ...cache, [id]: result.doc };
				if (failed[id]) failed = { ...failed, [id]: false };
				stopRetrying(id);
			}
		});
	}, RETRY_INTERVAL_MS);
	retryTimers.set(id, timer);
}

/** Subscribes (once per id) rather than doing a single one-shot read — GUN's
 *  local read can momentarily miss data that hasn't synced from a relay yet,
 *  so a plain one-shot get can silently never resolve the character. The
 *  subscription keeps listening and fills in the cache whenever real data
 *  arrives, without an arbitrary delay/retry. A timeout separately flags the
 *  id as failed so the UI can stop waiting and offer recovery — the
 *  subscription itself is left running in case data does eventually arrive.
 *  Subscribes synchronously and unconditionally, same as the character detail
 *  page's own subscribeCharacter call (routes/characters/[id]/+page.svelte)
 *  — that's the one place this reliably works, so anything more clever here
 *  (waiting on gunPeerReady, chaining a getCharacter() pre-fetch) risks an
 *  unhandled rejection silently skipping the subscribe entirely. */
export function ensureCharacterLoaded(id: CharacterId): void {
	if (resolveCharacter(id) || subscribed.has(id)) return;
	subscribed.add(id);
	subscribeCharacter(id, (result) => {
		if (result.ok) {
			cache = { ...cache, [id]: result.doc };
			if (failed[id]) failed = { ...failed, [id]: false };
			stopRetrying(id);
		}
	});
	armTimeout(id);
	startRetrying(id);
}

/** Gives a failed load more time instead of offering recovery immediately —
 *  each retry doubles the previous wait (see timeoutMs), only for this id, so
 *  a slow relay gets more patience without changing the default timeout for
 *  every other character. */
export function retryCharacterLoad(id: CharacterId): void {
	failed = { ...failed, [id]: false };
	timeoutMs[id] = (timeoutMs[id] ?? LOAD_TIMEOUT_MS) * 2;
	armTimeout(id);
	startRetrying(id);
}
