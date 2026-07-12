import { browser } from '$app/environment';
import type { Character, CharacterId } from '$lib/types';
import {
	addPublishedCharacterId,
	loadMyCharacterEntries,
	removeMyCharacterEntry,
	saveLocalOnlyCharacter
} from '$lib/db/characters';
import { gunPeerReady } from '$lib/gun/client';
import { confirmDialog } from '$lib/state/confirmDialog.svelte';
import { m } from '$lib/paraglide/messages.js';
import { getKeyring, initAuth } from '$lib/state/auth.svelte';
import {
	createLocalCharacter as gunCreateLocalCharacter,
	deleteCharacter as gunDeleteCharacter,
	editLocalCharacter as gunEditLocalCharacter,
	forkCharacter as gunForkCharacter,
	getCharacter,
	publishCharacter as gunPublishCharacter,
	publishLocalCharacter as gunPublishLocalCharacter,
	undeleteCharacter as gunUndeleteCharacter
} from '$lib/gun/characters';
import { embedTavernCardInPng, parseTavernCardJson, parseTavernCardPng } from '$lib/import/characterCard';

type CharacterFormFields = Parameters<typeof gunPublishCharacter>[0];

let myCharacters = $state<Character[]>([]);
let publishedMap = $state<Record<CharacterId, boolean>>({});
let ready = $state(false);
let initPromise: Promise<void> | null = null;

/** refresh() has several independent call sites (startup resync, every
 *  publish/delete/fork/import) that can overlap — e.g. a slow startup
 *  `resyncMissing` resync racing a bulk backup restore's own per-item
 *  refreshes. Without this, whichever call happens to *finish* last wins,
 *  even if it started from an older loadMyCharacterEntries() snapshot —
 *  silently reverting characters a later call already got right (see the
 *  "just-imported characters show as published" bug this was written for).
 *  Each call stamps its own start order and only applies its result if
 *  nothing newer has started since. */
let refreshCallSeq = 0;

export function getMyCharacters(): Character[] {
	return myCharacters;
}

/** Whether `id` is in this browser's own local characters index — true even
 *  when its `author` field belongs to a different identity (e.g. a full
 *  backup restored after switching/creating accounts, see restoreCharacter).
 *  Use this instead of an author-pubkey check to decide whether a character
 *  is already accounted for locally, so it isn't also offered as a "save a
 *  copy" candidate via savedCharacters. */
export function isCharacterInMyCharacters(id: CharacterId): boolean {
	return myCharacters.some((c) => c.id === id);
}

/** Whether `id` is a local-only (unpublished) character owned by this
 *  browser. Characters not in the local index at all (someone else's,
 *  found via browse/fork) are treated as published — they only exist
 *  because they were read from GUN. */
export function isCharacterLocalOnly(id: CharacterId): boolean {
	return publishedMap[id] === false;
}

export function isCharactersReady(): boolean {
	return ready;
}

/** Backfills fields added after some local-only characters were already
 *  saved to IndexedDB, so old entries don't crash on the newer field being
 *  undefined. */
function normalizeLocalCharacter(character: Character): Character {
	return {
		...character,
		example_dialogues: character.example_dialogues ?? []
	};
}

/** `resyncMissing` handles connecting to a relay that's never seen this
 *  author's data before — e.g. a fresh relay, or a user who switched relays
 *  in Preferences between sessions (see spec: configurable relays). Only
 *  meaningful on the initial load (see initCharacters) — re-publishing on
 *  every refresh() (e.g. right after a normal edit) would just be redundant
 *  network writes for a relay that's reachable and already current. */
