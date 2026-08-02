import { createStore, del, get, keys, set } from 'idb-keyval';

/** Local cache of downloaded character image bytes, keyed by their original
 *  remote URL — a separate raw idb-keyval store (not routed through
 *  crypto/dataEncryption.ts) since blobs here can run into the tens of
 *  megabytes and aren't sensitive account data, just a resilience copy of
 *  already-public images. Encrypting/base64-JSON-wrapping them the way
 *  db/*.ts does for everything else would bloat storage for no benefit. */
const store = createStore('charshare-media-backup', 'media');

export async function getBackedUpMedia(url: string): Promise<Blob | undefined> {
	return get(url, store);
}

export async function saveBackedUpMedia(url: string, blob: Blob): Promise<void> {
	await set(url, blob, store);
}

export async function deleteBackedUpMedia(url: string): Promise<void> {
	await del(url, store);
}

export async function listBackedUpMediaUrls(): Promise<string[]> {
	return (await keys(store)) as string[];
}

export async function clearMediaBackup(): Promise<void> {
	const urls = await listBackedUpMediaUrls();
	await Promise.all(urls.map((url) => del(url, store)));
}
