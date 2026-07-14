import { describe, it, expect } from 'vitest';
import { encode } from 'gpt-tokenizer';
import { estimateTokens, trimLeadingTokens, estimateCharacterTokens, formatTokenCount } from './tokenEstimate';

describe('estimateTokens', () => {
	it('returns 0 for empty text', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('matches the real tokenizer\'s own token count', () => {
		const text = 'The quick brown fox jumps over the lazy dog.';
		expect(estimateTokens(text)).toBe(encode(text).length);
	});

	it('counts Japanese and Cyrillic text without throwing, and scales with length', () => {
		const short = 'こんにちは';
		const long = short.repeat(20);
		expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));

		const cyrillic = 'Привет, как у тебя дела сегодня?';
		expect(estimateTokens(cyrillic)).toBeGreaterThan(0);
	});

	it("doesn't throw on text containing special-token-like substrings", () => {
		expect(() => estimateTokens('some text <|endoftext|> more text')).not.toThrow();
	});
});

describe('trimLeadingTokens', () => {
	it('is a no-op for zero or negative token counts', () => {
		expect(trimLeadingTokens('hello there', 0)).toBe('hello there');
		expect(trimLeadingTokens('hello there', -5)).toBe('hello there');
	});

	it('drains to empty when asked to remove more tokens than the text has', () => {
		expect(trimLeadingTokens('hi', 1000)).toBe('');
	});

	it('reduces the token count by exactly the number of tokens requested', () => {
		const text = 'The quick brown fox jumps over the lazy dog and then keeps running.';
		const total = estimateTokens(text);
		const trimmed = trimLeadingTokens(text, 4);
		expect(estimateTokens(trimmed)).toBe(total - 4);
	});

	it("doesn't throw on non-Latin text", () => {
		const text = 'こんにちは世界、今日はいい天気ですね'.repeat(3);
		expect(() => trimLeadingTokens(text, 5)).not.toThrow();
		expect(estimateTokens(trimLeadingTokens(text, 5))).toBeLessThan(estimateTokens(text));
	});
});

describe('estimateCharacterTokens', () => {
	const blank = {
		description: '',
		personality: '',
		scenario: '',
		system_prompt: '',
		first_message: '',
		alternate_greetings: [],
		example_dialogues: []
	};

	it('returns all zeros for a completely blank character', () => {
		const result = estimateCharacterTokens(blank);
		expect(result).toEqual({
			description: 0,
			personality: 0,
			scenario: 0,
			system_prompt: 0,
			first_message: 0,
			alternate_greetings: 0,
			example_dialogues: 0,
			total: 0
		});
	});

	it('sums every array entry, not just the first', () => {
		const result = estimateCharacterTokens({
			...blank,
			alternate_greetings: ['hello there', 'good day to you'],
			example_dialogues: ['{{user}}: hi\n{{char}}: hey!']
		});
		expect(result.alternate_greetings).toBe(
			estimateTokens('hello there') + estimateTokens('good day to you')
		);
		expect(result.example_dialogues).toBe(estimateTokens('{{user}}: hi\n{{char}}: hey!'));
	});

	it('total is the sum of every field', () => {
		const result = estimateCharacterTokens({
			description: 'A mysterious traveler.',
			personality: 'Calm, curious, a little sarcastic.',
			scenario: 'Meeting at a crossroads at dusk.',
			system_prompt: 'Stay in character at all times.',
			first_message: 'Well, look what the wind blew in.',
			alternate_greetings: ['Oh, hello there.'],
			example_dialogues: ['{{user}}: Who are you?\n{{char}}: Wouldn\'t you like to know.']
		});
		const sum =
			result.description +
			result.personality +
			result.scenario +
			result.system_prompt +
			result.first_message +
			result.alternate_greetings +
			result.example_dialogues;
		expect(result.total).toBe(sum);
		expect(result.total).toBeGreaterThan(0);
	});
});

describe('formatTokenCount', () => {
	it('shows small counts verbatim', () => {
		expect(formatTokenCount(0)).toBe('0');
		expect(formatTokenCount(999)).toBe('999');
	});

	it('abbreviates counts of 1000 or more as "Nk", dropping a trailing .0', () => {
		expect(formatTokenCount(1000)).toBe('1k');
		expect(formatTokenCount(1234)).toBe('1.2k');
		expect(formatTokenCount(12500)).toBe('12.5k');
	});
});
