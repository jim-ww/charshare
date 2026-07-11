import type { PubKey, Verified } from '$lib/types';
import { verifyDocument } from '$lib/crypto/sign';
import type { GunNode } from './client';

/** Caller-supplied type guard — schema validation happens per document type
 *  (User/Character/Comment), not generically here. Invalid or unverifiable
 *  documents are dropped by the caller, never partially trusted (see spec). */
export type Validator<T> = (data: unknown) => data is T;

/** The only shape these helpers actually need — deliberately looser than the
 *  `Signed` type (no `author`), since User's `id` already is its pubkey and
 *  has no separate author field (see spec ## Signing). */
type Signable = { signature: string };

/** Documents are stored as a single JSON-stringified blob per path rather than
 *  as native GUN graph fields. Two reasons: (1) GUN has no first-class array
 *  support, and several document fields are arrays (tags, alternate_greetings);
 *  (2) the app's own conflict resolution is whole-document (version/updated_at,
 *  see spec), so GUN's field-level CRDT merge would fight our model instead of
 *  helping it. A blob keeps the exact bytes that were canonicalized and signed. */
interface DocumentEnvelope {
	json: string;
}

async function parseAndVerify<T extends Signable>(
	raw: unknown,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey
): Promise<Verified<T>> {
	const envelope = raw as Partial<DocumentEnvelope> | null | undefined;
	if (!envelope || typeof envelope.json !== 'string') {
		return { ok: false, reason: 'invalid_schema' };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(envelope.json);
	} catch {
		return { ok: false, reason: 'invalid_schema' };
	}
	if (!validate(parsed)) {
		return { ok: false, reason: 'invalid_schema' };
	}
	const verified = await verifyDocument(parsed, pubkeyOf(parsed));
	if (!verified) {
		return { ok: false, reason: 'bad_signature' };
	}
	return { ok: true, doc: parsed };
}

/** GUN's put ack isn't guaranteed to fire in every environment — confirmed via
 *  isolated testing that it can go unfired even for the simplest in-memory,
 *  single-level write, while the local graph write itself is synchronous and
 *  immediately readable. Timing out and resolving optimistically means a
 *  missing ack (no reachable storage/peer) doesn't hang the caller forever. */
const PUT_ACK_TIMEOUT_MS = 3000;

/** Writes an already-signed document to `node`. Callers are responsible for
 *  signing it first (see signDocument) — this function does not sign. `node`
 *  is caller-resolved (see client.ts: gunPath/ownNode/authorNode) since where
 *  a document lives — shared index, the author's own protected space, or
 *  another author's public space — depends on what's being written. */
export function putDocument<T extends Signable>(node: GunNode, doc: T): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve();
			}
		}, PUT_ACK_TIMEOUT_MS);
		node.put({ json: JSON.stringify(doc) } satisfies DocumentEnvelope, (ack: { err?: string; ok?: unknown }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// GUN aggregates acks across all configured peers into one callback and
			// treats the whole put as failed if *any single peer* errors (see
			// node_modules/gun/gun.js's `ack()`, which sets ctx.err from the first
			// erroring peer and fires immediately — a known upstream quirk, not
			// specific to any peer). With several public, unreliable relays
			// configured (see relays.ts), one flaky/rejecting relay would otherwise
			// block every write, even though the local write always lands and the
			// other peers usually accept it too. So an error ack is logged, not
			// treated as failure — matches the timeout-above's already-optimistic
			// stance on this app's unreliable public relays.
			if (ack.err) console.warn('[gun] put ack error (ignored, wrote locally)', ack.err);
			resolve();
		});
	});
}

/** One-shot read of `node`, validated against `validate` and signature-checked
 *  against the pubkey `pubkeyOf` extracts from the parsed document. */
export function getDocument<T extends Signable>(
	node: GunNode,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey
): Promise<Verified<T>> {
	return new Promise((resolve) => {
		node.once((data: unknown) => {
			resolve(parseAndVerify(data, validate, pubkeyOf));
		});
	});
}

/** Subscribes to `node`, calling `onUpdate` with a validated+verified result
 *  every time the underlying data changes (including the initial value).
 *  Returns an unsubscribe function. */
export function subscribeDocument<T extends Signable>(
	node: GunNode,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey,
	onUpdate: (result: Verified<T>) => void
): () => void {
	const handler = (data: unknown) => {
		void parseAndVerify(data, validate, pubkeyOf).then(onUpdate);
	};
	node.on(handler);
	return () => node.off();
}

const RETRY_INTERVAL_MS = 2000;

/** Wraps subscribeDocument with a periodic one-shot re-fetch (getDocument).
 *  This app's public community relays (see NetworkTab/gunRelays) don't
 *  reliably answer a `.get()`/`.on()` ask on the first try, and a `.on()`
 *  subscription left running on its own isn't a fix — it can just sit idle
 *  on a path the relay never answers (confirmed live: chat characters
 *  resolved "every other" page load with subscribeDocument alone). Re-issuing
 *  a one-shot getDocument() poke every RETRY_INTERVAL_MS gives a flaky relay
 *  repeated chances. Retrying stops once `isResolved()` is true or the
 *  returned function is called (e.g. from the caller's own give-up timeout —
 *  see characterCache.svelte.ts:armTimeout). */
export function subscribeDocumentWithRetry<T extends Signable>(
	node: GunNode,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey,
	onUpdate: (result: Verified<T>) => void,
	isResolved: () => boolean
): () => void {
	const unsubscribe = subscribeDocument(node, validate, pubkeyOf, onUpdate);
	const timer = setInterval(() => {
		if (isResolved()) {
			clearInterval(timer);
			return;
		}
		void getDocument(node, validate, pubkeyOf).then((result) => {
			if (result.ok) onUpdate(result);
		});
	}, RETRY_INTERVAL_MS);
	return () => {
		unsubscribe();
		clearInterval(timer);
	};
}
