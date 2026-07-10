import { cookieName, setLocale, type Locale } from '$lib/paraglide/runtime';

// Locales with real translations filled in. "ja" exists in the paraglide
// project config so the plumbing (routing, locale switcher) is ready, but
// messages/ja.json isn't translated yet, and paraglide's compiled dispatcher
// throws if a locale is missing a message key. Add a locale here only once
// its messages/<locale>.json is fully translated.
export const AVAILABLE_LOCALES: Locale[] = ['en'];

// Each language's own name, in that language — conventionally not translated.
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	ja: '日本語'
};

/** Picks the best available locale for the browser's language preferences,
 *  falling back to English if none of them are available yet. */
export function detectPreferredLocale(acceptLanguages: readonly string[]): Locale {
	for (const lang of acceptLanguages) {
		const base = lang.split('-')[0] as Locale;
		if (AVAILABLE_LOCALES.includes(base)) return base;
	}
	return 'en';
}

/** Applies the browser's preferred language on a user's very first visit
 *  (before they've made an explicit choice via the language selector, i.e.
 *  before the paraglide locale cookie exists). No-ops after that so a
 *  returning user's manual choice is never overridden. */
export function applyBrowserLocaleOnFirstVisit(): void {
	if (typeof document === 'undefined' || typeof navigator === 'undefined') return;
	const hasCookie = document.cookie.split('; ').some((c) => c.startsWith(`${cookieName}=`));
	if (hasCookie) return;
	const locale = detectPreferredLocale(navigator.languages ?? [navigator.language]);
	setLocale(locale, { reload: false });
}