async function refresh(options?: { resyncMissing?: boolean }): Promise<void> {
	const callSeq = ++refreshCallSeq;
	const resyncMissing = options?.resyncMissing ?? false;
	if (resyncMissing) await gunPeerReady();
	const keyring = getKeyring();
	const entries = await loadMyCharacterEntries();
	const resolved = await Promise.all(
		entries.map(async (entry) => {
			if (!entry.published) {
				if (!entry.character) return null;
				const character = normalizeLocalCharacter(entry.character);
				// A local-only entry can be wrong — e.g. a character imported from a
				// backup that raced GUN's connection during the network check (see
				// restoreCharacter) can get filed as local-only even though it's
				// really already published. Only worth checking on startup resync;
				// a normal local-only draft has no reason to suddenly appear on the
				// network between one refresh() and the next.
				if (resyncMissing && keyring && character.author === keyring.publicKey) {
					const onNetwork = await getCharacter(entry.id);
					if (onNetwork.ok) {
						await addPublishedCharacterId(entry.id, onNetwork.doc);
						return { character: onNetwork.doc, published: true };
					}
				}
				return { character, published: false };
			}
			const result = await getCharacter(entry.id);
			if (result.ok) {
				// Keep the local cache in sync with whatever GUN just returned, so
				// it stays a good fallback for the next time GUN isn't reachable.
				await addPublishedCharacterId(entry.id, result.doc);
				return { character: result.doc, published: true };
			}
			// Not found on this relay. If we're doing a startup resync and this
			// is our own cached, already-signed copy, the connected relay simply
			// never got this document (new relay / relay switch) — republish the
			// exact signed snapshot as-is rather than dropping it. Otherwise (no
			// cache, or not our own character) this is just an unreachable relay
			// or someone else's doc — fall back to the cache without writing.
			if (resyncMissing && entry.character && keyring && entry.character.author === keyring.publicKey) {
				try {
					const republished = await gunPublishLocalCharacter(normalizeLocalCharacter(entry.character));
					await addPublishedCharacterId(entry.id, republished);
					return { character: republished, published: true };
				} catch {
					// Relay write failed (e.g. still not connected) — fall through to
					// the cached-copy fallback below instead of losing the character.
				}
			}
			return entry.character
				? { character: normalizeLocalCharacter(entry.character), published: true }
				: null;
		})
	);

	// A newer refresh() call has started (and, since these are always awaited
	// by their caller before that caller proceeds, quite possibly already
	// finished and applied its own — more current — results) — applying this
	// older call's results now would clobber them with stale data.
	if (callSeq !== refreshCallSeq) return;

	const valid = resolved.filter((r): r is { character: Character; published: boolean } => r !== null);
	myCharacters = valid.map((r) => r.character);
	publishedMap = Object.fromEntries(valid.map((r) => [r.character.id, r.published]));
}

/** Test-only escape hatch: runs the same load/resync logic initCharacters()
 *  gates behind its once-per-page initPromise, without needing a fresh
 *  module instance per test. */
export function __refreshCharactersForTests(options?: { resyncMissing?: boolean }): Promise<void> {
	return refresh(options);
}

export function initCharacters(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			// initAuth() is called alongside initCharacters() in +layout.svelte,
			// not awaited before it — wait here so getKeyring() inside refresh()
			// is actually populated for the author-ownership check.
			await initAuth();
			await refresh({ resyncMissing: true });
			ready = true;
		})();
	}
	return initPromise;
}

/** Creates or edits a character. `localOnly` controls whether a *new*
 *  character (or a still-unpublished one) is published to GUN or kept
 *  purely in this browser's local storage. Editing a character that's
 *  already published always stays published — publish is one-way except
 *  via the explicit "keep local" choice at creation time. */
export async function createOrEditCharacter(
	fields: CharacterFormFields,
	options?: { localOnly?: boolean }
): Promise<Character> {
	const localOnly = options?.localOnly ?? false;

	if (!fields.id) {
		if (localOnly) {
			const doc = await gunCreateLocalCharacter(fields);
			await saveLocalOnlyCharacter(doc);
			await refresh();
			return doc;
		}
		const doc = await gunPublishCharacter(fields);
		await addPublishedCharacterId(doc.id, doc);
		await refresh();
		return doc;
	}

	if (isCharacterLocalOnly(fields.id)) {
		// myCharacters is a $state array, so its elements are reactive proxies —
		// de-proxy before this escapes into GUN/IndexedDB writes, both of which
		// use structured cloning under the hood and throw on a live Proxy (see
		// publishMyCharacter/restoreMyCharacter below for the same fix).
		const existing = myCharacters.find((c) => c.id === fields.id);
		if (!existing) throw new Error('Character not found.');
		const edited = await gunEditLocalCharacter($state.snapshot(existing), fields);
		if (localOnly) {
			await saveLocalOnlyCharacter(edited);
			await refresh();
			return edited;
		}
		const published = await gunPublishLocalCharacter(edited);
		await addPublishedCharacterId(published.id, published);
		await refresh();
		return published;
	}

	const doc = await gunPublishCharacter(fields);
	await addPublishedCharacterId(doc.id, doc);
	await refresh();
	return doc;
}

