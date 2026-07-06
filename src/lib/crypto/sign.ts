import * as ed from '@noble/ed25519';
import type { Keyring, PubKey } from '$lib/types';
import { canonicalizeForSigning } from './canonicalize';
import { toBase64, fromBase64 } from './base64';

/** Signs the canonicalized document (minus any existing `signature` field)
 *  with the given keyring. Returns the base64 signature to store alongside it. */
export async function signDocument<T extends { signature?: string }>(
	doc: T,
	keyring: Keyring
): Promise<string> {
	const message = new TextEncoder().encode(canonicalizeForSigning(doc));
	const signature = await ed.signAsync(message, keyring.privateKey);
	return toBase64(signature);
}

/** Verifies `doc.signature` against `pubkey` — the caller decides which field
 *  on the document that pubkey comes from (`author` for Character/Comment,
 *  `id` for User, since a user's id is their own pubkey). */
export async function verifyDocument<T extends { signature: string }>(
	doc: T,
	pubkey: PubKey
): Promise<boolean> {
	const message = new TextEncoder().encode(canonicalizeForSigning(doc));
	try {
		const signature = fromBase64(doc.signature);
		const publicKey = fromBase64(pubkey);
		return await ed.verifyAsync(signature, message, publicKey);
	} catch {
		return false;
	}
}
