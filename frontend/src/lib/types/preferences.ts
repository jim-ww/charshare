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

export type ProviderConfig =
  | OpenRouterProviderConfig
  | OllamaProviderConfig
  | HuggingFaceProviderConfig; // union grows as more providers are added

// Per-provider saved settings, so switching providers doesn't clobber the other's config.
export type ProviderConfigMap = {
  [P in ProviderConfig['provider']]: Extract<ProviderConfig, { provider: P }>;
};

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
}