export async function publishMyCharacter(id: CharacterId): Promise<Character> {
	// De-proxy: myCharacters is a $state array, and writeToGun/addPublishedCharacterId
	// both eventually hit a structured-clone boundary (GUN's put, idb-keyval's
	// IndexedDB set) that throws "Proxy object could not be cloned" on a live
	// Svelte reactive proxy — e.g. publishing a freshly-forked character.
	const existing = myCharacters.find((c) => c.id === id);
	if (!existing) throw new Error('Character not found.');
	const doc = await gunPublishLocalCharacter($state.snapshot(existing));
	await addPublishedCharacterId(doc.id, doc);
	await refresh();
	return doc;
}

/** Deletes a character. A local-only (never-published) character just drops
 *  out of the local index — there's nothing on the network to touch.
 *
 *  A published character always gets tombstoned on GUN (peers who already
 *  synced it can't be forced to erase their copy either way — see
 *  gun/characters.ts:deleteCharacter). `removeLocal` controls whether the
 *  local "My Characters" entry is dropped too:
 *  - false (remote-only): the entry stays (now pointing at the tombstoned
 *    doc, see restoreMyCharacter) — a one-click Restore later reuses the
 *    same id and un-deletes it, preserving its comment history instead of
 *    starting over under a new id.
 *  - true (both): the entry is removed as well, same as deleting a
 *    local-only character — nothing left to restore from on this device. */
export async function deleteMyCharacter(id: CharacterId, options?: { removeLocal?: boolean }): Promise<void> {
	if (isCharacterLocalOnly(id)) {
		await removeMyCharacterEntry(id);
	} else {
		await gunDeleteCharacter(id);
		if (options?.removeLocal) await removeMyCharacterEntry(id);
	}
	await refresh();
}

/** Reverses a "delete remote only" — a fresh signed version of the locally-
 *  cached (tombstoned) copy with `deleted: false`, under the same id/version
 *  chain (see gun/characters.ts:undeleteCharacter), so the id and every
 *  comment already posted on it come back untouched. */
export async function restoreMyCharacter(id: CharacterId): Promise<Character> {
	// See publishMyCharacter above — de-proxy before this hits a
	// structured-clone boundary.
	const existing = myCharacters.find((c) => c.id === id);
	if (!existing) throw new Error('Character not found.');
	const doc = await gunUndeleteCharacter($state.snapshot(existing));
	await addPublishedCharacterId(doc.id, doc);
	await refresh();
	return doc;
}

/** Forks `id` into a new local-only character owned by the current user
 *  (see gun/characters.ts forkCharacter) — kept unpublished until the user
 *  edits and explicitly publishes it. */
export async function forkCharacter(id: CharacterId): Promise<Character> {
	const doc = await gunForkCharacter(id);
	await saveLocalOnlyCharacter(doc);
	await refresh();
	return doc;
}

/** Restores a character from a full data backup, preserving its original id
 *  (unlike importCharacterDraft, which is for importing someone else's shared
 *  character and deliberately mints a new id). Used by dataExport.ts's bulk
 *  "characters" category import, so re-restoring the same backup merges
 *  instead of piling up duplicate copies every time.
 *
 *  - Already published under this id → GUN is authoritative, skipped.
 *  - Not tracked locally, but published on the network → just linked into the
 *    local index, network content wins.
 *  - Not tracked locally at all → added as a new local-only character.
 *  - Tracked locally as a local-only draft → the higher `version` wins; on a
 *    tie with differing content, the user is asked which to keep. */
