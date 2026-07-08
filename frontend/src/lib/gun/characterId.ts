import type { CharacterId, PubKey } from '$lib/types';

/** Mints a fresh id for a character authored by `author`, encoding the author
 *  pubkey into the id itself (see types/character.ts: CharacterId) so any
 *  holder of the id can resolve its storage location (authorNode) without a
 *  separate global lookup index. Shared by characters.ts (mint/resolve) and
 *  tags.ts (verifying a tag pointer's claimed author against its charId). */
export function makeCharacterId(author: PubKey): CharacterId {
	return `${author}:${crypto.randomUUID()}`;
}

export function parseCharacterId(id: CharacterId): { author: PubKey; uuid: string } {
	const separator = id.indexOf(':');
	if (separator < 0) throw new Error(`Malformed character id: ${id}`);
	return { author: id.slice(0, separator), uuid: id.slice(separator + 1) };
}
