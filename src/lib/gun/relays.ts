/** Sensible default relay(s), overridable via Preferences (see spec: "Configurable
 *  GUN relay instances"). Kept separate from client.ts/preferences.svelte.ts so
 *  neither module has to import the other just to reach this constant. */
export const DEFAULT_GUN_RELAYS: string[] = [
	"https://gun.o8.is/gun",
	"https://gun-manhattan.herokuapp.com/gun",
];
