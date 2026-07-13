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

/** Signs `template` and publishes it to `relays`, resolving once any relay
 *  acks (or after PUBLISH_TIMEOUT_MS, whichever comes first). Returns the
 *  signed event so callers can use its id/tags immediately without a
 *  round-trip read. */
export async function publishEvent(template: EventTemplate, keyring: Keyring, relays: string[]): Promise<NostrEvent> {
	const event = signEvent(template, keyring);
	const pool = getPool();
	const publishPromises = pool.publish(relays, event).map((p) =>
		p.catch((err) => {
			console.warn('[nostr] publish rejected by a relay (ignored, other relays may still accept it)', err);
		})
	);
	await Promise.race([
		Promise.any(publishPromises).catch(() => undefined),
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
	await poolConnected(relays);
	const pool = getPool();
	const events = await pool.querySync(relays, filter);
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
