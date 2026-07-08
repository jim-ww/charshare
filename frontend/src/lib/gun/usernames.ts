import type { Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getDocument, putDocument, type Validator } from './document';
import { getGun, gunPath } from './client';

/** A single signed claim per normalized username — unlike tags/names (many
 *  characters per key), a username has exactly one live claim at a time, so
 *  this is a plain document at a flat key rather than a keyed-pointer index
 *  (see signedIndex.ts). "First-come-wins" is enforced client-side only:
 *  claimUsername refuses to overwrite another author's still-live claim, but
 *  GUN itself has no consensus, so two clients racing to claim the same name
 *  at nearly the same instant could both believe they won until the graph
 *  converges (last-write-wins by GUN's own HAM conflict resolution) — an
 *  accepted limitation of a P2P system with no server-side arbiter. */
interface UsernameClaim {
	username: string;
	authorPub: PubKey;
	claimed_at: number;
	deleted: boolean;
	signature: string;
}

const isUsernameClaim: Validator<UsernameClaim> = (data): data is UsernameClaim => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.username === 'string' &&
		typeof d.authorPub === 'string' &&
		typeof d.claimed_at === 'number' &&
		typeof d.deleted === 'boolean' &&
		typeof d.signature === 'string'
	);
};

const pubkeyOf = (doc: UsernameClaim): PubKey => doc.authorPub;

export function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

function claimNode(normalized: string) {
	return gunPath(getGun(), `usernames/${encodeURIComponent(normalized)}`);
}

/** Reads the current claim on `username`, or `{ok:false}` if unclaimed (or
 *  claimed by an invalid/unverifiable document). */
export function getUsernameClaim(username: string): Promise<Verified<UsernameClaim>> {
	return getDocument(claimNode(normalizeUsername(username)), isUsernameClaim, pubkeyOf);
}

/** Claims `username` for `keyring`'s author. Throws if it's already validly
 *  claimed (and not released) by a different author. Re-claiming your own
 *  username is a cheap no-op-ish re-sign, preserving the original claim time. */
export async function claimUsername(username: string, keyring: Keyring): Promise<void> {
	const normalized = normalizeUsername(username);
	if (!normalized) throw new Error('Username cannot be empty.');

	const existing = await getUsernameClaim(normalized);
	if (existing.ok && !existing.doc.deleted && existing.doc.authorPub !== keyring.publicKey) {
		throw new Error('Username is already taken.');
	}

	const claimed_at = existing.ok && existing.doc.authorPub === keyring.publicKey ? existing.doc.claimed_at : Date.now();
	const draft: Omit<UsernameClaim, 'signature'> = {
		username: normalized,
		authorPub: keyring.publicKey,
		claimed_at,
		deleted: false
	};
	const doc = { ...draft, signature: '' };
	doc.signature = await signDocument(doc, keyring);
	await putDocument(claimNode(normalized), doc);
}

/** Releases `username`'s claim (tombstone), so it becomes available to
 *  others — used when a user changes their username. Silently does nothing
 *  if `keyring` doesn't actually hold the claim (nothing to release, or it's
 *  someone else's). */
export async function releaseUsername(username: string, keyring: Keyring): Promise<void> {
	const normalized = normalizeUsername(username);
	if (!normalized) return;
	const existing = await getUsernameClaim(normalized);
	if (!existing.ok || existing.doc.authorPub !== keyring.publicKey) return;

	const draft = { ...existing.doc, deleted: true, signature: '' };
	draft.signature = await signDocument(draft, keyring);
	await putDocument(claimNode(normalized), draft);
}
