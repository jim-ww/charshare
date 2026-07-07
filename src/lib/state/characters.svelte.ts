import { browser } from '$app/environment';
import type { Character, CharacterId } from '$lib/types';
import {
	addPublishedCharacterId,
	loadMyCharacterEntries,
	removeMyCharacterEntry,
	saveLocalOnlyCharacter
} from '$lib/db/characters';
import {
	createLocalCharacter as gunCreateLocalCharacter,
	deleteCharacter as gunDeleteCharacter,
	editLocalCharacter as gunEditLocalCharacter,
	forkCharacter as gunForkCharacter,
	getCharacter,
	publishCharacter as gunPublishCharacter,
	publishLocalCharacter as gunPublishLocalCharacter
} from '$lib/gun/characters';

type CharacterFormFields = Parameters<typeof gunPublishCharacter>[0];

let myCharacters = $state<Character[]>([]);
let publishedMap = $state<Record<CharacterId, boolean>>({});
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getMyCharacters(): Character[] {
	return myCharacters;
}

/** Whether `id` is a local-only (unpublished) character owned by this
 *  browser. Characters not in the local index at all (someone else's,
 *  found via browse/fork) are treated as published — they only exist
 *  because they were read from GUN. */
export function isCharacterLocalOnly(id: CharacterId): boolean {
	return publishedMap[id] === false;
}

export function isCharactersReady(): boolean {
	return ready;
}

async function refresh(): Promise<void> {
	const entries = await loadMyCharacterEntries();
	const resolved = await Promise.all(
		entries.map(async (entry) => {
			if (!entry.published) {
				return entry.character ? { character: entry.character, published: false } : null;
			}
			const result = await getCharacter(entry.id);
			return result.ok ? { character: result.doc, published: true } : null;
		})
	);
	const valid = resolved.filter((r): r is { character: Character; published: boolean } => r !== null);
	myCharacters = valid.map((r) => r.character);
	publishedMap = Object.fromEntries(valid.map((r) => [r.character.id, r.published]));
}

export function initCharacters(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await refresh();
			ready = true;
		})();
	}
	return initPromise;
}

/** Creates or edits a character. `localOnly` controls whether a *new*
 *  character (or a still-unpublished one) is published to GUN or kept
 *  purely in this browser's local storage. Editing a character that's
 *  already published always stays published — publish is one-way except
 *  via the explicit "keep local" choice at creation time. */
export async function createOrEditCharacter(
	fields: CharacterFormFields,
	options?: { localOnly?: boolean }
): Promise<Character> {
	const localOnly = options?.localOnly ?? false;

	if (!fields.id) {
		if (localOnly) {
			const doc = await gunCreateLocalCharacter(fields);
			await saveLocalOnlyCharacter(doc);
			await refresh();
			return doc;
		}
		const doc = await gunPublishCharacter(fields);
		await addPublishedCharacterId(doc.id);
		await refresh();
		return doc;
	}

	if (isCharacterLocalOnly(fields.id)) {
		const existing = myCharacters.find((c) => c.id === fields.id);
		if (!existing) throw new Error('Character not found.');
		const edited = await gunEditLocalCharacter(existing, fields);
		if (localOnly) {
			await saveLocalOnlyCharacter(edited);
			await refresh();
			return edited;
		}
		const published = await gunPublishLocalCharacter(edited);
		await addPublishedCharacterId(published.id);
		await refresh();
		return published;
	}

	const doc = await gunPublishCharacter(fields);
	await addPublishedCharacterId(doc.id);
	await refresh();
	return doc;
}

export async function publishMyCharacter(id: CharacterId): Promise<Character> {
	const existing = myCharacters.find((c) => c.id === id);
	if (!existing) throw new Error('Character not found.');
	const doc = await gunPublishLocalCharacter(existing);
	await addPublishedCharacterId(doc.id);
	await refresh();
	return doc;
}

export async function deleteMyCharacter(id: CharacterId): Promise<void> {
	if (isCharacterLocalOnly(id)) {
		await removeMyCharacterEntry(id);
	} else {
		await gunDeleteCharacter(id);
	}
	await refresh();
}

/** Forks `id` into a new local-only character owned by the current user
 *  (see gun/characters.ts forkCharacter) — kept unpublished until the user
 *  edits and explicitly publishes it. */
export async function forkCharacter(id: CharacterId): Promise<Character> {
	const doc = await gunForkCharacter(id);
	await saveLocalOnlyCharacter(doc);
	await refresh();
	return doc;
}

/** Serializes a character for the "Export" action — plain JSON so it round-trips
 *  through importCharacterDraft (see below). */
export function exportCharacter(character: Character): string {
	return JSON.stringify(character, null, 2);
}

/** Parses a previously-exported character JSON into a fresh draft — strips
 *  id/version/signature/timestamps/forked_from so importing always creates a
 *  brand new character rather than colliding with the source. */
export function importCharacterDraft(json: string): CharacterFormFields {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not valid JSON.');
	}
	if (typeof parsed !== 'object' || parsed === null || typeof (parsed as Character).name !== 'string') {
		throw new Error('Not a valid character export.');
	}
	const source = parsed as Character;
	return {
		name: source.name,
		image_url: source.image_url ?? '',
		description: source.description ?? '',
		personality: source.personality ?? '',
		scenario: source.scenario ?? '',
		tags: source.tags ?? [],
		nsfw: source.nsfw ?? false,
		language: source.language ?? '',
		system_prompt: source.system_prompt ?? '',
		first_message: source.first_message ?? '',
		alternate_greetings: source.alternate_greetings ?? [],
		comments_enabled: source.comments_enabled ?? true
	};
}
