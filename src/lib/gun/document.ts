import type { PubKey, Verified } from '$lib/types';
import { verifyDocument } from '$lib/crypto/sign';
import { getGun, gunPath } from './client';

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
 *  missing ack (no reachable storage/peer) doesn't hang the caller forever;
 *  an ack that does arrive with an error still rejects immediately. */
const PUT_ACK_TIMEOUT_MS = 3000;

/** Writes an already-signed document to `path`. Callers are responsible for
 *  signing it first (see signDocument) — this function does not sign. */
export function putDocument<T extends Signable>(path: string, doc: T): Promise<void> {
	const node = gunPath(getGun(), path);
	return new Promise((resolve, reject) => {
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
			if (ack.err) reject(new Error(ack.err));
			else resolve();
		});
	});
}

/** One-shot read of `path`, validated against `validate` and signature-checked
 *  against the pubkey `pubkeyOf` extracts from the parsed document. */
export function getDocument<T extends Signable>(
	path: string,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey
): Promise<Verified<T>> {
	const node = gunPath(getGun(), path);
	return new Promise((resolve) => {
		node.once((data: unknown) => {
			resolve(parseAndVerify(data, validate, pubkeyOf));
		});
	});
}

/** Subscribes to `path`, calling `onUpdate` with a validated+verified result
 *  every time the underlying data changes (including the initial value).
 *  Returns an unsubscribe function. */
export function subscribeDocument<T extends Signable>(
	path: string,
	validate: Validator<T>,
	pubkeyOf: (doc: T) => PubKey,
	onUpdate: (result: Verified<T>) => void
): () => void {
	const node = gunPath(getGun(), path);
	const handler = (data: unknown) => {
		void parseAndVerify(data, validate, pubkeyOf).then(onUpdate);
	};
	node.on(handler);
	return () => node.off();
}