export async function restoreCharacter(character: Character): Promise<'added' | 'updated' | 'skipped'> {
	const entries = await loadMyCharacterEntries();
	const existingEntry = entries.find((e) => e.id === character.id);

	if (existingEntry?.published) return 'skipped';

	const existing = existingEntry?.character;
	if (!existing) {
		// A fresh import runs before GUN has necessarily connected — without
		// waiting here, this network check can race the connection and lose,
		// wrongly filing an already-published character as local-only (see
		// refresh()'s resyncMissing, which waits for the same reason).
		await gunPeerReady();
		const onNetwork = await getCharacter(character.id);
		if (onNetwork.ok) {
			await addPublishedCharacterId(character.id, onNetwork.doc);
			await refresh();
			return 'added';
		}
		await saveLocalOnlyCharacter(character);
		await refresh();
		return 'added';
	}

	if (character.version < existing.version) return 'skipped';
	if (character.version === existing.version && JSON.stringify(character) === JSON.stringify(existing)) {
		return 'skipped';
	}
	if (character.version === existing.version) {
		const preferImported = await confirmDialog({
			title: m.import_conflict_title(),
			message: m.characters_restore_conflict_message({ name: existing.name }),
			confirmLabel: m.import_conflict_replace()
		});
		if (!preferImported) return 'skipped';
	}

	await saveLocalOnlyCharacter(character);
	await refresh();
	return 'updated';
}

/** Serializes a character for the "Export" action — plain JSON so it round-trips
 *  through importCharacterDraft (see below). */
export function exportCharacter(character: Character): string {
	return JSON.stringify(character, null, 2);
}

/** Builds a TavernAI/SillyTavern-compatible character-card PNG for `character`
 *  — a small, self-contained image third-party sites/apps already know how
 *  to read (see import/characterCard.ts). Uses the character's first image
 *  as the card's picture when it's reachable, falling back to a blank square
 *  otherwise; either way the result is re-encoded through <canvas> so the
 *  embedded `tEXt` chunk is always written into real, well-formed PNG bytes
 *  regardless of the source image's original format. The card spec has no
 *  required dimensions, so the source image's own aspect ratio is kept as-is
 *  — stretching it to a fixed square would visibly distort anything that
 *  isn't already 1:1. */
export async function exportCharacterAsPng(character: Character): Promise<Blob> {
	const sourceUrl = character.image_urls[0];
	const image = sourceUrl ? await loadImage(sourceUrl).catch(() => null) : null;

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable.');

	if (image) {
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		ctx.drawImage(image, 0, 0);
	} else {
		canvas.width = 512;
		canvas.height = 512;
		ctx.fillStyle = '#1f2937';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('Failed to encode PNG.');
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const withCard = embedTavernCardInPng(bytes, character);
	return new Blob([withCard.slice().buffer], { type: 'image/png' });
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
		img.src = url;
	});
}

/** Parses a raw TavernAI/SillyTavern character-card JSON blob (the "V1" flat
 *  shape, or the wrapped "V2" `chara_card_v2` spec) into a fresh draft — same
 *  "always creates a new character" contract as importCharacterDraft, since
 *  a third-party card has no id in our system to collide with. No embedded
 *  image support here (see the PNG variant below) — images stay externally
 *  hosted only, per the "no upload" rule the character form enforces. */
export function importCharacterCardJson(json: string): CharacterFormFields {
	return { ...parseTavernCardJson(json), image_urls: [] };
}

/** Same as importCharacterCardJson, but for a card embedded in a PNG image
 *  (the common TavernAI/SillyTavern distribution format — see
 *  import/characterCard.ts). */
export function importCharacterCardPng(bytes: Uint8Array): CharacterFormFields {
	return { ...parseTavernCardPng(bytes), image_urls: [] };
}

/** Parses a previously-exported character JSON into a fresh draft — strips
 *  id/version/signature/timestamps/forked_from so importing always creates a
 *  brand new character rather than colliding with the source. */
export function importCharacterDraft(json: string): CharacterFormFields {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not valid JSON.');
	}
	if (typeof parsed !== 'object' || parsed === null || typeof (parsed as Character).name !== 'string') {
		throw new Error('Not a valid character export.');
	}
	const source = parsed as Character;
	return {
		name: source.name,
		image_urls: Array.isArray(source.image_urls) ? source.image_urls : [],
		description: source.description ?? '',
		personality: source.personality ?? '',
		scenario: source.scenario ?? '',
		tags: source.tags ?? [],
		nsfw: source.nsfw ?? false,
		language: source.language ?? '',
		system_prompt: source.system_prompt ?? '',
		first_message: source.first_message ?? '',
		alternate_greetings: source.alternate_greetings ?? [],
		example_dialogues: source.example_dialogues ?? [],
		comments_enabled: source.comments_enabled ?? true
	};
}
