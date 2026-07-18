import { applyBrowserLocaleOnFirstVisit } from '$lib/i18n';
import { initPreferences } from '$lib/state/preferences.svelte';
import * as encryption from '$lib/crypto/dataEncryption';
import { isWailsDesktop, secretServiceGet } from '$lib/wails';

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
//
// If local-data encryption is enabled, every idb-keyval read (including
// preferences itself, see crypto/dataEncryption.ts) needs the passphrase
// first. The desktop build tries the OS credential store silently before
// falling back to prompting; a `locked: true` result tells +layout.svelte
// to render UnlockGate instead of the app until the user unlocks it (which
// then calls initPreferences() itself once encryption.unlock() succeeds).
export async function load() {
	if (await encryption.isEncryptionEnabled()) {
		if (isWailsDesktop()) {
			try {
				const saved = await secretServiceGet();
				if (saved) await encryption.unlock(saved);
			} catch {
				// Fall through to the manual unlock prompt below.
			}
		}
		if (!encryption.isUnlocked()) {
			return { locked: true };
		}
	}
	await initPreferences();
	return { locked: false };
}
