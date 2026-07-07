import { browser } from '$app/environment';
import type { Character, CharacterId } from '$lib/types';
import { addMyCharacterId, loadMyCharacterIds } from '$lib/db/characters';
import {
	deleteCharacter as gunDeleteCharacter,
	forkCharacter as gunForkCharacter,
	getCharacter,
	publishCharacter as gunPublishCharacter
} from '$lib/gun/characters';

type CharacterFormFields = Parameters<typeof gunPublishCharacter>[0];

let myCharacters = $state<Character[]>([]);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getMyCharacters(): Character[] {
	return myCharacters;
}

export function isCharactersReady(): boolean {
	return ready;
}

async function refresh(): Promise<void> {
	const ids = await loadMyCharacterIds();
	const results = await Promise.all(ids.map((id) => getCharacter(id)));
	myCharacters = results.filter((r) => r.ok).map((r) => r.doc);
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

export async function createOrEditCharacter(fields: CharacterFormFields): Promise<Character> {
	const doc = await gunPublishCharacter(fields);
	await addMyCharacterId(doc.id);
	await refresh();
	return doc;
}

export async function deleteMyCharacter(id: CharacterId): Promise<void> {
	await gunDeleteCharacter(id);
	await refresh();
}

export async function forkCharacter(id: CharacterId): Promise<Character> {
	const doc = await gunForkCharacter(id);
	await addMyCharacterId(doc.id);
	await refresh();
	return doc;
}
