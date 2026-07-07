import type { Character, CharacterDraft, CharacterId, Keyring, PubKey, Verified } from '$lib/types';
import { signDocument } from '$lib/crypto/sign';
import { getKeyring } from '$lib/state/auth.svelte';
import { getDocument, putDocument, subscribeDocument, type Validator } from './document';
import { addToTagIndex } from './tags';

function characterPath(id: CharacterId): string {
	return `characters/${id}`;
}

const isCharacter: Validator<Character> = (data): data is Character => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.id === 'string' &&
		typeof d.version === 'number' &&
		typeof d.name === 'string' &&
		typeof d.image_url === 'string' &&
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

async function signAndPublish(draft: Omit<Character, 'signature' | 'updated_at'>, keyring: Keyring): Promise<Character> {
	const withTimestamp = { ...draft, updated_at: Date.now(), signature: '' };
	const signature = await signDocument(withTimestamp, keyring);
	const doc: Character = { ...withTimestamp, signature };
	await putDocument(characterPath(doc.id), doc);
	await Promise.all(doc.tags.map((tag) => addToTagIndex(tag, doc.id)));
	return doc;
}

export function getCharacter(id: CharacterId): Promise<Verified<Character>> {
	return getDocument(characterPath(id), isCharacter, pubkeyOf);
}

export function subscribeCharacter(id: CharacterId, onUpdate: (result: Verified<Character>) => void): () => void {
	return subscribeDocument(characterPath(id), isCharacter, pubkeyOf, onUpdate);
}

/** Creates (no `draft.id`) or edits (with `draft.id`) a character. Editing is
 *  publishing a new signed snapshot under the same id with an incremented
 *  `version` (see spec: Character Management). Only the author may edit. */
export async function publishCharacter(draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	if (!draft.id) {
		return signAndPublish(
			{
				...draft,
				id: crypto.randomUUID(),
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

	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this character.');

	const { signature: _signature, updated_at: _updatedAt, ...rest } = existing.doc;
	return signAndPublish(
		{ ...rest, version: rest.version + 1, deleted: true, deleted_at: Date.now() },
		keyring
	);
}

/** Copies `id`'s fields into a new document under a new id, authored and
 *  signed by the current user, with `forked_from` set for provenance (see
 *  spec: Fork). Non-authors get this instead of edit/delete. */
export async function forkCharacter(id: CharacterId): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');

	const { id: _id, version: _version, author: _author, forked_from: _forkedFrom, signature: _signature, created_at: _createdAt, updated_at: _updatedAt, deleted: _deleted, deleted_at: _deletedAt, ...fields } = existing.doc;

	return signAndPublish(
		{
			...fields,
			id: crypto.randomUUID(),
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
