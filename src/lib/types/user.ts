/** Base64-encoded Ed25519 public key. Doubles as the canonical identifier
 *  for both users and characters — there is no separate UUID for identity. */
export type PubKey = string;

export interface User {
  id: PubKey;
  username: string; // required, can be empty
  description: string; // required, can be empty
  created_at: number; // unix ms
}

/** Fields the current user's client alone has access to. Never sent over GUN. */
export interface Keyring {
  publicKey: PubKey;
  privateKey: Uint8Array; // stored in IndexedDB only, never serialized to GUN
}
