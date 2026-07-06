import { get, set, del } from 'idb-keyval';
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
