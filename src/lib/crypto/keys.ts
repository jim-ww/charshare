import * as ed from '@noble/ed25519';
import type { Keyring, PubKey } from '$lib/types';
import { toBase64, fromBase64 } from './base64';

/** Generates a new Ed25519 identity. There is no recovery mechanism — losing
 *  the returned privateKey means losing this identity permanently. */
export async function generateKeyring(): Promise<Keyring> {
	const { secretKey, publicKey } = await ed.keygenAsync();
	return { publicKey: toBase64(publicKey), privateKey: secretKey };
}

export function pubKeyToBytes(pubkey: PubKey): Uint8Array {
	return fromBase64(pubkey);
}
