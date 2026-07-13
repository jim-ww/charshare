import type { CharacterId, PubKey } from '$lib/types';
import { CHARACTER_KIND } from './kinds';

/** Mints a fresh id for a character authored by `author`, as an opaque
 *  `"{author}:{uuid}"` string — the `uuid` half becomes this character's
 *  stable NIP-33 `d` tag (its identity, which must never change even if the
 *  character is renamed), while `author` is a hex Nostr pubkey. */
export function makeCharacterId(author: PubKey): CharacterId {
	return `${author}:${crypto.randomUUID()}`;
}

export function parseCharacterId(id: CharacterId): { author: PubKey; uuid: string } {
	const separator = id.indexOf(':');
	if (separator < 0) throw new Error(`Malformed character id: ${id}`);
	return { author: id.slice(0, separator), uuid: id.slice(separator + 1) };
}

/** The NIP-33 addressable-event coordinate (`kind:pubkey:d`) for `id` — used
 *  wherever another event needs to reference this character (fork
 *  provenance, comments, reactions). */
export function characterCoordinate(id: CharacterId): string {
	const { author, uuid } = parseCharacterId(id);
	return `${CHARACTER_KIND}:${author}:${uuid}`;
}

/** Inverse of characterCoordinate — recovers the app-facing CharacterId from
 *  a `kind:pubkey:d` coordinate string (e.g. from an `a` tag). */
export function parseCharacterCoordinate(coordinate: string): CharacterId {
	const [, author, uuid] = coordinate.split(':');
	return `${author}:${uuid}`;
}
