import type { Event as NostrEvent, EventTemplate, Filter } from 'nostr-tools';
import type { Keyring } from '$lib/types';
import { signEvent, verifySignedEvent } from './sign';
import { getPool, poolConnected } from './pool';

/** A relay's publish ack isn't guaranteed to fire promptly on flaky public
 *  relays (SimplePool.publish's per-relay promises), so this timeout keeps a
 *  slow/unreachable relay from hanging the caller forever. As long as at
 *  least one relay accepts the event (or the timeout elapses), the caller
 *  moves on — an optimistic, non-blocking write stance. */
const PUBLISH_TIMEOUT_MS = 3000;

/** SimplePool.querySync only resolves once every relay's subscription closes
 *  (EOSE or its own internal timeout) — if a single relay stalls at the
 *  connection level (e.g. accepts a handshake but never completes it), the
 *  whole query can hang forever with no error. This timeout keeps that from
 *  wedging callers (like account import, which queries once per restored
 *  character) — falling back to whatever events were already collected. */
const QUERY_TIMEOUT_MS = 5000;

/** Signs `template` and publishes it to `relays`, resolving once any relay
 *  acks (or after PUBLISH_TIMEOUT_MS, whichever comes first). Returns the
 *  signed event so callers can use its id/tags immediately without a
 *  round-trip read. */
export async function publishEvent(template: EventTemplate, keyring: Keyring, relays: string[]): Promise<NostrEvent> {
	const event = signEvent(template, keyring);
	const pool = getPool();
	// Re-throwing after logging (rather than swallowing into a resolved
	// `undefined`) matters here — Promise.any below only rejects if every
	// relay's promise rejects, so a per-relay `.catch` that resolves instead
	// would make Promise.any resolve on the very first *settled* promise
	// regardless of whether it actually succeeded, silently treating a
	// publish that failed on every single relay as a success.
	const publishPromises = pool.publish(relays, event).map((p) =>
		p.catch((err) => {
			console.warn('[nostr] publish rejected by a relay (ignored, other relays may still accept it)', err);
			throw err;
		})
	);
	await Promise.race([
		Promise.any(publishPromises).catch((err) => {
			console.error('[nostr] publish failed on every relay', err);
		}),
		new Promise<void>((resolve) => setTimeout(resolve, PUBLISH_TIMEOUT_MS))
	]);
	return event;
}

/** One-shot query against `relays`, returning only events that pass signature
 *  verification — anything else is silently dropped, never partially
 *  trusted (see spec). No per-type `Validator<T>`/`pubkeyOf` pair needed
 *  here: the signature check is uniform and kind-agnostic (the pubkey is
 *  part of the event itself). */
export async function queryEvents(filter: Filter, relays: string[]): Promise<NostrEvent[]> {
	// poolConnected's own timeout is just an optimistic "give the handshake a
	// moment" wait — real relays routinely take longer than that to connect,
	// so its result must never gate whether we actually query: doing so would
	// make queryEvents silently return nothing for any relay that's merely
	// slow rather than truly unreachable (this broke browsing/search/profile
	// lookups network-wide once poolConnected's per-relay-set cache started
	// remembering that false verdict). The QUERY_TIMEOUT_MS race below is
	// what actually guards against a stalled relay hanging the caller.
	await poolConnected(relays);
	const pool = getPool();
	const events = await Promise.race([
		pool.querySync(relays, filter),
		new Promise<NostrEvent[]>((resolve) => setTimeout(() => resolve([]), QUERY_TIMEOUT_MS))
	]);
	return events.filter(verifySignedEvent);
}

/** Subscribes to `filter` on `relays`, calling `onEvent` for every verified
 *  event received (including ones already stored, per relay REQ semantics).
 *  Returns an unsubscribe function. */
export function subscribeEvents(filter: Filter, relays: string[], onEvent: (event: NostrEvent) => void): () => void {
	const pool = getPool();
	const sub = pool.subscribeMany(relays, filter, {
		onevent(event) {
			if (verifySignedEvent(event)) onEvent(event);
		}
	});
	return () => sub.close();
}

const RETRY_INTERVAL_MS = 2000;

/** Wraps subscribeEvents with a periodic one-shot re-query — public relays
 *  don't reliably push updates to a live subscription on the first try.
 *  Retrying stops once `isResolved()` is true or the returned function is
 *  called. */
export function subscribeEventsWithRetry(
	filter: Filter,
	relays: string[],
	onEvent: (event: NostrEvent) => void,
	isResolved: () => boolean
): () => void {
	const unsubscribe = subscribeEvents(filter, relays, onEvent);
	const timer = setInterval(() => {
		if (isResolved()) {
			clearInterval(timer);
			return;
		}
		void queryEvents(filter, relays).then((events) => {
			for (const event of events) onEvent(event);
		});
	}, RETRY_INTERVAL_MS);
	return () => {
		unsubscribe();
		clearInterval(timer);
	};
}
