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

/** Backfills fields added after some local-only characters were already
 *  saved to IndexedDB, so old entries don't crash on the newer field being
 *  undefined. */
function normalizeLocalCharacter(character: Character): Character {
	return {
		...character,
		example_dialogues: character.example_dialogues ?? []
	};
}

async function refresh(): Promise<void> {
	const entries = await loadMyCharacterEntries();
	const resolved = await Promise.all(
		entries.map(async (entry) => {
			if (!entry.published) {
				return entry.character
					? { character: normalizeLocalCharacter(entry.character), published: false }
					: null;
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

/** Restores a character from a full data backup, preserving its original id
 *  (unlike importCharacterDraft, which is for importing someone else's shared
 *  character and deliberately mints a new id). Used by dataExport.ts's bulk
 *  "characters" category import, so re-restoring the same backup merges
 *  instead of piling up duplicate copies every time.
 *
 *  - Already published under this id → GUN is authoritative, skipped.
 *  - Not tracked locally, but published on the network → just linked into the
 *    local index, network content wins.
 *  - Not tracked locally at all → added as a new local-only character.
 *  - Tracked locally as a local-only draft → the higher `version` wins; on a
 *    tie with differing content, the user is asked which to keep. */
export async function restoreCharacter(character: Character): Promise<'added' | 'updated' | 'skipped'> {
	const entries = await loadMyCharacterEntries();
	const existingEntry = entries.find((e) => e.id === character.id);

	if (existingEntry?.published) return 'skipped';

	const existing = existingEntry?.character;
	if (!existing) {
		const onNetwork = await getCharacter(character.id);
		if (onNetwork.ok) {
			await addPublishedCharacterId(character.id);
			await refresh();
			return 'added';
		}
		await saveLocalOnlyCharacter(character);
		await refresh();
		return 'added';
	}

	if (character.version < existing.version) return 'skipped';
	if (character.version === existing.version && JSON.stringify(character) === JSON.stringify(existing)) {
		return 'skipped';
	}
	if (character.version === existing.version) {
		const preferImported = confirm(
			`"${existing.name}" already exists locally at the same version with different content. Replace it with the imported version?`
		);
		if (!preferImported) return 'skipped';
	}

	await saveLocalOnlyCharacter(character);
	await refresh();
	return 'updated';
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
		image_urls: Array.isArray(source.image_urls) ? source.image_urls : [],
		description: source.description ?? '',
		personality: source.personality ?? '',
		scenario: source.scenario ?? '',
		tags: source.tags ?? [],
		nsfw: source.nsfw ?? false,
		language: source.language ?? '',
		system_prompt: source.system_prompt ?? '',
		first_message: source.first_message ?? '',
		alternate_greetings: source.alternate_greetings ?? [],
		example_dialogues: source.example_dialogues ?? [],
		comments_enabled: source.comments_enabled ?? true
	};
}
