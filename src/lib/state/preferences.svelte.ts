import { browser } from '$app/environment';
import { get, set } from 'idb-keyval';
import type { Preferences } from '$lib/types';
import { DEFAULT_GUN_RELAYS } from '$lib/gun/relays';

const STORAGE_KEY = 'charshare:preferences';

export const DEFAULT_PREFERENCES: Preferences = {
	gunRelays: DEFAULT_GUN_RELAYS,
	theme: 'dark',
	blockedTags: [],
	provider: {
		provider: 'openrouter',
		apiKey: '',
		model: 'meta-llama/llama-3.1-8b-instruct:free',
		temperature: 1,
		max_tokens: 512,
		context_size: 8192,
		top_k: 0,
		top_p: 1,
		repetition_penalty: 1,
		frequency_penalty: 0,
		forbidden_words: []
	}
};

let preferences = $state<Preferences>(DEFAULT_PREFERENCES);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getPreferences(): Preferences {
	return preferences;
}

export function isPreferencesReady(): boolean {
	return ready;
}

/** Loads preferences from IndexedDB, falling back to defaults on first run.
 *  Safe to call multiple times; the underlying load only happens once. */
export function initPreferences(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			const stored = await get<Preferences>(STORAGE_KEY);
			if (stored) preferences = stored;
			ready = true;
		})();
	}
	return initPromise;
}

export async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
	preferences = { ...preferences, ...patch };
	await set(STORAGE_KEY, preferences);
}
