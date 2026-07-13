/** Sensible default relay(s), overridable via Preferences (see spec: "Configurable
 *  Nostr relay instances"). Also used as the bootstrap set for resolving
 *  anyone's NIP-65 relay list in the first place — you need at least one
 *  relay to discover where to look for someone's own declared relays. Kept
 *  separate from pool.ts/preferences.svelte.ts so neither module has to
 *  import the other just to reach this constant. */
export const DEFAULT_NOSTR_RELAYS: string[] = [
	'wss://relay.damus.io',
	'wss://nos.lol',
	'wss://relay.nostr.band'
];
