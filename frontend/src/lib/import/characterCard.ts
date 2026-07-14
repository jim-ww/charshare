/** TavernAI/SillyTavern "character card" interop — the de facto third-party
 *  format for AI character definitions, distributed either as a raw JSON
 *  blob or embedded in a PNG's `tEXt` chunk (keyword `chara`, base64-encoded
 *  JSON — see png.ts). Supports both the flat "V1" shape and the wrapped
 *  "V2" spec (`chara_card_v2`); only ever writes V2 on export, since V1 has
 *  no room for tags/system_prompt/alternate_greetings. */
import type { Character, CharacterFields } from '$lib/types';
import { readTextChunk, writeTextChunk } from './png';

const CARD_PNG_KEYWORD = 'chara';

type CharacterCardDraft = Omit<CharacterFields, 'id' | 'version' | 'forked_from' | 'media'>;

interface TavernCardV1 {
	name?: string;
	description?: string;
	personality?: string;
	scenario?: string;
	first_mes?: string;
	mes_example?: string;
}

interface TavernCardV2 {
	spec?: string;
	spec_version?: string;
	data?: {
		name?: string;
		description?: string;
		personality?: string;
		scenario?: string;
		first_mes?: string;
		mes_example?: string;
		system_prompt?: string;
		alternate_greetings?: string[];
		tags?: string[];
		creator_notes?: string;
	};
}

/** `mes_example`/`mes_examples` packs every example exchange into one string
 *  separated by `<START>` markers (TavernAI's convention) — split back into
 *  our `alternate_dialogues`-style list, dropping empty leading/trailing
 *  entries a leading `<START>` otherwise produces. */
function splitExampleDialogues(mesExample: string | undefined): string[] {
	if (!mesExample) return [];
	return mesExample
		.split(/<START>/gi)
		.map((s) => s.trim())
		.filter(Boolean);
}

function joinExampleDialogues(dialogues: string[]): string {
	return dialogues.map((d) => `<START>\n${d}`).join('\n');
}

function isV2(parsed: unknown): parsed is TavernCardV2 {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		'spec' in parsed &&
		(parsed as { spec: unknown }).spec === 'chara_card_v2'
	);
}

/** Parses a card's raw JSON text (V1 or V2 shape) into our draft field set.
 *  Throws if `json` isn't valid JSON or has no usable `name`. */
export function parseTavernCardJson(json: string): CharacterCardDraft {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not valid JSON.');
	}

	const fields = isV2(parsed) ? (parsed.data ?? {}) : (parsed as TavernCardV1);
	if (typeof fields.name !== 'string' || !fields.name) {
		throw new Error('Not a valid character card — missing a name.');
	}

	return {
		name: fields.name,
		description: fields.description ?? '',
		personality: fields.personality ?? '',
		scenario: fields.scenario ?? '',
		tags: isV2(parsed) ? (parsed.data?.tags ?? []) : [],
		nsfw: false,
		language: '',
		system_prompt: isV2(parsed) ? (parsed.data?.system_prompt ?? '') : '',
		first_message: fields.first_mes ?? '',
		alternate_greetings: isV2(parsed) ? (parsed.data?.alternate_greetings ?? []) : [],
		example_dialogues: splitExampleDialogues(fields.mes_example),
		comments_enabled: true,
		slideshow_enabled: false
	};
}

/** Extracts and parses an embedded card from a PNG character-card image
 *  (`bytes`) — throws if `bytes` isn't a PNG, has no embedded card, or the
 *  embedded card doesn't parse (see parseTavernCardJson). */
export function parseTavernCardPng(bytes: Uint8Array): CharacterCardDraft {
	const base64 = readTextChunk(bytes, CARD_PNG_KEYWORD);
	if (!base64) throw new Error('No embedded character card found in this PNG.');
	let json: string;
	try {
		json = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
	} catch {
		throw new Error('Embedded character card is not valid base64.');
	}
	return parseTavernCardJson(json);
}

/** Builds a V2-spec card JSON string for `character` — the shape written
 *  into an exported PNG's `chara` tEXt chunk (see embedTavernCardInPng). */
export function characterToTavernCardV2Json(character: Character): string {
	const card: Required<TavernCardV2> = {
		spec: 'chara_card_v2',
		spec_version: '2.0',
		data: {
			name: character.name,
			description: character.description,
			personality: character.personality,
			scenario: character.scenario,
			first_mes: character.first_message,
			mes_example: joinExampleDialogues(character.example_dialogues),
			system_prompt: character.system_prompt,
			alternate_greetings: character.alternate_greetings,
			tags: character.tags,
			creator_notes: ''
		}
	};
	return JSON.stringify(card, null, 2);
}

/** Embeds `character` as a V2 card into `pngBytes` (its avatar image,
 *  already-fetched/converted to real PNG bytes by the caller — see
 *  state/characters.svelte.ts:exportCharacterAsPng), replacing any card
 *  already embedded there. */
export function embedTavernCardInPng(pngBytes: Uint8Array, character: Character): Uint8Array {
	const json = characterToTavernCardV2Json(character);
	const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
	return writeTextChunk(pngBytes, CARD_PNG_KEYWORD, base64);
}
