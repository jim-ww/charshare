import { describe, it, expect, beforeEach, vi } from 'vitest';

// profile.svelte.ts touches several network/storage modules that either need
// a real IndexedDB or real relay networking, neither available under plain
// Node/vitest — mock them the same way other state tests do (see
// characters-relay-resync.test.ts, savedCharacters.svelte.test.ts).
let registered = true;
vi.mock('$lib/state/auth.svelte', () => ({
	getCurrentUser: () => 'my-pubkey',
	initAuth: async () => {},
	isAccountRegistered: () => registered,
	markRegistered: async () => {}
}));

interface UsernameClaimResult {
	ok: boolean;
	doc?: { authorPub: string; deleted: boolean };
}
let claimResolver: (username: string) => UsernameClaimResult = () => ({ ok: false });
vi.mock('$lib/nostr/usernames', () => ({
	getUsernameClaim: async (username: string) => claimResolver(username)
}));

const publishProfileMock = vi.fn(async (fields: { username: string; description: string; image_url?: string }) => ({
	id: 'my-pubkey',
	...fields,
	created_at: 1,
	updated_at: 2,
	deleted: false,
	deleted_at: null
}));
interface GetProfileResult {
	ok: boolean;
	doc?: { id: string; username: string; description: string; image_url?: string; deleted: boolean };
}
let getProfileResolver: (pubkey: string) => GetProfileResult = () => ({ ok: false });
vi.mock('$lib/nostr/profile', () => ({
	publishProfile: (fields: { username: string; description: string; image_url?: string }) =>
		publishProfileMock(fields),
	getProfile: async (pubkey: string) => getProfileResolver(pubkey),
	subscribeProfileWithRetry: () => () => {}
}));

let cachedProfile: { id: string; username: string; description: string; image_url?: string; deleted: boolean } | null =
	null;
vi.mock('$lib/db/profile', () => ({
	loadCachedProfile: async () => cachedProfile,
	saveCachedProfile: async () => {},
	clearCachedProfile: async () => {}
}));

const notifyMock = vi.fn(
	(_message: string, _options?: { kind?: string; duration?: number; action?: unknown }) => 'notif-id'
);
vi.mock('$lib/state/notifications.svelte', () => ({
	notify: (message: string, options?: { kind?: string; duration?: number; action?: unknown }) =>
		notifyMock(message, options)
}));

const openSettingsMock = vi.fn((_tab?: string) => {});
vi.mock('$lib/state/settingsModal.svelte', () => ({
	openSettings: (tab?: string) => openSettingsMock(tab)
}));

async function freshProfileModule() {
	vi.resetModules();
	return import('./profile.svelte');
}

beforeEach(() => {
	registered = true;
	claimResolver = () => ({ ok: false });
	getProfileResolver = () => ({ ok: false });
	cachedProfile = null;
	publishProfileMock.mockClear();
	notifyMock.mockClear();
	openSettingsMock.mockClear();
});

