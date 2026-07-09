import { browser } from "$app/environment";
import { get, set } from "idb-keyval";
import type {
	HuggingFaceProviderConfig,
	OllamaProviderConfig,
	OpenRouterProviderConfig,
	Preferences,
	ProviderConfig,
} from "$lib/types";
import { DEFAULT_GUN_RELAYS } from "$lib/gun/relays";

const STORAGE_KEY = "charshare:preferences";

/** Defaults used both for initial preferences and when the user switches
 *  provider in Settings, so each provider's fields start from something sane. */
export const DEFAULT_OPENROUTER_CONFIG: OpenRouterProviderConfig = {
	provider: "openrouter",
	apiKey: "",
	model: "tencent/hy3:free",
	temperature: 1,
	max_tokens: 512,
	context_size: 8192,
	top_k: 0,
	top_p: 1,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
};

export const DEFAULT_OLLAMA_CONFIG: OllamaProviderConfig = {
	provider: "ollama",
	baseUrl: "http://localhost:11434",
	model: "llama3.1:8b",
	temperature: 1,
	max_tokens: 512,
	context_size: 8192,
	top_k: 0,
	top_p: 1,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
};

export const DEFAULT_HUGGINGFACE_CONFIG: HuggingFaceProviderConfig = {
	provider: "huggingface",
	apiKey: "",
	model: "Sao10K/L3-8B-Stheno-v3.2",
	temperature: 1,
	max_tokens: 512,
	context_size: 8192,
	top_k: 0,
	top_p: 1,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
};

export const DEFAULT_PREFERENCES: Preferences = {
	gunRelays: DEFAULT_GUN_RELAYS,
	theme: "forest",
	blockedTags: [],
	blockedAuthors: [],
	hiddenCharacterIds: [],
	hiddenCommentIds: [],
	personaSelections: {},
	defaultBackground: "",
	chatOpacity: 100,
	showNsfw: false,
	provider: DEFAULT_HUGGINGFACE_CONFIG,
	providerConfigs: {
		openrouter: DEFAULT_OPENROUTER_CONFIG,
		ollama: DEFAULT_OLLAMA_CONFIG,
		huggingface: DEFAULT_HUGGINGFACE_CONFIG,
	},
};

/** The "nerdy" fields grouped under the Advanced collapse in Settings. Model
 *  and disable_thinking are deliberately excluded — they stay top-level. */
const ADVANCED_DEFAULT_KEYS = [
	"temperature",
	"max_tokens",
	"context_size",
	"top_k",
	"top_p",
	"repetition_penalty",
	"frequency_penalty",
	"forbidden_words",
] as const satisfies (keyof OpenRouterProviderConfig)[];

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
			if (stored) {
				preferences = stored;
				// Migrate preferences saved before per-provider configs (or newer
				// providers) existed, backfilling anything missing with defaults.
				preferences = {
					...preferences,
					blockedAuthors: preferences.blockedAuthors ?? [],
					hiddenCharacterIds: preferences.hiddenCharacterIds ?? [],
					hiddenCommentIds: preferences.hiddenCommentIds ?? [],
					personaSelections: preferences.personaSelections ?? {},
					defaultBackground: preferences.defaultBackground ?? "",
					chatOpacity: preferences.chatOpacity ?? 100,
					showNsfw: preferences.showNsfw ?? false,
					providerConfigs: {
						...DEFAULT_PREFERENCES.providerConfigs,
						...preferences.providerConfigs,
						[preferences.provider.provider]: preferences.provider,
					},
				};
			}
			ready = true;
		})();
	}
	return initPromise;
}

export async function updatePreferences(
	patch: Partial<Preferences>,
): Promise<void> {
	preferences = { ...preferences, ...patch };
	// idb-keyval structured-clones the value for IndexedDB, which throws on
	// the Proxy that $state wraps objects in — persist a plain snapshot instead.
	await set(STORAGE_KEY, $state.snapshot(preferences));
}

