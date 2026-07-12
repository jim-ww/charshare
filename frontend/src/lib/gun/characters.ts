import type { Character, CharacterDraft, CharacterId, Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { getDocument, putDocument, subscribeDocument, subscribeDocumentWithRetry, type Validator } from './document';
import { authorNode, ensureGunUserAuth, getGun, ownNode } from './client';
import { addToTagIndex, NETWORK_INDEX_TAG } from './tags';
import { addToNameIndex } from './names';
import { makeCharacterId, parseCharacterId } from './characterId';

const isCharacter: Validator<Character> = (data): data is Character => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.id === 'string' &&
		typeof d.version === 'number' &&
		typeof d.name === 'string' &&
		Array.isArray(d.image_urls) &&
		d.image_urls.every((u) => typeof u === 'string') &&
		typeof d.description === 'string' &&
		typeof d.personality === 'string' &&
		typeof d.scenario === 'string' &&
		Array.isArray(d.tags) &&
		d.tags.every((t) => typeof t === 'string') &&
		typeof d.nsfw === 'boolean' &&
		typeof d.language === 'string' &&
		typeof d.system_prompt === 'string' &&
		typeof d.first_message === 'string' &&
		Array.isArray(d.alternate_greetings) &&
		d.alternate_greetings.every((g) => typeof g === 'string') &&
		Array.isArray(d.example_dialogues) &&
		d.example_dialogues.every((g) => typeof g === 'string') &&
		typeof d.comments_enabled === 'boolean' &&
		(d.forked_from === null || typeof d.forked_from === 'string') &&
		typeof d.author === 'string' &&
		typeof d.signature === 'string' &&
		typeof d.created_at === 'number' &&
		typeof d.updated_at === 'number' &&
		typeof d.deleted === 'boolean' &&
		(d.deleted_at === null || typeof d.deleted_at === 'number')
	);
};

const pubkeyOf = (doc: Character): PubKey => doc.author;

