import { describe, it, expect } from 'vitest';
import { firstImageUrl, inferMediaType } from './media';

describe('firstImageUrl', () => {
	it('returns the first image-type entry, skipping leading videos', () => {
		const media = [
			{ url: 'a.mp4', type: 'video' as const },
			{ url: 'b.png', type: 'image' as const }
		];
		expect(firstImageUrl(media)).toBe('b.png');
	});

	it('returns undefined for an empty array', () => {
		expect(firstImageUrl([])).toBeUndefined();
	});

	it("doesn't throw on a missing media array (e.g. a locally cached character from before the field existed)", () => {
		expect(firstImageUrl(undefined)).toBeUndefined();
	});
});

describe('inferMediaType', () => {
	it('detects video extensions', () => {
		expect(inferMediaType('https://example.com/clip.mp4')).toBe('video');
	});

	it('defaults to image for anything else', () => {
		expect(inferMediaType('https://example.com/pic.png')).toBe('image');
		expect(inferMediaType('https://example.com/blob')).toBe('image');
	});
});
