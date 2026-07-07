import Gun from 'gun';
import 'gun/lib/rindexed';
import type { IGunInstance } from 'gun';
import { browser } from '$app/environment';
import { DEFAULT_GUN_RELAYS } from './relays';

/** Namespace root all charshare data lives under in the GUN graph, per spec
 *  ("directories under the app's own namespace, starting with APP_ID and a
 *  schema version") — lets old/new clients coexist as the model evolves. */
export const APP_ID = 'charshare';
export const SCHEMA_VERSION = 'v1';

let instance: IGunInstance | null = null;
let instanceRelayKey: string | null = null;

/** Lazily creates the singleton GUN instance, configured with the given relay
 *  peers (from Preferences — see getPreferences().gunRelays). Uses the
 *  IndexedDB storage adapter instead of GUN's default localStorage, matching
 *  this project's IndexedDB-only-for-persistence convention. Reconnecting an
 *  already-created instance to a different relay set isn't supported yet —
 *  the first caller's relays win for the lifetime of the page. */
export function getGun(relays: string[] = DEFAULT_GUN_RELAYS): IGunInstance {
	if (!browser) {
		throw new Error('GUN client is browser-only');
	}
	const relayKey = relays.join(',');
	if (instance && instanceRelayKey === relayKey) {
		return instance;
	}
	if (instance) {
		console.warn('getGun() called with different relays after the instance already exists; ignoring the new relay list.');
		return instance;
	}
	instance = new Gun({
		peers: relays,
		localStorage: false,
		radisk: true,
		file: `${APP_ID}-${SCHEMA_VERSION}`
	});
	instanceRelayKey = relayKey;
	return instance;
}

/** Test-only escape hatch: overrides the singleton so tests can use an
 *  in-memory-only Gun instance instead of production's radisk/peers config. */
export function __setGunForTests(gun: IGunInstance | null): void {
	instance = gun;
	instanceRelayKey = gun ? '__test__' : null;
}

/** Resolves a slash-separated app-relative path (e.g. "users/abc/profile") to
 *  a GUN node under the charshare namespace. Uses a single flat `.get(key)`
 *  rather than chained `.get().get()...` — chaining multiple levels deep was
 *  confirmed by isolated testing to hang subsequent `.once()`/`.on()` reads
 *  in this GUN version, even fully in-memory with no peers/storage. Since
 *  documents are opaque signed blobs (see document.ts) rather than native
 *  GUN graph fields, there's no graph-traversal benefit being given up. */
export function gunPath(gun: IGunInstance, path: string) {
	const segments = [APP_ID, SCHEMA_VERSION, ...path.split('/').filter(Boolean)];
	return gun.get(segments.join('/'));
}
