import { describe, expect, it } from 'vitest';
import { stripThinking } from './strip-thinking';

describe('stripThinking', () => {
	it('removes a plain <think> block', () => {
		expect(stripThinking('<think>reasoning here</think>Hello there')).toBe('Hello there');
	});

	it('removes <think:id> blocks with matching close tag', () => {
		expect(
			stripThinking('<think:6124c78e></think:6124c78e>Ayane, what are you looking at?')
		).toBe('Ayane, what are you looking at?');
	});

	it('removes multiple think blocks', () => {
		expect(stripThinking('<think>a</think>Hi<think>b</think> there')).toBe('Hi there');
	});

	it('strips a trailing unclosed think tag (stream cut off mid-thought)', () => {
		expect(stripThinking('Some reply <think>still reasoning...')).toBe('Some reply ');
	});

	it('leaves plain text untouched', () => {
		expect(stripThinking('no thinking tags here')).toBe('no thinking tags here');
	});
});
