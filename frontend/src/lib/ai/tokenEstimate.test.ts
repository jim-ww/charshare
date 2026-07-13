import { describe, it, expect } from 'vitest';
import { encode } from 'gpt-tokenizer';
import { estimateTokens, trimLeadingTokens } from './tokenEstimate';

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
