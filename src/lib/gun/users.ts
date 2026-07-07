import type { Keyring, PubKey, User, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring } from '$lib/state/auth.svelte';
import { getDocument, putDocument, subscribeDocument, type Validator } from './document';

function profilePath(pubkey: PubKey): string {
	return `users/${pubkey}/profile`;
}

const isUser: Validator<User> = (data): data is User => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.id === 'string' &&
		typeof d.username === 'string' &&
		typeof d.description === 'string' &&
		typeof d.signature === 'string' &&
		typeof d.created_at === 'number' &&
		typeof d.updated_at === 'number' &&
		typeof d.deleted === 'boolean' &&
		(d.deleted_at === null || typeof d.deleted_at === 'number')
	);
};

const pubkeyOf = (doc: User): PubKey => doc.id;

async function signAndPublish(draft: Omit<User, 'signature' | 'updated_at'>, keyring: Keyring): Promise<User> {
	// signDocument strips `signature` before hashing, so this placeholder value
	// never affects the signed bytes — it just gives the object a real
	// `signature` property so TS can infer T for signDocument's generic bound.
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	const doc: User = { ...withTimestamp, signature };
	await putDocument(profilePath(doc.id), doc);
	return doc;
}

/** Reads the published profile at `pubkey`, or `{ok:false}` if none exists yet,
 *  fails validation, or fails signature verification. */
export function getProfile(pubkey: PubKey): Promise<Verified<User>> {
	return getDocument(profilePath(pubkey), isUser, pubkeyOf);
}

/** Subscribes to the profile at `pubkey`. Returns an unsubscribe function. */
export function subscribeProfile(pubkey: PubKey, onUpdate: (result: Verified<User>) => void): () => void {
	return subscribeDocument(profilePath(pubkey), isUser, pubkeyOf, onUpdate);
}

/** Signs and publishes the current user's profile. Preserves `created_at`
 *  from the existing published profile, if any (this is an edit, not a new doc). */
export async function publishProfile(fields: { username: string; description: string }): Promise<User> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	const existing = await getProfile(keyring.publicKey);
	return signAndPublish(
		{
			id: keyring.publicKey,
			username: fields.username,
			description: fields.description,
			deleted: false,
			deleted_at: null,
			created_at: existing.ok ? existing.doc.created_at : Date.now()
		},
		keyring
	);
}

/** Tombstones the current user's profile — a new signed snapshot with
 *  `deleted: true`, not a graph removal (see spec: peers who already synced
 *  can't be forced to erase it). */
export async function deleteProfile(): Promise<User> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	const existing = await getProfile(keyring.publicKey);
	if (!existing.ok) throw new Error('No profile to delete.');
	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing.doc;
	return signAndPublish({ ...rest, deleted: true, deleted_at: Date.now() }, keyring);
}
