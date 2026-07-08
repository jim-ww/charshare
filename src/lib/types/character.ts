import type { PubKey } from "./user";
import type { Signed, Tombstonable } from "./signed";

/** `"{authorPubkey}:{uuid}"` — encodes the author so any holder of an id can
 *  locate the character under that author's protected GUN user-space (see
 *  gun/characters.ts) without a separate global lookup index. Opaque to
 *  everything outside gun/characters.ts — routes, comments, chat state, etc.
 *  just pass this string around. */
export type CharacterId = string;

export interface CharacterFields {
	id: CharacterId;
	version: number; // increments on every edit snapshot
	name: string;
	image_urls: string[]; // [] if none; first is shown by default
	description: string;
	personality: string;
	scenario: string;
	tags: string[];
	nsfw: boolean;
	language: string; // '' if unspecified
	system_prompt: string;
	first_message: string;
	alternate_greetings: string[];
	comments_enabled: boolean;
	forked_from: CharacterId | null;
}

/** The full document as it's signed, published, and validated. */
export type Character = CharacterFields & Signed & Tombstonable;

/** Local-only wrapper: same fields, plus whether it's been published,
 *  and whether the user pinned a deleted-upstream copy to keep locally. */
export interface LocalCharacterState {
	character: Character;
	published: boolean;
	savedLocally: boolean; // keeps a tombstoned character usable/visible for this user only
}

/** Input shape for the create/edit form — no id/version/signature/timestamps yet,
 *  those get filled in by lib/gun/characters.ts on publish. */
export type CharacterDraft = Omit<
	CharacterFields,
	"id" | "version" | "forked_from"
> & {
	id?: CharacterId; // absent = creating new
};
