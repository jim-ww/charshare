import type { Keyring, PubKey } from '$lib/types';
import { generateKeyring } from '$lib/crypto/keys';
import { loadKeyring, saveKeyring } from '$lib/db/keyring';

let keyring = $state<Keyring | null>(null);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getCurrentUser(): PubKey | null {
	return keyring?.publicKey ?? null;
}

export function getKeyring(): Keyring | null {
	return keyring;
}

export function isAuthReady(): boolean {
	return ready;
}

/** Switches this browser to a different account (see identity/backup.ts) —
 *  persists it as the new local identity, replacing whatever was here. */
export async function setKeyring(next: Keyring): Promise<void> {
	await saveKeyring(next);
	keyring = next;
	ready = true;
}

/** Test-only escape hatch: sets the keyring directly, bypassing IndexedDB
 *  (unavailable under plain Node/vitest). */
export function __setKeyringForTests(k: Keyring | null): void {
	keyring = k;
	ready = k !== null;
}

/** Loads the identity from IndexedDB, or generates and persists a new one on
 *  first run (see spec: no key recovery — this is the only copy). Safe to
 *  call multiple times; the underlying load/generate only happens once. */
export function initAuth(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			const existing = await loadKeyring();
			if (existing) {
				keyring = existing;
			} else {
				const generated = await generateKeyring();
				await saveKeyring(generated);
				keyring = generated;
			}
			ready = true;
		})();
	}
	return initPromise;
}
