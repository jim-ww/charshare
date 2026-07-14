// cl100k_base (GPT-3.5/GPT-4's encoding) rather than the package default
// (o200k_base, GPT-4o's) — about half the bundled vocabulary data for a
// cross-provider estimate that's an approximation either way (see below).
import { encode, decode, countTokens } from 'gpt-tokenizer/encoding/cl100k_base';
import type { CharacterFields } from '$lib/types/character';

/** Special-token-like substrings (e.g. `<|endoftext|>`) are disallowed by
 *  default and throw — arbitrary chat/character content isn't trusted not to
 *  contain one, so treat everything as plain text instead of erroring on it. */
const TOKENIZE_OPTIONS = { allowedSpecial: 'all' as const };

/** Token estimate for `text`, using gpt-tokenizer's cl100k_base (GPT-3.5/
 *  GPT-4) encoding. This app talks to an arbitrary model per provider (OpenRouter/
 *  Ollama/HuggingFace/any OpenAI-compatible endpoint), each with its own real
 *  tokenizer, so this is necessarily an approximation for anything that isn't
 *  actually an OpenAI model — but a real BPE tokenizer gets CJK/Cyrillic text
 *  right (unlike a flat "characters ÷ 4" heuristic, which badly
 *  underestimates non-Latin scripts), and is close enough across most modern
 *  BPE-based tokenizers to be a meaningfully better cross-provider estimate. */
export function estimateTokens(text: string): number {
	return countTokens(text, TOKENIZE_OPTIONS);
}

/** Drops the first `tokensToRemove` tokens from `text` — used to trim just
 *  enough off the oldest message's content to close a context-budget gap. */
export function trimLeadingTokens(text: string, tokensToRemove: number): string {
	if (tokensToRemove <= 0) return text;
	const tokens = encode(text, TOKENIZE_OPTIONS);
	return decode(tokens.slice(tokensToRemove));
}

/** Compact display form for a token count, e.g. `1.2k` for 1234. */
export function formatTokenCount(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/** Per-field token estimate for a character (or in-progress draft), plus the
 *  sum across all of them — shown per-field in the create/edit form and
 *  detail view, and as a single total on character cards. Array fields
 *  (alternate_greetings/example_dialogues) count every entry, since all of
 *  them are potentially sent to the model (a greeting is picked at random,
 *  dialogues are all included as examples). */
export interface CharacterTokenBreakdown {
	description: number;
	personality: number;
	scenario: number;
	system_prompt: number;
	first_message: number;
	alternate_greetings: number;
	example_dialogues: number;
	total: number;
}

export function estimateCharacterTokens(
	character: Pick<
		CharacterFields,
		| 'description'
		| 'personality'
		| 'scenario'
		| 'system_prompt'
		| 'first_message'
		| 'alternate_greetings'
		| 'example_dialogues'
	>
): CharacterTokenBreakdown {
	const description = estimateTokens(character.description);
	const personality = estimateTokens(character.personality);
	const scenario = estimateTokens(character.scenario);
	const system_prompt = estimateTokens(character.system_prompt);
	const first_message = estimateTokens(character.first_message);
	const alternate_greetings = character.alternate_greetings.reduce((sum, g) => sum + estimateTokens(g), 0);
	const example_dialogues = character.example_dialogues.reduce((sum, d) => sum + estimateTokens(d), 0);
	return {
		description,
		personality,
		scenario,
		system_prompt,
		first_message,
		alternate_greetings,
		example_dialogues,
		total:
			description +
			personality +
			scenario +
			system_prompt +
			first_message +
			alternate_greetings +
			example_dialogues
	};
}
