import type { Keyring, PubKey } from '$lib/types';
import { canonicalizeForSigning } from './canonicalize';

/** Builds a Web Crypto JWK for ECDSA P-256 sign/verify from a GUN SEA pubkey
 *  (`x.y` base64 pair), matching gun's own key encoding. */
function jwkFromPair(pub: string, priv?: string): JsonWebKey {
	const [x, y] = pub.split('.');
	return {
		kty: 'EC',
		crv: 'P-256',
		x,
		y,
		...(priv ? { d: priv } : {}),
		ext: true,
		key_ops: priv ? ['sign'] : ['verify']
	} as JsonWebKey;
}

async function sha256(message: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
}

function bytesToBase64(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(base64: string): ArrayBuffer {
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

/** Signs the canonicalized document (minus any existing `signature` field)
 *  and returns just the base64 ECDSA signature. */
export async function signDocument<T extends { signature?: string }>(
	doc: T,
	keyring: Keyring
): Promise<string> {
	const key = await crypto.subtle.importKey(
		'jwk',
		jwkFromPair(keyring.pair.pub, keyring.pair.priv),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const hash = await sha256(canonicalizeForSigning(doc));
	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, hash);
	return bytesToBase64(sig);
}

/** Verifies `doc.signature` against `pubkey` — the caller decides which field
 *  on the document that pubkey comes from (`author` for Character/Comment,
 *  `id` for User, since a user's id is their own pubkey). Recomputes the hash
 *  from the document's current (canonicalized) contents itself, so a
 *  signature that's valid but was made over different fields — i.e. the
 *  document was tampered with after signing — is rejected. */
export async function verifyDocument<T extends { signature: string }>(
	doc: T,
	pubkey: PubKey
): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey(
			'jwk',
			jwkFromPair(pubkey),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		const hash = await sha256(canonicalizeForSigning(doc));
		const sig = base64ToBytes(doc.signature);
		return await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, sig, hash);
	} catch {
		return false;
	}
}
