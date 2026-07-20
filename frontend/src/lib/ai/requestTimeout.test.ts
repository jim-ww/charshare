import { describe, it, expect } from 'vitest';
import { withRequestTimeout } from './requestTimeout';

describe('withRequestTimeout', () => {
	it('returns the original signal unchanged when timeout is 0', () => {
		const controller = new AbortController();
		expect(withRequestTimeout(controller.signal, 0)).toBe(controller.signal);
	});

	it('returns the original signal unchanged when timeout is undefined', () => {
		const controller = new AbortController();
		expect(withRequestTimeout(controller.signal, undefined)).toBe(controller.signal);
	});

	it('returns undefined when there is no caller signal and no timeout', () => {
		expect(withRequestTimeout(undefined, 0)).toBeUndefined();
	});

	it('returns a timeout-only signal when there is no caller signal', () => {
		const signal = withRequestTimeout(undefined, 30);
		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal?.aborted).toBe(false);
	});

	it('combines caller signal and timeout into a new signal', () => {
		const controller = new AbortController();
		const combined = withRequestTimeout(controller.signal, 30);
		expect(combined).not.toBe(controller.signal);
		expect(combined?.aborted).toBe(false);
		controller.abort();
		expect(combined?.aborted).toBe(true);
	});
});
