import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { get as idbGet, set, clear as idbClear } from 'idb-keyval';
import { enableEncryption, disableEncryption, isEncryptionEnabled, get, lock } from './dataEncryption';

/** Unlike dataEncryption.test.ts (which fakes idb-keyval with an in-memory
 *  Map — fine for behavior, but a Map has no notion of a transaction), this
 *  file runs against a real IndexedDB implementation (fake-indexeddb) so
 *  enableEncryption/disableEncryption's migration actually goes through a
 *  real IDBTransaction. That's what lets it prove the thing that matters:
 *  if the transaction aborts partway (standing in for the process being
 *  killed mid-migration), none of the batched writes land — not some.
 *
 *  idb-keyval memoizes its IndexedDB connection at module scope the first
 *  time it's used, so swapping the global `indexedDB` out per test (to get
 *  isolated databases) doesn't actually isolate anything — the module keeps
 *  talking to whichever connection it opened first. Tests here instead
 *  share one real database for the whole file and clear() it between
 *  tests, which sidesteps that entirely. */

const STORE_KEY = 'charshare:chats';
const META_KEY = 'charshare:encryption-meta';

describe('dataEncryption atomicity (real IndexedDB)', () => {
	beforeEach(async () => {
		await idbClear();
		lock();
	});

	it('aborting the transaction partway through the batch rolls back everything, not just what came after', async () => {
		await set(STORE_KEY, { hello: 'world' });

		// enableEncryption's atomicWrite batches two puts here: the migrated
		// `charshare:chats` entry, then the meta envelope. Explicitly aborting
		// the transaction right as the *second* put is issued simulates dying
		// mid-migration, after the data key was already queued for write but
		// before the batch (data + meta) actually committed — abort() discards
		// every queued operation in the transaction, not just the one in
		// flight, which is the actual IndexedDB guarantee atomicWrite relies on.
		const originalPut = IDBObjectStore.prototype.put;
		let putCount = 0;
		IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof originalPut>) {
			putCount++;
			if (putCount === 2) this.transaction.abort();
			return originalPut.apply(this, args);
		} as typeof originalPut;

		try {
			await expect(enableEncryption('correct horse battery staple')).rejects.toBeDefined();
		} finally {
			IDBObjectStore.prototype.put = originalPut;
		}

		// Neither the data key's re-encrypted value nor the meta key made it
		// in — the transaction rolled back as a whole, not partially.
		expect(await idbGet(STORE_KEY)).toEqual({ hello: 'world' });
		expect(await idbGet(META_KEY)).toBeUndefined();
	});

	it('a successful migration commits data and meta together', async () => {
		await set(STORE_KEY, { hello: 'world' });
		await enableEncryption('correct horse battery staple');

		expect(await isEncryptionEnabled()).toBe(true);
		expect(await get(STORE_KEY)).toEqual({ hello: 'world' });
		// Raw storage now holds ciphertext, not the plaintext object.
		expect(await idbGet(STORE_KEY)).not.toEqual({ hello: 'world' });
	});

	it('disableEncryption is likewise atomic: a mid-batch failure leaves data encrypted with meta intact', async () => {
		await set(STORE_KEY, { hello: 'world' });
		await enableEncryption('correct horse battery staple');

		const originalPut = IDBObjectStore.prototype.put;
		let putCount = 0;
		IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof originalPut>) {
			putCount++;
			if (putCount === 1) this.transaction.abort();
			return originalPut.apply(this, args);
		} as typeof originalPut;

		try {
			await expect(disableEncryption('correct horse battery staple')).rejects.toBeDefined();
		} finally {
			IDBObjectStore.prototype.put = originalPut;
		}

		// Still fully encrypted — meta wasn't deleted, and the data key wasn't
		// left as a decrypted plaintext value under a still-"encrypted" meta.
		expect(await isEncryptionEnabled()).toBe(true);
		expect(await idbGet(META_KEY)).toBeDefined();
		expect(await idbGet(STORE_KEY)).not.toEqual({ hello: 'world' });
	});
});
