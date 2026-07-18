import { get, set, del } from '$lib/crypto/dataEncryption';
import type { Keyring } from '$lib/types';

/** Private key storage — IndexedDB only, never localStorage (see spec: Signing). */
const STORE_KEY = 'charshare:keyring';

export function loadKeyring(): Promise<Keyring | undefined> {
	return get<Keyring>(STORE_KEY);
}

export function saveKeyring(keyring: Keyring): Promise<void> {
	return set(STORE_KEY, keyring);
}

export function clearKeyring(): Promise<void> {
	return del(STORE_KEY);
}

/** Whether this browser has explicitly registered an account (published a
 *  profile) rather than just holding a freshly generated, never-shown-to-the-
 *  network local identity. Separate flag from the keyring itself so guests
 *  keep signing local-only content without ever touching the network. */
const REGISTERED_KEY = 'charshare:account-registered';

export function loadRegistered(): Promise<boolean | undefined> {
	return get<boolean>(REGISTERED_KEY);
}

export function saveRegistered(value: boolean): Promise<void> {
	return set(REGISTERED_KEY, value);
}