async function sign(draft: Omit<Character, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Character> {
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	return { ...withTimestamp, signature };
}

/** Writes an already-signed character into its author's protected GUN
 *  user-space and indexes its tags. Only the author's own session can write
 *  here (see client.ts:ownNode) — used both for normal publish/edit flows
 *  and for promoting a local-only character (see publishLocalCharacter). */
async function writeToGun(doc: Character, keyring: Keyring): Promise<Character> {
	const { uuid } = parseCharacterId(doc.id);
	await ensureGunUserAuth(keyring.pair);
	await putDocument(ownNode(getGun(), ['characters', uuid]), doc);
	await Promise.all([
		...doc.tags.map((tag) => addToTagIndex(tag, doc.id, keyring)),
		addToTagIndex(NETWORK_INDEX_TAG, doc.id, keyring),
		addToNameIndex(doc.name, doc.id, keyring)
	]);
	return doc;
}

async function signAndPublish(draft: Omit<Character, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Character> {
	const doc = await sign(draft, keyring);
	return writeToGun(doc, keyring);
}

export function getCharacter(id: CharacterId): Promise<Verified<Character>> {
	const { author, uuid } = parseCharacterId(id);
	return getDocument(authorNode(getGun(), author, ['characters', uuid]), isCharacter, pubkeyOf);
}

export function subscribeCharacter(id: CharacterId, onUpdate: (result: Verified<Character>) => void): () => void {
	const { author, uuid } = parseCharacterId(id);
	return subscribeDocument(authorNode(getGun(), author, ['characters', uuid]), isCharacter, pubkeyOf, onUpdate);
}

/** Same as subscribeCharacter, but also re-polls with a one-shot getCharacter
 *  every couple seconds until `isResolved()` — see
 *  document.ts:subscribeDocumentWithRetry for why a bare subscription isn't
 *  enough on this app's public relays. */
export function subscribeCharacterWithRetry(
	id: CharacterId,
	onUpdate: (result: Verified<Character>) => void,
	isResolved: () => boolean
): () => void {
	const { author, uuid } = parseCharacterId(id);
	return subscribeDocumentWithRetry(authorNode(getGun(), author, ['characters', uuid]), isCharacter, pubkeyOf, onUpdate, isResolved);
}

/** Creates (no `draft.id`) or edits (with `draft.id`) a character. Editing is
 *  publishing a new signed snapshot under the same id with an incremented
 *  `version` (see spec: Character Management). Only the author may edit. */
export async function publishCharacter(draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	if (!draft.id) {
		return signAndPublish(
			{
				...draft,
				id: makeCharacterId(keyring.publicKey),
				version: 1,
				forked_from: null,
				author: keyring.publicKey,
				deleted: false,
				deleted_at: null,
				created_at: Date.now()
			},
			keyring
		);
	}

	const existing = await getCharacter(draft.id);
	if (!existing.ok) throw new Error('Character not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can edit this character.');

	return signAndPublish(
		{
			...draft,
			id: existing.doc.id,
			version: existing.doc.version + 1,
			forked_from: existing.doc.forked_from,
			author: existing.doc.author,
			deleted: false,
			deleted_at: null,
			created_at: existing.doc.created_at
		},
		keyring
	);
}

/** Tombstones a character the current user authored — a new signed snapshot
 *  with `deleted: true`, not a graph removal (see spec: peers who already
 *  synced can't be forced to erase it). */
export async function deleteCharacter(id: CharacterId): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this character.');

	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing.doc;
	return signAndPublish(
		{ ...rest, version: rest.version + 1, deleted: true, deleted_at: Date.now() },
		keyring
	);
}

/** Reverses a "delete remote only" (see deleteCharacter) — a new signed
 *  snapshot with `deleted: false` under the same id/version chain, so the
 *  character's id and every comment already posted on it (keyed by that same
 *  id, see gun/comments.ts) come back untouched. Takes the caller's own
 *  cached copy directly rather than re-fetching, since a locally-tracked
 *  deleted character is exactly what's being restored from. */
export async function undeleteCharacter(existing: Character): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (existing.author !== keyring.publicKey) throw new Error('Only the author can restore this character.');

	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing;
	return signAndPublish(
		{ ...rest, version: rest.version + 1, deleted: false, deleted_at: null },
		keyring
	);
}

/** Copies `id`'s fields into a new document under a new id, authored and
 *  signed by the current user, with `forked_from` set for provenance (see
 *  spec: Fork). Non-authors get this instead of edit/delete. Kept local-only
 *  until the user explicitly publishes it — forking shouldn't broadcast a
 *  copy to the network before the forker has had a chance to edit it. */
export async function forkCharacter(id: CharacterId): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');

	const { id: _id, version: _version, author: _author, forked_from: _forkedFrom, signature: _signature, created_at: _createdAt, updated_at: _updatedAt, deleted: _deleted, deleted_at: _deletedAt, ...fields } = existing.doc;

	return sign(
		{
			...fields,
			id: makeCharacterId(keyring.publicKey),
			version: 1,
			forked_from: existing.doc.id,
			author: keyring.publicKey,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
}

/** Builds a signed character document without writing it to GUN — used for
 *  local-only creates/edits/forks, which live entirely in this browser's
 *  IndexedDB (see db/characters.ts) until explicitly published. */
export async function createLocalCharacter(draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	if (draft.id) throw new Error('createLocalCharacter is only for brand-new characters.');

	return sign(
		{
			...draft,
			id: makeCharacterId(keyring.publicKey),
			version: 1,
			forked_from: null,
			author: keyring.publicKey,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
}

/** Re-signs a new version of a local-only character — no GUN interaction,
 *  since the previous version was never published either. */
export async function editLocalCharacter(existing: Character, draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	return sign(
		{
			...draft,
			id: existing.id,
			version: existing.version + 1,
			forked_from: existing.forked_from,
			author: existing.author,
			deleted: false,
			deleted_at: null,
			created_at: existing.created_at
		},
		keyring
	);
}

/** Promotes an already-signed local-only character to the network as-is. */
export function publishLocalCharacter(character: Character): Promise<Character> {
	requireAccount();
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	return writeToGun(character, keyring);
}
