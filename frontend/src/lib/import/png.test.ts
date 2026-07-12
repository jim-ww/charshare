import { describe, it, expect } from 'vitest';
import { parsePng, writePng, readTextChunk, writeTextChunk } from './png';

// A real, minimal 1x1 transparent PNG (IHDR + IDAT + IEND, no ancillary
// chunks) — used as a base image to write/read tEXt chunks against.
const MINIMAL_PNG = Uint8Array.from([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12,
	2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69,
	78, 68, 174, 66, 96, 130
]);

describe('parsePng/writePng', () => {
	it('round-trips a minimal PNG byte-for-byte through parse and write', () => {
		const chunks = parsePng(MINIMAL_PNG);
		expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
		expect(writePng(chunks)).toEqual(MINIMAL_PNG);
	});

	it('throws on a non-PNG buffer', () => {
		expect(() => parsePng(Uint8Array.from([1, 2, 3, 4]))).toThrow();
	});
});

describe('writeTextChunk/readTextChunk', () => {
	it('writes a tEXt chunk and reads it back', () => {
		const withText = writeTextChunk(MINIMAL_PNG, 'chara', 'aGVsbG8=');
		expect(readTextChunk(withText, 'chara')).toBe('aGVsbG8=');
	});

	it('the written PNG is still a valid, parseable PNG with IEND last', () => {
		const withText = writeTextChunk(MINIMAL_PNG, 'chara', 'payload');
		const chunks = parsePng(withText);
		expect(chunks.at(-1)?.type).toBe('IEND');
		expect(chunks.some((c) => c.type === 'tEXt')).toBe(true);
	});

	it('replaces an existing chunk with the same keyword instead of duplicating it', () => {
		const once = writeTextChunk(MINIMAL_PNG, 'chara', 'first');
		const twice = writeTextChunk(once, 'chara', 'second');
		const chunks = parsePng(twice);
		expect(chunks.filter((c) => c.type === 'tEXt')).toHaveLength(1);
		expect(readTextChunk(twice, 'chara')).toBe('second');
	});

	it('leaves other tEXt chunks with different keywords alone', () => {
		const withOther = writeTextChunk(MINIMAL_PNG, 'Comment', 'hi');
		const withCard = writeTextChunk(withOther, 'chara', 'payload');
		expect(readTextChunk(withCard, 'Comment')).toBe('hi');
		expect(readTextChunk(withCard, 'chara')).toBe('payload');
	});

	it('readTextChunk returns null for a missing keyword or non-PNG input', () => {
		expect(readTextChunk(MINIMAL_PNG, 'chara')).toBeNull();
		expect(readTextChunk(Uint8Array.from([1, 2, 3]), 'chara')).toBeNull();
	});
});
