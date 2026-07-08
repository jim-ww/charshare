import SEA from '$lib/gun/sea';
import type { Keyring } from '$lib/types';

/** Generates a new SEA (ECDSA P-256) identity. There is no recovery mechanism
 *  — losing the returned pair means losing this identity permanently. Using a
 *  GUN SEA pair (rather than a hand-rolled Ed25519 key) is what lets this
 *  identity also authenticate a `gun.user()` session later, for protected
 *  per-author storage. */
export async function generateKeyring(): Promise<Keyring> {
	const pair = await SEA.pair();
	return { publicKey: pair.pub, pair };
}
