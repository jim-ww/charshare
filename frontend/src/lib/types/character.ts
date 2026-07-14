import type { Signed, Tombstonable } from "./signed";
import type { MediaItem } from "./media";

/** `"{authorPubkey}:{uuid}"` — encodes the author so any holder of an id can
 *  locate the character via a relay-native authors+d-tag filter (see
 *  nostr/characters.ts) without a separate global lookup index. Opaque to
 *  everything outside nostr/characters.ts — routes, comments, chat state, etc.
 *  just pass this string around. */
export type CharacterId = string;

export interface CharacterFields {
	id: CharacterId;
	version: number; // increments on every edit snapshot
	name: string;
	media: MediaItem[]; // [] if none; first is shown by default; ordered images/videos, author-controlled
	description: string;
	personality: string;
	scenario: string;
	tags: string[];
	nsfw: boolean;
	language: string; // ISO 639-1 code, e.g. "en"
	system_prompt: string;
	first_message: string;
	alternate_greetings: string[];
	example_dialogues: string[];
	comments_enabled: boolean;
	slideshow_enabled: boolean; // owner opt-in — cycle through media on hover, see CharacterCard.svelte
	forked_from: CharacterId | null;
}

/** The full document as it's signed, published, and validated. */
export type Character = CharacterFields & Signed & Tombstonable;

/** Input shape for the create/edit form — no id/version/signature/timestamps yet,
 *  those get filled in by lib/nostr/characters.ts on publish. */
export type CharacterDraft = Omit<
	CharacterFields,
	"id" | "version" | "forked_from"
> & {
	id?: CharacterId; // absent = creating new
};
