import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { deleteCharacter, forkCharacter, publishCharacter, publishLocalCharacter } from './characters';
import { browseByTag, browseNetworkPage, browseByName, browseByAuthor, browseForksOf } from './browse';
import { publishProfile } from './profile';
import { __setPreferencesForTests } from '$lib/state/preferences.svelte';

async function browseNetwork() {
	return (await browseNetworkPage(null, 1000)).characters;
}

const baseFields = {
	image_urls: [],
	description: '',
	personality: '',
	scenario: '',
	nsfw: false,
	language: '',
	system_prompt: '',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: [],
	comments_enabled: true
};

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
});

describe('browseByTag', () => {
	it('finds published characters carrying the tag', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Aria', tags: [tag] });

		const results = await browseByTag(tag);

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('excludes tombstoned characters', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Gone', tags: [tag] });
		await deleteCharacter(created.id);

		const results = await browseByTag(tag);
		expect(results.map((c) => c.id)).not.toContain(created.id);
	});

	it('returns nothing for an unused tag', async () => {
		const results = await browseByTag(`unused-${crypto.randomUUID()}`);
		expect(results).toEqual([]);
	});
});

describe('browseNetwork', () => {
	it('finds a published character regardless of its tags', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Nova', tags: [tag] });

		const results = await browseNetwork();

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('excludes tombstoned characters', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'GoneNetwork', tags: [tag] });
		await deleteCharacter(created.id);

		const results = await browseNetwork();
		expect(results.map((c) => c.id)).not.toContain(created.id);
	});
});

describe('browseNetworkPage', () => {
	it('pages through results and eventually returns a null cursor', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await Promise.all(
			[0, 1, 2].map((i) => publishCharacter({ ...baseFields, name: `Page${i}`, tags: [tag] }))
		);

		const seen: string[] = [];
		let cursor = null;
		let guard = 0;
		do {
			const page = await browseNetworkPage(cursor, 1);
			expect(page.characters.length).toBeLessThanOrEqual(1);
			seen.push(...page.characters.map((c) => c.id));
			cursor = page.cursor;
			guard += 1;
		} while (cursor !== null && guard < 100);

		for (const c of created) expect(seen).toContain(c.id);
	});

	it('sorts newest-published first within a page', async () => {
		// published_at is second-resolution (Nostr's own created_at unit), so
		// the two publishes need to land in different seconds for sort order
		// to be observable — a plain few-ms gap wouldn't produce a difference.
		const tag = `t-${crypto.randomUUID()}`;
		const older = await publishCharacter({ ...baseFields, name: 'Older', tags: [tag] });
		await new Promise((resolve) => setTimeout(resolve, 1100));
		const newer = await publishCharacter({ ...baseFields, name: 'Newer', tags: [tag] });

		const { characters } = await browseNetworkPage(null, 1000);
		const olderIndex = characters.findIndex((c) => c.id === older.id);
		const newerIndex = characters.findIndex((c) => c.id === newer.id);

		expect(newerIndex).toBeLessThan(olderIndex);
	}, 20000);

	it('sorts oldest-published first when order is asc', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const older = await publishCharacter({ ...baseFields, name: 'AscOlder', tags: [tag] });
		await new Promise((resolve) => setTimeout(resolve, 1100));
		const newer = await publishCharacter({ ...baseFields, name: 'AscNewer', tags: [tag] });

		const { characters } = await browseNetworkPage(null, 1000, 'asc');
		const olderIndex = characters.findIndex((c) => c.id === older.id);
		const newerIndex = characters.findIndex((c) => c.id === newer.id);

		expect(olderIndex).toBeLessThan(newerIndex);
	}, 20000);

	it('keeps the same order across pages once a cursor is established', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		await Promise.all([0, 1, 2, 3].map((i) => publishCharacter({ ...baseFields, name: `Asc${i}`, tags: [tag] })));

		const first = await browseNetworkPage(null, 2, 'asc');
		expect(first.cursor).not.toBeNull();
		// Continuing the cursor must keep walking ascending even though no
		// `order` argument is passed here — the cursor is the source of truth.
		const second = await browseNetworkPage(first.cursor, 2);

		const allSortedAsc = [...first.characters, ...second.characters]
			.map((c) => c.created_at)
			.every((t, i, arr) => i === 0 || arr[i - 1] <= t);
		expect(allSortedAsc).toBe(true);
	});
});

describe('browseByName', () => {
	it('finds a published character by a name token', async () => {
		const suffix = crypto.randomUUID().slice(0, 8);
		const created = await publishCharacter({ ...baseFields, name: `Aria ${suffix}`, tags: [] });

		const results = await browseByName(suffix);

		expect(results.map((c) => c.id)).toContain(created.id);
	});

	it('returns nothing for an unused name', async () => {
		const results = await browseByName(`unused-${crypto.randomUUID()}`);
		expect(results).toEqual([]);
	});
});

describe('author blocklist', () => {
	afterAll(() => {
		__setPreferencesForTests({ blockedAuthors: [] });
	});

	it('excludes characters from a locally-blocked author', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const tag = `t-${crypto.randomUUID()}`;
		const created = await publishCharacter({ ...baseFields, name: 'Blocked', tags: [tag] });

		__setPreferencesForTests({ blockedAuthors: [keyring.publicKey] });

		expect((await browseByTag(tag)).map((c) => c.id)).not.toContain(created.id);
		expect((await browseNetwork()).map((c) => c.id)).not.toContain(created.id);

		__setPreferencesForTests({ blockedAuthors: [] });
		expect((await browseByTag(tag)).map((c) => c.id)).toContain(created.id);
	});
});

describe('browseForksOf', () => {
	it('finds a published fork of the original character', async () => {
		const original = await publishCharacter({ ...baseFields, name: 'Original', tags: [] });

		const fork = await forkCharacter(original.id);
		expect(fork.forked_from).toBe(original.id);
		await publishLocalCharacter(fork);

		const results = await browseForksOf(original.id);
		expect(results.map((c) => c.id)).toContain(fork.id);
	});

	it('does not surface a fork that was never published', async () => {
		const original = await publishCharacter({ ...baseFields, name: 'OriginalUnpublishedFork', tags: [] });

		await forkCharacter(original.id);

		const results = await browseForksOf(original.id);
		expect(results).toEqual([]);
	});

	it('returns nothing for a character with no forks', async () => {
		const original = await publishCharacter({ ...baseFields, name: 'NoForks', tags: [] });

		const results = await browseForksOf(original.id);
		expect(results).toEqual([]);
	});
});

describe('browseByAuthor', () => {
	it('finds characters authored by a raw pubkey', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const created = await publishCharacter({ ...baseFields, name: 'ByPubkey', tags: [] });

		const results = await browseByAuthor(keyring.publicKey);

		expect(results.map((c) => c.id)).toEqual([created.id]);
	});

	it('resolves a claimed username to its author', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const username = `author-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: '' });
		const created = await publishCharacter({ ...baseFields, name: 'ByUsername', tags: [] });

		const results = await browseByAuthor(username);

		expect(results.map((c) => c.id)).toEqual([created.id]);
	});
});
