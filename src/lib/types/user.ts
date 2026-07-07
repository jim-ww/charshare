import type { Tombstonable } from './signed';

/** Base64-encoded Ed25519 public key. Doubles as the canonical identifier
 *  for both users and characters — there is no separate UUID for identity. */
export type PubKey = string;

export interface UserFields {
  id: PubKey;
  username: string; // required, can be empty
  description: string; // required, can be empty
  image_url?: string;
}

/** The full document as it's signed, published, and validated. Unlike
 *  Character/Comment, there's no separate `author` field — `id` already
 *  is the signer's pubkey (see spec ## Signing: "already present as author/id"). */
export type User = UserFields &
  Tombstonable & {
    signature: string; // base64, over the canonicalized document minus this field
    created_at: number; // unix ms
    updated_at: number; // unix ms
  };

/** Fields the current user's client alone has access to. Never sent over GUN. */
export interface Keyring {
  publicKey: PubKey;
  privateKey: Uint8Array; // stored in IndexedDB only, never serialized to GUN
}
