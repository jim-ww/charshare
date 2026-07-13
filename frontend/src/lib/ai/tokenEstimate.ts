// cl100k_base (GPT-3.5/GPT-4's encoding) rather than the package default
// (o200k_base, GPT-4o's) — about half the bundled vocabulary data for a
// cross-provider estimate that's an approximation either way (see below).
import { encode, decode, countTokens } from 'gpt-tokenizer/encoding/cl100k_base';

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
