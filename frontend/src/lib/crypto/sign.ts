import SEA from '$lib/gun/sea';
import type { Keyring, PubKey } from '$lib/types';
import { canonicalize, canonicalizeForSigning } from './canonicalize';

/** Signs the canonicalized document (minus any existing `signature` field)
 *  with the given keyring's SEA pair. Returns the SEA-wrapped signature
 *  string (contains both the signed message and the signature itself) to
 *  store alongside the document. */
export async function signDocument<T extends { signature?: string }>(
	doc: T,
	keyring: Keyring
): Promise<string> {
	const message = canonicalizeForSigning(doc);
	return SEA.sign(message, keyring.pair);
}

/** Verifies `doc.signature` against `pubkey` — the caller decides which field
 *  on the document that pubkey comes from (`author` for Character/Comment,
 *  `id` for User, since a user's id is their own pubkey). Confirms both that
 *  the signature is valid for `pubkey` AND that the signed message matches
 *  the document's current (canonicalized) contents — a signature that
 *  verifies but was made over different fields means the document was
 *  tampered with after signing. */
export async function verifyDocument<T extends { signature: string }>(
	doc: T,
	pubkey: PubKey
): Promise<boolean> {
	try {
		const verified = await SEA.verify(doc.signature, pubkey);
		if (verified === undefined) return false;
		// SEA.verify parses the signed message back into a JS value rather than
		// returning the original string, so re-canonicalize before comparing.
		return canonicalize(verified) === canonicalizeForSigning(doc);
	} catch {
		return false;
	}
}