/** Updates the active provider's config, keeping its saved slot in
 *  providerConfigs in sync so switching providers and back preserves it. */
export async function updateProviderConfig(
	patch: Partial<ProviderConfig>,
): Promise<void> {
	const provider = { ...preferences.provider, ...patch } as ProviderConfig;
	await updatePreferences({
		provider,
		providerConfigs: {
			...preferences.providerConfigs,
			[provider.provider]: provider,
		},
	});
}

/** Switches the active provider, restoring that provider's own last-saved
 *  config instead of resetting or borrowing settings from the old one. */
export async function switchProvider(
	next: ProviderConfig["provider"],
): Promise<void> {
	if (next === preferences.provider.provider) return;
	await updatePreferences({ provider: preferences.providerConfigs[next] });
}

export function isCharacterHidden(characterId: string): boolean {
	return preferences.hiddenCharacterIds.includes(characterId);
}

export async function hideCharacter(characterId: string): Promise<void> {
	if (preferences.hiddenCharacterIds.includes(characterId)) return;
	await updatePreferences({
		hiddenCharacterIds: [...preferences.hiddenCharacterIds, characterId],
	});
}

export async function unhideCharacter(characterId: string): Promise<void> {
	await updatePreferences({
		hiddenCharacterIds: preferences.hiddenCharacterIds.filter(
			(id) => id !== characterId,
		),
	});
}

export function isCommentHidden(commentId: string): boolean {
	return preferences.hiddenCommentIds.includes(commentId);
}

/** Hides a comment locally — this browser only, not a network action. The
 *  comment itself is untouched; anyone else, including its author, still
 *  sees it exactly as published. See landing page: no user gets the power
 *  to take another user's speech away, so a comment can only be hidden
 *  from the person choosing to hide it, never removed for everyone. */
export async function hideComment(commentId: string): Promise<void> {
	if (preferences.hiddenCommentIds.includes(commentId)) return;
	await updatePreferences({
		hiddenCommentIds: [...preferences.hiddenCommentIds, commentId],
	});
}

export async function unhideComment(commentId: string): Promise<void> {
	await updatePreferences({
		hiddenCommentIds: preferences.hiddenCommentIds.filter(
			(id) => id !== commentId,
		),
	});
}

export function isAuthorBlocked(authorPubkey: string): boolean {
	return preferences.blockedAuthors.includes(authorPubkey);
}

/** Blocks an author locally — their characters stop showing up in Browse for
 *  this browser only (see gun/browse.ts). Not a network action: the author
 *  isn't notified and can still publish; nothing prevents them from being
 *  unblocked and reappearing later. */
export async function blockAuthor(authorPubkey: string): Promise<void> {
	if (preferences.blockedAuthors.includes(authorPubkey)) return;
	await updatePreferences({
		blockedAuthors: [...preferences.blockedAuthors, authorPubkey],
	});
}

export async function unblockAuthor(authorPubkey: string): Promise<void> {
	await updatePreferences({
		blockedAuthors: preferences.blockedAuthors.filter(
			(pub) => pub !== authorPubkey,
		),
	});
}

/** Test-only escape hatch: sets preferences directly, bypassing the
 *  IndexedDB-backed persistence in updatePreferences (unavailable under
 *  plain Node/vitest). */
export function __setPreferencesForTests(patch: Partial<Preferences>): void {
	preferences = { ...preferences, ...patch };
}

/** Resets only the nerdy/advanced fields of the active provider back to
 *  defaults, leaving model, connection details and disable_thinking as-is. */
export async function resetAdvancedProviderDefaults(): Promise<void> {
	const defaults =
		DEFAULT_PREFERENCES.providerConfigs[preferences.provider.provider];
	const patch = Object.fromEntries(
		ADVANCED_DEFAULT_KEYS.map((key) => [key, defaults[key]]),
	) as Partial<ProviderConfig>;
	await updateProviderConfig(patch);
}
