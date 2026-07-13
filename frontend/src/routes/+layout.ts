import { applyBrowserLocaleOnFirstVisit } from '$lib/i18n';
import { initPreferences } from '$lib/state/preferences.svelte';

export const ssr = false;
export const prerender = true;

// Runs once, at module load, before any component renders — so the very
// first paint already reflects the detected locale instead of flashing
// English then switching.
applyBrowserLocaleOnFirstVisit();

// Blocks rendering of the whole route tree (including every child
// component's own onMount/$effect) until the user's saved preferences —
// most importantly their configured Nostr relays (see
// state/preferences.svelte.ts:getActiveRelays) — have loaded from
// IndexedDB. Without this, a component that queries a relay from its own
// onMount/$effect could run before preferences finish loading (Svelte
// mounts child components before their parent's onMount fires, so
// sequencing only in +layout.svelte's onMount isn't enough) and briefly
// fall back to the built-in default relays instead of the ones the user
// actually configured.
export async function load() {
	await initPreferences();
	return {};
}
