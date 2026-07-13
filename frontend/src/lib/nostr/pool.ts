import { SimplePool } from 'nostr-tools/pool';
import { browser } from '$app/environment';
import type { PubKey } from '$lib/types';
import { getActiveRelays } from '$lib/state/preferences.svelte';

let instance: SimplePool | null = null;

/** Lazily creates the singleton relay pool. There is no "login"/auth step —
 *  publishing to a relay just means signing an event and sending it; any
 *  relay will accept a validly-signed event from any pubkey (relay-side
 *  write policies aside). */
export function getPool(): SimplePool {
	if (!browser) {
		throw new Error('Nostr pool is browser-only');
	}
	if (!instance) {
		instance = new SimplePool();
	}
	return instance;
}

/** How long a "none of these relays are reachable" result is trusted before
 *  re-attempting a real connection. Without this, a caller that checks
 *  connectivity once per item (e.g. restoring N characters from a data
 *  archive) pays the full connect timeout on every single item even though
 *  the relay set hasn't changed and was already known to be unreachable —
 *  turning an offline import into an O(N) wait instead of O(1). */
const CONNECTIVITY_CACHE_MS = 10000;

let connectivityCache: { relaysKey: string; connected: boolean; checkedAt: number } | null = null;

/** Resolves once at least one relay in `relays` has connected, or after
 *  `timeoutMs`, whichever comes first — so a cold-started reader can give
 *  the WebSocket handshake a moment to finish before issuing a query,
 *  instead of racing it and coming back empty. Returns whether a relay was
 *  actually reached, so callers can skip further network calls entirely
 *  when nothing is reachable rather than attempting them anyway. */
export async function poolConnected(relays: string[] = getActiveRelays(), timeoutMs = 1500): Promise<boolean> {
	const relaysKey = [...relays].sort().join(',');
	if (
		connectivityCache &&
		connectivityCache.relaysKey === relaysKey &&
		Date.now() - connectivityCache.checkedAt < CONNECTIVITY_CACHE_MS
	) {
		return connectivityCache.connected;
	}
	const pool = getPool();
	const connected = await Promise.race([
		Promise.any(relays.map((url) => pool.ensureRelay(url).then(() => true))).catch(() => false),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
	]);
	connectivityCache = { relaysKey, connected, checkedAt: Date.now() };
	return connected;
}

/** In-memory cache of each author's declared NIP-65 relay list (kind 10002),
 *  keyed by pubkey — avoids re-querying it on every single author-scoped
 *  lookup. Session-scoped only; no persistence. Populated/consumed by the
 *  outbox-model resolution helpers (see nostr/relayList.ts). */
const relayListCache = new Map<string, { read: string[]; write: string[] }>();

export function getCachedRelayList(pubkey: PubKey): { read: string[]; write: string[] } | undefined {
	return relayListCache.get(pubkey);
}

export function setCachedRelayList(pubkey: PubKey, relays: { read: string[]; write: string[] }): void {
	relayListCache.set(pubkey, relays);
}

/** Test-only escape hatch: overrides the singleton so tests can use a fake
 *  pool instead of production's real-WebSocket SimplePool. */
export function __setPoolForTests(pool: SimplePool | null): void {
	instance = pool;
	relayListCache.clear();
	connectivityCache = null;
}
