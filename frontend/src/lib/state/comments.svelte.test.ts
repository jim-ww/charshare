import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Comment } from '$lib/types';

// $lib/nostr/comments talks to a real relay pool — swap it for a mock so this
// test can deterministically simulate a cold relay pool that returns nothing
// on the first query and only has the real data by the time a retry fires
// (see loadComments' retry loop, added for exactly this scenario).
const getCommentsForCharacter = vi.fn();
vi.mock('$lib/nostr/comments', () => ({
	getCommentsForCharacter: (...args: unknown[]) => getCommentsForCharacter(...args),
	getCommentsAuthoredBy: vi.fn(async () => []),
	postComment: vi.fn(),
	deleteComment: vi.fn()
}));

const { loadComments, getCommentsFor, isLoadingComments } = await import('./comments.svelte');

function comment(id: string): Comment {
	return {
		id,
		character_id: 'author:uuid',
		content: 'hi',
		parent_id: null,
		author: 'author-pub',
		created_at: 1,
		updated_at: 1,
		deleted: false,
		deleted_at: null
	};
}

beforeEach(() => {
	getCommentsForCharacter.mockReset();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('loadComments retry', () => {
	it('retries and picks up comments that arrive on a later attempt', async () => {
		getCommentsForCharacter
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([comment('c1')]);

		const loadPromise = loadComments('author:uuid');
		await vi.runAllTimersAsync();
		await loadPromise;

		expect(getCommentsForCharacter).toHaveBeenCalledTimes(3);
		expect(getCommentsFor('author:uuid').map((c) => c.id)).toEqual(['c1']);
		expect(isLoadingComments('author:uuid')).toBe(false);
	});

	it("doesn't retry once the first attempt already finds something", async () => {
		getCommentsForCharacter.mockResolvedValueOnce([comment('c1')]);

		await loadComments('author:uuid');

		expect(getCommentsForCharacter).toHaveBeenCalledTimes(1);
	});

	it('gives up after exhausting retries, leaving an empty (genuinely commentless) result', async () => {
		getCommentsForCharacter.mockResolvedValue([]);

		const loadPromise = loadComments('author:uuid');
		await vi.runAllTimersAsync();
		await loadPromise;

		expect(getCommentsForCharacter).toHaveBeenCalledTimes(3);
		expect(getCommentsFor('author:uuid')).toEqual([]);
	});
});
