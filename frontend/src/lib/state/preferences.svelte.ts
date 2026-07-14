import { browser } from "$app/environment";
import { get, set } from "idb-keyval";
import type {
	HuggingFaceProviderConfig,
	OllamaProviderConfig,
	OpenAiCompatibleProviderConfig,
	OpenRouterProviderConfig,
	Preferences,
	ProviderConfig,
} from "$lib/types";
import { DEFAULT_NOSTR_RELAYS } from "$lib/nostr/relays";

const STORAGE_KEY = "charshare:preferences";

/** Defaults used both for initial preferences and when the user switches
 *  provider in Settings, so each provider's fields start from something sane. */
export const DEFAULT_OPENROUTER_CONFIG: OpenRouterProviderConfig = {
	provider: "openrouter",
	apiKey: "",
	model: "openrouter/free", //"tencent/hy3:free",
	temperature: 1,
	max_tokens: 512,
	context_size: 8192,
	top_k: 0,
	top_p: 1,
	min_p: 0,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
	tosAgreed: false,
};

export const DEFAULT_OLLAMA_CONFIG: OllamaProviderConfig = {
	provider: "ollama",
	baseUrl: "http://localhost:11434",
	model: "hf.co/bartowski/L3-8B-Stheno-v3.2-GGUF:Q4_K_M",
	temperature: 1.15, // 0.8
	max_tokens: 512,
	context_size: 4096, // 8192,
	top_k: 50, // 40
	top_p: 0.9,
	min_p: 0.075, // 0
	repetition_penalty: 1.1, // 1
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
	// Ollama talks to a server the user runs themselves — no third-party ToS to agree to.
	tosAgreed: true,
	keep_alive_minutes: 10,
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
	min_p: 0,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
	tosAgreed: false,
};

export const DEFAULT_OPENAI_COMPATIBLE_CONFIG: OpenAiCompatibleProviderConfig =
	{
		provider: "openai_compatible",
		baseUrl: "",
		apiKey: "",
		model: "",
		temperature: 1,
		max_tokens: 512,
		context_size: 8192,
		top_k: 0,
		top_p: 1,
		min_p: 0,
		repetition_penalty: 1,
		frequency_penalty: 0,
		forbidden_words: [],
		disable_thinking: true,
		tosAgreed: false,
	};

export const DEFAULT_PREFERENCES: Preferences = {
	nostrRelays: DEFAULT_NOSTR_RELAYS,
	theme: "sunset", // best: dark forest halloween dracula night coffee dim sunset
	blockedTags: [],
	blockedAuthors: [],
	hiddenCharacterIds: [],
	hiddenCommentIds: [],
	personaSelections: {},
	defaultBackground: "",
	chatOpacity: 100,
	showNsfw: false,
	whisperConsentGiven: false,
	whisperModelSize: "tiny",
	micSilenceTimeoutMs: 1500,
	ttsConsentGiven: false,
	voicevoxBaseUrl: "http://localhost:50021",
	autoReadAloud: false,
	disableSlideshows: false,
	provider: DEFAULT_OLLAMA_CONFIG,
	providerConfigs: {
		openrouter: DEFAULT_OPENROUTER_CONFIG,
		ollama: DEFAULT_OLLAMA_CONFIG,
		huggingface: DEFAULT_HUGGINGFACE_CONFIG,
		openai_compatible: DEFAULT_OPENAI_COMPATIBLE_CONFIG,
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
	"min_p",
	"repetition_penalty",
	"frequency_penalty",
	"forbidden_words",
] as const satisfies (keyof OpenRouterProviderConfig)[];

let preferences = $state<Preferences>(DEFAULT_PREFERENCES);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

/** Backfills `tosAgreed` on configs saved before the field existed. Ollama
 *  talks to a server the user runs themselves, so it never needed agreement.
 *  Also backfills fields added later that only apply to one provider
 *  (min_p to every provider, keep_alive_minutes to Ollama only). */
function withTosAgreed<T extends ProviderConfig>(config: T): T {
	const withDefaults: T = {
		...config,
		tosAgreed: config.tosAgreed ?? config.provider === "ollama",
		min_p: config.min_p ?? 0,
	};
	if (withDefaults.provider === "ollama") {
		return {
			...withDefaults,
			keep_alive_minutes: withDefaults.keep_alive_minutes ?? 10,
		};
	}
	return withDefaults;
}

export function getPreferences(): Preferences {
	return preferences;
}

/** The relay set the app actually talks to right now — the user's own
 *  configured `nostrRelays` (see NetworkTab.svelte). A fresh install starts
 *  from `DEFAULT_NOSTR_RELAYS` (set as the initial preference value), but if
 *  the user deliberately clears the list down to nothing, that's treated as
 *  offline mode (see isOfflineMode) rather than silently falling back to the
 *  defaults — otherwise there would be no way to actually go offline. Read
 *  fresh (not cached) by every nostr/*.ts network call so an in-session
 *  relay-list change takes effect immediately. */
export function getActiveRelays(): string[] {
	return preferences.nostrRelays;
}

/** True once the user has cleared their relay list down to nothing — every
 *  nostr/*.ts network call becomes a no-op against an empty relay set, so the
 *  UI should treat this as "offline" rather than "the network legitimately
 *  has zero results." */
export function isOfflineMode(): boolean {
	return getActiveRelays().length === 0;
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
					whisperConsentGiven: preferences.whisperConsentGiven ?? false,
					whisperModelSize: preferences.whisperModelSize ?? "tiny",
					micSilenceTimeoutMs: preferences.micSilenceTimeoutMs ?? 1500,
					ttsConsentGiven: preferences.ttsConsentGiven ?? false,
					voicevoxBaseUrl:
						preferences.voicevoxBaseUrl ?? "http://localhost:50021",
					autoReadAloud: preferences.autoReadAloud ?? false,
					disableSlideshows: preferences.disableSlideshows ?? false,
					provider: withTosAgreed(preferences.provider),
					providerConfigs: Object.fromEntries(
						Object.entries({
							...DEFAULT_PREFERENCES.providerConfigs,
							...preferences.providerConfigs,
							[preferences.provider.provider]: preferences.provider,
						}).map(([key, config]) => [
							key,
							withTosAgreed(config as ProviderConfig),
						]),
					) as typeof preferences.providerConfigs,
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
 *  this browser only (see nostr/browse.ts). Not a network action: the author
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
