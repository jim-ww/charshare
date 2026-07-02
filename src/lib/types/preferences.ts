export type ThemeMode = 'dark' | 'light';

export interface ProviderConfig {
  provider: 'openrouter'; // union grows as more providers are added
  apiKey: string; // stored locally only, never published
  temperature: number;
  max_tokens: number;
  context_size: number;
  top_k: number;
  top_p: number;
  repetition_penalty: number;
  frequency_penalty: number;
  forbidden_words: string[];
}

export interface Preferences {
  gunRelays: string[]; // includes the default, user can add/remove
  theme: ThemeMode;
  blockedTags: string[];
  provider: ProviderConfig;
}