describe('initProfile resync', () => {
	it("republishes our own cached profile when the connected relay has never seen it", async () => {
		cachedProfile = { id: 'my-pubkey', username: 'alice', description: 'hi', deleted: false };
		getProfileResolver = () => ({ ok: false });

		const { initProfile, getMyProfile, isProfileSynced } = await freshProfileModule();
		await initProfile();

		expect(publishProfileMock).toHaveBeenCalledTimes(1);
		expect(publishProfileMock.mock.calls[0][0]).toEqual({ username: 'alice', description: 'hi' });
		expect(getMyProfile()?.username).toBe('alice');
		expect(isProfileSynced()).toBe(true);
	});

	it("doesn't republish when the relay already has our profile", async () => {
		cachedProfile = { id: 'my-pubkey', username: 'alice', description: 'hi', deleted: false };
		getProfileResolver = (pubkey) => ({
			ok: true,
			doc: { id: pubkey, username: 'alice', description: 'hi', deleted: false }
		});

		const { initProfile, isProfileSynced } = await freshProfileModule();
		await initProfile();

		expect(publishProfileMock).not.toHaveBeenCalled();
		expect(isProfileSynced()).toBe(true);
	});

	it("doesn't republish a tombstoned cached profile", async () => {
		cachedProfile = { id: 'my-pubkey', username: 'alice', description: 'hi', deleted: true };
		getProfileResolver = () => ({ ok: false });

		const { initProfile } = await freshProfileModule();
		await initProfile();

		expect(publishProfileMock).not.toHaveBeenCalled();
	});

	it('a genuine username conflict hit during resync republish is swallowed here, then caught and resolved by the follow-up checkUsernameConflict() (see +layout.svelte)', async () => {
		cachedProfile = { id: 'my-pubkey', username: 'alice', description: 'hi', deleted: false };
		getProfileResolver = () => ({ ok: false });
		// Someone else already holds "alice" — the resync's own republish
		// attempt (calls publishProfile, which re-claims the username) fails.
		claimResolver = (username) =>
			username === 'alice' ? { ok: true, doc: { authorPub: 'someone-else', deleted: false } } : { ok: false };
		publishProfileMock.mockRejectedValueOnce(new Error('Username is already taken.'));

		const { initProfile, checkUsernameConflict, getMyProfile, isProfileSynced } = await freshProfileModule();
		await initProfile();
		// The failed republish must not have been mistaken for success.
		expect(isProfileSynced()).toBe(false);

		await checkUsernameConflict();

		expect(publishProfileMock).toHaveBeenCalledTimes(2);
		const renamedUsername = publishProfileMock.mock.calls[1][0].username;
		expect(renamedUsername).toMatch(/^alice\d{4}$/);
		expect(getMyProfile()?.username).toBe(renamedUsername);
		expect(notifyMock).toHaveBeenCalledTimes(1);
	});
});

describe('checkUsernameConflict', () => {
	it('does nothing when the account is unregistered', async () => {
		registered = false;
		const { checkUsernameConflict } = await freshProfileModule();
		await checkUsernameConflict();
		expect(notifyMock).not.toHaveBeenCalled();
		expect(publishProfileMock).not.toHaveBeenCalled();
	});

	it('does nothing when no profile has loaded yet', async () => {
		const { checkUsernameConflict } = await freshProfileModule();
		await checkUsernameConflict();
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it('does nothing when our username is unclaimed', async () => {
		const { checkUsernameConflict, loadProfileForSwitchedAccount } = await freshProfileModule();
		await loadProfileForSwitchedAccount({ username: 'alice', description: '' });
		claimResolver = () => ({ ok: false });
		await checkUsernameConflict();
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it('does nothing when we hold the claim ourselves', async () => {
		const { checkUsernameConflict, loadProfileForSwitchedAccount } = await freshProfileModule();
		await loadProfileForSwitchedAccount({ username: 'alice', description: '' });
		claimResolver = () => ({ ok: true, doc: { authorPub: 'my-pubkey', deleted: false } });
		await checkUsernameConflict();
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it('auto-renames and notifies on a genuine conflict', async () => {
		const { checkUsernameConflict, loadProfileForSwitchedAccount, getMyProfile } = await freshProfileModule();
		await loadProfileForSwitchedAccount({ username: 'alice', description: 'hi' });
		claimResolver = (username) =>
			username === 'alice'
				? { ok: true, doc: { authorPub: 'someone-else', deleted: false } }
				: { ok: false };

		await checkUsernameConflict();

		expect(publishProfileMock).toHaveBeenCalledTimes(1);
		const newUsername = publishProfileMock.mock.calls[0][0].username;
		expect(newUsername).toMatch(/^alice\d{4}$/);
		expect(getMyProfile()?.username).toBe(newUsername);
		expect(notifyMock).toHaveBeenCalledTimes(1);
		expect(notifyMock.mock.calls[0][0]).toContain('alice');
		expect(notifyMock.mock.calls[0][1]).toMatchObject({ kind: 'warning', duration: 0 });
	});

	it('only runs once per session even if called again', async () => {
		const { checkUsernameConflict, loadProfileForSwitchedAccount } = await freshProfileModule();
		await loadProfileForSwitchedAccount({ username: 'alice', description: '' });
		claimResolver = (username) =>
			username === 'alice'
				? { ok: true, doc: { authorPub: 'someone-else', deleted: false } }
				: { ok: false };

		await checkUsernameConflict();
		await checkUsernameConflict();

		expect(notifyMock).toHaveBeenCalledTimes(1);
	});
});
