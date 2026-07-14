import type { EventTemplate } from 'nostr-tools';
import type { Keyring, PubKey } from '$lib/types';
import { publishEvent, queryEvents } from './event';
import { CONTACTS_KIND } from './kinds';
import { readRelaysFor, writeRelaysFor } from './relayList';

/** NIP-02 contact list: a single replaceable kind-3 event per author whose
 *  `p` tags are the full set of pubkeys they follow. Unlike NIP-25
 *  reactions/likes (one event per target), following is "one event, whole
 *  list" — every follow/unfollow republishes the entire list. */

function eventToContacts(tags: string[][]): PubKey[] {
	return tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]);
}

/** Resolves `pubkey`'s own published follow list, querying their outbox
 *  relays (see relayList.ts) same as any other author-scoped lookup. Returns
 *  an empty list if they've never published one. */
export async function getContactList(pubkey: PubKey): Promise<PubKey[]> {
	const relays = await readRelaysFor(pubkey);
	const events = await queryEvents({ kinds: [CONTACTS_KIND], authors: [pubkey] }, relays);
	if (events.length === 0) return [];
	const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
	return eventToContacts(latest.tags);
}

/** Publishes `keyring`'s full follow list, replacing whatever kind-3 event
 *  they'd previously published (NIP-02/NIP-01 replaceable-event semantics —
 *  there's no "append a p tag", only "republish the whole list"). */
async function publishContactList(pubkeys: PubKey[], keyring: Keyring): Promise<void> {
	const template: EventTemplate = {
		kind: CONTACTS_KIND,
		tags: pubkeys.map((pub) => ['p', pub]),
		content: '',
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	await publishEvent(template, keyring, relays);
}

/** Adds `target` to `keyring`'s own follow list and republishes it in full.
 *  Re-fetches the current list first so a follow from a second device/tab
 *  doesn't get clobbered by a stale local copy. */
export async function followAuthor(target: PubKey, keyring: Keyring): Promise<void> {
	const current = await getContactList(keyring.publicKey);
	if (current.includes(target)) return;
	await publishContactList([...current, target], keyring);
}

export async function unfollowAuthor(target: PubKey, keyring: Keyring): Promise<void> {
	const current = await getContactList(keyring.publicKey);
	if (!current.includes(target)) return;
	await publishContactList(
		current.filter((pub) => pub !== target),
		keyring
	);
}
