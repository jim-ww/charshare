import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SimplePool } from 'nostr-tools/pool';
import type { Event as NostrEvent } from 'nostr-tools';
import { generateKeyring } from './keys';
import { signEvent } from './sign';
import { publishEvent, queryEvents, subscribeEvents } from './event';
import { __setPoolForTests } from './pool';

/** A minimal fake pool exercising only the surface nostr/event.ts actually
 *  calls, so these tests don't depend on real relay connectivity. */
function fakePool(events: NostrEvent[]) {
	const stored = [...events];
	let subscribedHandler: ((event: NostrEvent) => void) | null = null;
	return {
		pool: {
			ensureRelay: async () => ({}),
			publish(_relays: string[], event: NostrEvent) {
				stored.push(event);
				return [Promise.resolve('ok')];
			},
			querySync(_relays: string[], filter: { kinds?: number[]; authors?: string[] }) {
				return Promise.resolve(
					stored.filter(
						(e) =>
							(!filter.kinds || filter.kinds.includes(e.kind)) &&
							(!filter.authors || filter.authors.includes(e.pubkey))
					)
				);
			},
			subscribeMany(_relays: string[], _filter: unknown, params: { onevent: (e: NostrEvent) => void }) {
				subscribedHandler = params.onevent;
				return { close: () => {} };
			}
		} as unknown as SimplePool,
		emit(event: NostrEvent) {
			subscribedHandler?.(event);
		},
		stored
	};
}

afterEach(() => {
	__setPoolForTests(null);
});

describe('publishEvent / queryEvents', () => {
	it('publishes a signed event and finds it via a matching filter', async () => {
		const keyring = generateKeyring();
		const { pool } = fakePool([]);
		__setPoolForTests(pool);

		const published = await publishEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring, ['wss://fake']);
		expect(published.pubkey).toBe(keyring.publicKey);

		const found = await queryEvents({ kinds: [1], authors: [keyring.publicKey] }, ['wss://fake']);
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe(published.id);
	});

	it('drops events that fail signature verification', async () => {
		const keyring = generateKeyring();
		const signed = signEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring);
		const tampered = { ...JSON.parse(JSON.stringify(signed)), content: 'mallory' };
		const { pool } = fakePool([tampered]);
		__setPoolForTests(pool);

		const found = await queryEvents({ kinds: [1] }, ['wss://fake']);
		expect(found).toHaveLength(0);
	});

	it('resolves once at least one relay acks, even if others reject', async () => {
		const keyring = generateKeyring();
		__setPoolForTests({
			ensureRelay: async () => ({}),
			publish: () => [Promise.reject(new Error('relay A down')), Promise.resolve('ok')],
			querySync: async () => [],
			subscribeMany: () => ({ close: () => {} })
		} as unknown as SimplePool);

		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const published = await publishEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring, [
			'wss://a',
			'wss://b'
		]);

		expect(published.pubkey).toBe(keyring.publicKey);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
		warn.mockRestore();
		error.mockRestore();
	});

	it('logs a distinct error (not just per-relay warnings) when every relay rejects the publish', async () => {
		const keyring = generateKeyring();
		__setPoolForTests({
			ensureRelay: async () => ({}),
			publish: () => [Promise.reject(new Error('relay A down')), Promise.reject(new Error('relay B down'))],
			querySync: async () => [],
			subscribeMany: () => ({ close: () => {} })
		} as unknown as SimplePool);

		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		// Still resolves (optimistic, non-blocking) — the signed event is
		// returned regardless, but the failure is now surfaced distinctly.
		await publishEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring, ['wss://a', 'wss://b']);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(error).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		error.mockRestore();
	});
});

describe('subscribeEvents', () => {
	it('forwards only verified events to the callback', () => {
		const keyring = generateKeyring();
		const { pool, emit } = fakePool([]);
		__setPoolForTests(pool);

		const received: NostrEvent[] = [];
		const unsubscribe = subscribeEvents({ kinds: [1] }, ['wss://fake'], (e) => received.push(e));

		const good = signEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring);
		const bad = { ...JSON.parse(JSON.stringify(good)), content: 'mallory' };
		emit(good);
		emit(bad);

		expect(received).toEqual([good]);
		unsubscribe();
	});
});
