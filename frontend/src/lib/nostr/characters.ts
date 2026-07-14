import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Character, CharacterDraft, CharacterId, Keyring, PubKey, Verified } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents, subscribeEvents, subscribeEventsWithRetry } from './event';
import { signEvent } from './sign';
import { CHARACTER_KIND } from './kinds';
import { makeCharacterId, parseCharacterId, characterCoordinate, parseCharacterCoordinate } from './characterId';
import { tokenizeName } from './nameTokens';
import { readRelaysFor, writeRelaysFor } from './relayList';

/** Fields kept in the event's JSON `content` body — nothing here needs
 *  relay-side filtering today (see plan: tag schema). Everything else
 *  (identity, name, genre tags, nsfw, fork provenance, original creation
 *  time) is promoted to a tag instead. */
interface CharacterContent {
	name: string;
	description: string;
	personality: string;
	scenario: string;
	system_prompt: string;
	first_message: string;
	alternate_greetings: string[];
	example_dialogues: string[];
	image_urls: string[];
	comments_enabled: boolean;
	slideshow_enabled?: boolean; // optional: absent on events published before this field existed
	version: number;
	language: string;
	deleted: boolean;
	deleted_at: number | null;
}

function isCharacterContent(data: unknown): data is CharacterContent {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.name === 'string' &&
		typeof d.description === 'string' &&
		typeof d.personality === 'string' &&
		typeof d.scenario === 'string' &&
		typeof d.system_prompt === 'string' &&
		typeof d.first_message === 'string' &&
		Array.isArray(d.alternate_greetings) &&
		d.alternate_greetings.every((g) => typeof g === 'string') &&
		Array.isArray(d.example_dialogues) &&
		d.example_dialogues.every((g) => typeof g === 'string') &&
		Array.isArray(d.image_urls) &&
		d.image_urls.every((u) => typeof u === 'string') &&
		typeof d.comments_enabled === 'boolean' &&
		(d.slideshow_enabled === undefined || typeof d.slideshow_enabled === 'boolean') &&
		typeof d.version === 'number' &&
		typeof d.language === 'string' &&
		typeof d.deleted === 'boolean' &&
		(d.deleted_at === null || typeof d.deleted_at === 'number')
	);
}

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

function tagValues(tags: string[][], name: string): string[] {
	return tags.filter((t) => t[0] === name).map((t) => t[1]);
}

/** Builds the unsigned event template for `doc` (see plan: tag schema per
 *  kind). `doc.created_at` is the character's true original creation time
 *  (preserved across edits, unlike the event's own `created_at` — a NIP-33
 *  relay only retains the latest revision's timestamp, so the original must
 *  be carried forward explicitly as the `published_at` tag). */
function characterToTemplate(doc: Omit<Character, 'author' | 'updated_at'>): EventTemplate {
	const { uuid } = parseCharacterId(doc.id);
	const tags: string[][] = [
		['d', uuid],
		// One `n` tag per name word-token (not the raw name itself) — an
		// exact-match search/dedup hint, not the display name, which lives in
		// `content.name` since tokens are lowercased/punctuation-stripped and
		// can't be losslessly reversed back into the original string.
		...tokenizeName(doc.name).map((token) => ['n', token]),
		...doc.tags.map((t) => ['t', t]),
		['published_at', String(Math.floor(doc.created_at / 1000))]
	];
	if (doc.nsfw) tags.push(['content-warning', 'nsfw']);
	if (doc.forked_from) tags.push(['a', characterCoordinate(doc.forked_from)]);

	const content: CharacterContent = {
		name: doc.name,
		description: doc.description,
		personality: doc.personality,
		scenario: doc.scenario,
		system_prompt: doc.system_prompt,
		first_message: doc.first_message,
		alternate_greetings: doc.alternate_greetings,
		example_dialogues: doc.example_dialogues,
		image_urls: doc.image_urls,
		comments_enabled: doc.comments_enabled,
		slideshow_enabled: doc.slideshow_enabled,
		version: doc.version,
		language: doc.language,
		deleted: doc.deleted,
		deleted_at: doc.deleted_at
	};

	return {
		kind: CHARACTER_KIND,
		tags,
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000)
	};
}

/** Parses a raw relay event back into the app-facing `Character` shape.
 *  Returns null (never partially trusted) if required tags/content are
 *  missing or malformed. Exported for browse.ts, which fetches character
 *  events directly off a kind/time-range filter rather than resolving ids
 *  one at a time (no separate index-then-resolve step needed anymore). */
