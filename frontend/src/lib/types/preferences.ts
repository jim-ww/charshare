export const DAISYUI_THEMES = [
  'light',
  'dark',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'aqua',
  'lofi',
  'pastel',
  'fantasy',
  'wireframe',
  'black',
  'luxury',
  'dracula',
  'cmyk',
  'autumn',
  'business',
  'acid',
  'lemonade',
  'night',
  'coffee',
  'winter',
  'dim',
  'nord',
  'sunset',
  'caramellatte',
  'abyss',
  'silk'
] as const;

export type ThemeMode = (typeof DAISYUI_THEMES)[number];

interface CommonProviderConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  context_size: number;
  top_k: number;
  top_p: number;
  repetition_penalty: number;
  frequency_penalty: number;
  forbidden_words: string[];
  disable_thinking: boolean;
}

export interface OpenRouterProviderConfig extends CommonProviderConfig {
  provider: 'openrouter';
  apiKey: string; // stored locally only, never published
  // OpenRouter model id, e.g. "meta-llama/llama-3.1-8b-instruct:free"
}

export interface OllamaProviderConfig extends CommonProviderConfig {
  provider: 'ollama';
  baseUrl: string; // e.g. "http://localhost:11434", no key needed
  // Ollama model tag, e.g. "llama3.1:8b"
}

export interface HuggingFaceProviderConfig extends CommonProviderConfig {
  provider: 'huggingface';
  apiKey: string; // stored locally only, never published
  // Hugging Face model id, e.g. "meta-llama/Meta-Llama-3-8B-Instruct"
}

// Any other OpenAI-compatible chat-completions endpoint — a self-hosted
// proxy, a third-party API, a local inference server that isn't Ollama's
// native API. Same request/response shape as OpenRouter/HuggingFace
// (POST {baseUrl}/chat/completions, SSE streaming), just with a
// user-supplied base URL instead of a fixed one. apiKey is optional (some
// self-hosted proxies need none) — sent as a Bearer token only when non-empty.
export interface OpenAiCompatibleProviderConfig extends CommonProviderConfig {
  provider: 'openai_compatible';
  baseUrl: string; // e.g. "https://api.example.com/v1", no trailing slash needed
  apiKey: string; // stored locally only, never published — may be left empty
}

export type ProviderConfig =
  | OpenRouterProviderConfig
  | OllamaProviderConfig
  | HuggingFaceProviderConfig
  | OpenAiCompatibleProviderConfig; // union grows as more providers are added

// Per-provider saved settings, so switching providers doesn't clobber the other's config.
export type ProviderConfigMap = {
  [P in ProviderConfig['provider']]: Extract<ProviderConfig, { provider: P }>;
};

export interface LocalTtsProviderConfig {
  provider: 'local'; // the built-in Supertonic model, see lib/tts/models.ts
}

// Talks to a VOICEVOX Engine instance (https://voicevox.hiroshiba.jp/) the
// user runs themselves — same shape as our Ollama chat provider: nothing
// downloaded or bundled by us, just HTTP calls to a local server the user
// already has open. `baseUrl` is a device-wide preference (see Sound
// settings); which speaker/style to use is chosen per chat, like voice
// selection for the local provider.
export interface VoicevoxTtsProviderConfig {
  provider: 'voicevox';
}

export type TtsProviderConfig = LocalTtsProviderConfig | VoicevoxTtsProviderConfig; // union grows as more TTS providers are added

export interface Preferences {
  gunRelays: string[]; // includes the default, user can add/remove
  theme: ThemeMode;
  blockedTags: string[];
  blockedAuthors: string[]; // author pubkeys whose characters are excluded from Browse, this browser only
  hiddenCharacterIds: string[]; // other users' characters hidden locally, not deleted
  hiddenCommentIds: string[]; // comments hidden locally, this browser only — never a network action
  personaSelections: Record<string, string>; // characterId -> personaId, remembers the last mask used per character
  provider: ProviderConfig; // the currently active provider's config
  providerConfigs: ProviderConfigMap; // last-saved config per provider
  defaultBackground: string; // applied to newly-created chats when non-empty
  chatOpacity: number; // 0-100, applied to message bubbles and composer over the chat background
  showNsfw: boolean; // include NSFW characters in Browse results, other than your own
  whisperConsentGiven: boolean; // user agreed to download the local speech-to-text model
  whisperModelSize: 'tiny' | 'base'; // which Whisper model size to use for mic transcription
  micSilenceTimeoutMs: number | null; // auto-stop recording after this much silence; null disables auto-stop entirely
  // Provider/voice/pitch selection is per-chat, not global — see Chat.tts_*
  // in chat.ts. Only device-level model consent and the VOICEVOX server
  // address (shared across every chat using it) stay here.
  ttsConsentGiven: boolean; // user agreed to download the local text-to-speech model
  voicevoxBaseUrl: string; // e.g. "http://localhost:50021", the default VOICEVOX Engine port
  autoReadAloud: boolean; // automatically play read-aloud for a new character reply, for chats where it's enabled
}
