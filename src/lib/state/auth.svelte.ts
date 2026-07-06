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