export function eventToCharacter(event: NostrEvent): Character | null {
	const uuid = tagValue(event.tags, 'd');
	const publishedAt = tagValue(event.tags, 'published_at');
	if (!uuid || !publishedAt) return null;

	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isCharacterContent(content)) return null;

	const forkTag = tagValue(event.tags, 'a');

	return {
		id: `${event.pubkey}:${uuid}`,
		author: event.pubkey,
		tags: tagValues(event.tags, 't'),
		nsfw: event.tags.some((t) => t[0] === 'content-warning'),
		forked_from: forkTag ? parseCharacterCoordinate(forkTag) : null,
		created_at: Number(publishedAt) * 1000,
		updated_at: event.created_at * 1000,
		...content,
		slideshow_enabled: content.slideshow_enabled ?? false
	};
}

function toVerified(event: NostrEvent): Verified<Character> {
	const character = eventToCharacter(event);
	return character ? { ok: true, doc: character } : { ok: false, reason: 'invalid_schema' };
}

/** Signs (but does not publish) a full Character snapshot — used both right
 *  before publishing and for local-only drafts that never touch a relay.
 *  Round-trips through the same template/parse functions a relay would use,
 *  so a local-only character has byte-identical shape to a published one. */
function sign(draft: Omit<Character, 'author' | 'updated_at'>, keyring: Keyring): Character {
	const event = signEvent(characterToTemplate(draft), keyring);
	const parsed = eventToCharacter(event);
	if (!parsed) throw new Error('Failed to sign character.');
	return parsed;
}

async function signAndPublish(draft: Omit<Character, 'author' | 'updated_at'>, keyring: Keyring): Promise<Character> {
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(characterToTemplate(draft), keyring, relays);
	const parsed = eventToCharacter(event);
	if (!parsed) throw new Error('Failed to publish character.');
	return parsed;
}

/** Promotes an already-signed local-only character to the network as-is. */
export async function publishLocalCharacter(character: Character): Promise<Character> {
	requireAccount();
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(characterToTemplate(character), keyring, relays);
	const parsed = eventToCharacter(event);
	if (!parsed) throw new Error('Failed to publish character.');
	return parsed;
}

export async function getCharacter(id: CharacterId): Promise<Verified<Character>> {
	const { author, uuid } = parseCharacterId(id);
	const relays = await readRelaysFor(author);
	const events = await queryEvents({ kinds: [CHARACTER_KIND], authors: [author], '#d': [uuid] }, relays);
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
	return toVerified(latest);
}

/** Lists every character id authored by `author` — ids only, unverified
 *  content beyond the signature check `queryEvents` already does. Used by
 *  browseByAuthor for a targeted per-author lookup. */
export async function listCharacterIdsByAuthor(author: PubKey): Promise<CharacterId[]> {
	const relays = await readRelaysFor(author);
	const events = await queryEvents({ kinds: [CHARACTER_KIND], authors: [author] }, relays);
	const uuids = new Set<string>();
	for (const event of events) {
		const uuid = tagValue(event.tags, 'd');
		if (uuid) uuids.add(uuid);
	}
	return Array.from(uuids).map((uuid) => `${author}:${uuid}`);
}

/** Subscribes to `id`'s events, resolving the author's NIP-65 outbox relays
 *  first (see relayList.ts) — deferred to the retry path in practice via
 *  subscribeCharacterWithRetry, keeping the common case (already reachable
 *  on the app's default relays) fast. Since relay resolution is async but
 *  this returns an unsubscribe function synchronously, an unsubscribe called
 *  before resolution finishes is honored by cancelling before the real
 *  subscription ever starts. */
export function subscribeCharacter(id: CharacterId, onUpdate: (result: Verified<Character>) => void): () => void {
	const { author, uuid } = parseCharacterId(id);
	let unsubscribe: (() => void) | null = null;
	let cancelled = false;
	void readRelaysFor(author).then((relays) => {
		if (cancelled) return;
		unsubscribe = subscribeEvents({ kinds: [CHARACTER_KIND], authors: [author], '#d': [uuid] }, relays, (event) =>
			onUpdate(toVerified(event))
		);
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Same as subscribeCharacter, but also re-polls with a one-shot query every
 *  couple seconds until `isResolved()` — see event.ts:subscribeEventsWithRetry
 *  for why a bare subscription isn't enough on public relays. */
export function subscribeCharacterWithRetry(
	id: CharacterId,
	onUpdate: (result: Verified<Character>) => void,
	isResolved: () => boolean
): () => void {
	const { author, uuid } = parseCharacterId(id);
	let unsubscribe: (() => void) | null = null;
	let cancelled = false;
	void readRelaysFor(author).then((relays) => {
		if (cancelled) return;
		unsubscribe = subscribeEventsWithRetry(
			{ kinds: [CHARACTER_KIND], authors: [author], '#d': [uuid] },
			relays,
			(event) => onUpdate(toVerified(event)),
			isResolved
		);
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Creates (no `draft.id`) or edits (with `draft.id`) a character. Editing is
 *  publishing a new revision under the same `d` tag with an incremented
 *  `version` (see spec: Character Management). Only the author may edit. */
export async function publishCharacter(draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	if (!draft.id) {
		return signAndPublish(
			{
				...draft,
				id: makeCharacterId(keyring.publicKey),
				version: 1,
				forked_from: null,
				deleted: false,
				deleted_at: null,
				created_at: Date.now()
			},
			keyring
		);
	}

	const existing = await getCharacter(draft.id);
	if (!existing.ok) throw new Error('Character not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can edit this character.');

	return signAndPublish(
		{
			...draft,
			id: existing.doc.id,
			version: existing.doc.version + 1,
			forked_from: existing.doc.forked_from,
			deleted: false,
			deleted_at: null,
			created_at: existing.doc.created_at
		},
		keyring
	);
}

/** Tombstones a character the current user authored — a new revision with
 *  `deleted: true` (relays that don't honor deletion still just see this as
 *  the latest, hidden-by-convention revision), alongside a best-effort
 *  NIP-09 delete request (see plan: deletion semantics). */
export async function deleteCharacter(id: CharacterId): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this character.');

	const published = await signAndPublish(
		{ ...existing.doc, version: existing.doc.version + 1, deleted: true, deleted_at: Date.now() },
		keyring
	);
	await publishDeleteRequest(id, keyring);
	return published;
}

async function publishDeleteRequest(id: CharacterId, keyring: Keyring): Promise<void> {
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{
				kind: 5,
				tags: [['a', characterCoordinate(id)]],
				content: '',
				created_at: Math.floor(Date.now() / 1000)
			},
			keyring,
			relays
		);
	} catch (err) {
		// Best-effort only — relays aren't obligated to honor NIP-09, and the
		// tombstone revision above is what most peers will actually observe.
		console.warn('[nostr] delete request failed (ignored, tombstone revision still published)', err);
	}
}

/** Reverses a "delete remote only" (see deleteCharacter) — a new revision
 *  with `deleted: false` under the same id/version chain, so the character's
 *  id and every comment already posted on it come back untouched. */
export async function undeleteCharacter(existing: Character): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (existing.author !== keyring.publicKey) throw new Error('Only the author can restore this character.');

	return signAndPublish(
		{ ...existing, version: existing.version + 1, deleted: false, deleted_at: null },
		keyring
	);
}

/** Copies `source`'s fields into a new document under a new id, authored and
 *  signed by the current user, with `forked_from` set for provenance (see
 *  spec: Fork). Purely local — no network call — so a character the caller
 *  already has a verified copy of (e.g. a saved character whose author is
 *  currently unreachable) can still be forked. */
export function forkCharacterFromDoc(source: Character): Character {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	const {
		id: _id,
		version: _version,
		author: _author,
		forked_from: _forkedFrom,
		created_at: _createdAt,
		updated_at: _updatedAt,
		deleted: _deleted,
		deleted_at: _deletedAt,
		...fields
	} = source;

	return sign(
		{
			...fields,
			id: makeCharacterId(keyring.publicKey),
			version: 1,
			forked_from: source.id,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
}

/** Fetches `id` from the network, then forks it (see forkCharacterFromDoc).
 *  Prefer forkCharacterFromDoc directly when the caller already has a
 *  verified copy of the character (e.g. from local state) — this network
 *  round-trip is only needed when it doesn't. */
export async function forkCharacter(id: CharacterId): Promise<Character> {
	const existing = await getCharacter(id);
	if (!existing.ok) throw new Error('Character not found.');
	return forkCharacterFromDoc(existing.doc);
}

/** Builds a signed character document without publishing it — used for
 *  local-only creates/edits/forks, which live entirely in this browser's
 *  IndexedDB (see db/characters.ts) until explicitly published. */
export async function createLocalCharacter(draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	if (draft.id) throw new Error('createLocalCharacter is only for brand-new characters.');

	return sign(
		{
			...draft,
			id: makeCharacterId(keyring.publicKey),
			version: 1,
			forked_from: null,
			deleted: false,
			deleted_at: null,
			created_at: Date.now()
		},
		keyring
	);
}

/** Re-signs a new version of a local-only character — no publish, since the
 *  previous version was never published either. */
export async function editLocalCharacter(existing: Character, draft: CharacterDraft): Promise<Character> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');

	return sign(
		{
			...draft,
			id: existing.id,
			version: existing.version + 1,
			forked_from: existing.forked_from,
			deleted: false,
			deleted_at: null,
			created_at: existing.created_at
		},
		keyring
	);
}
