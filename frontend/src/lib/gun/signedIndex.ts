import type { CharacterId, Keyring, PubKey } from '$lib/types';
import { signDocument, verifyDocument } from '$lib/crypto/sign';
import { getGun, gunPath, gunPeerReady, type GunNode } from './client';
import { putDocument, type Validator } from './document';
import { parseCharacterId } from './characterId';

/** A general-purpose "which characters are indexed under this key" structure,
 *  shared by tags.ts (key = tag) and names.ts (key = name token). An entry is
 *  its own small signed document rather than a shared JSON-blob array (the
 *  old scheme — see git history): each pointer lives at its own GUN key
 *  (`.../{charId}`), so two authors indexing under the same key write to
 *  different graph keys and can never clobber each other's pointer — no
 *  read-modify-write race, no lost writes. A pointer is locally verifiable
 *  without fetching the character itself: its signature must be valid for
 *  `authorPub`, and `authorPub` must match the author encoded in `charId`
 *  (see characterId.ts), so nobody can mint a pointer for a character id
 *  they don't own. */
interface IndexPointer {
	key: string;
	charId: CharacterId;
	authorPub: PubKey;
	signature: string;
}

const isIndexPointer: Validator<IndexPointer> = (data): data is IndexPointer => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.key === 'string' &&
		typeof d.charId === 'string' &&
		typeof d.authorPub === 'string' &&
		typeof d.signature === 'string'
	);
};

function pointerKey(charId: CharacterId): string {
	return encodeURIComponent(charId);
}

function monthBucket(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** New pointers always land in the current calendar month's bucket, and reads
 *  only scan the most recent READ_MONTHS buckets — bounding read cost for a
 *  very popular key instead of an ever-growing single index/blob. A character
 *  published long enough ago simply stops surfacing once its bucket ages out;
 *  acceptable since browse/search are discovery, not an archive (see spec:
 *  Browse). */
const READ_MONTHS = 24;

function recentBuckets(): string[] {
	const now = new Date();
	const buckets: string[] = [];
	for (let i = 0; i < READ_MONTHS; i++) {
		buckets.push(monthBucket(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
	}
	return buckets;
}

/** Parses, schema-validates, and signature-verifies a raw pointer envelope
 *  read off a bucket node, additionally checking that its GUN key (the
 *  encoded charId it was stored under) matches the charId inside the
 *  document and that the claimed author actually matches the author encoded
 *  in that charId. Returns the verified charId, or null if anything fails —
 *  invalid or forged pointers are silently dropped, never partially trusted. */
async function verifyPointer(raw: unknown, keyCharId: CharacterId): Promise<CharacterId | null> {
	const envelope = raw as { json?: string } | null | undefined;
	if (!envelope || typeof envelope.json !== 'string') return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(envelope.json);
	} catch {
		return null;
	}
	if (!isIndexPointer(parsed) || parsed.charId !== keyCharId) return null;
	let author: PubKey;
	try {
		author = parseCharacterId(parsed.charId).author;
	} catch {
		return null;
	}
	if (author !== parsed.authorPub) return null;
	const verified = await verifyDocument(parsed, parsed.authorPub);
	return verified ? parsed.charId : null;
}

/** GUN gives no explicit "done enumerating" signal for `.map().once()` — same
 *  underlying unreliability as a single node's put-ack (see document.ts) — so
 *  this resolves once no new child has shown up within the timeout window. */
const ENUMERATE_TIMEOUT_MS = 1000;

export interface SignedPointerIndex {
	/** Fetches the (deduped) set of character ids pointed at `key` across the
	 *  recent-months read window. */
	getIndex(key: string): Promise<CharacterId[]>;
	/** Adds a signed pointer for `charId` under `key`, in the current month's
	 *  bucket. Idempotent in effect (re-adding writes the same key), and safe
	 *  under concurrent publishers indexing under the same key since each
	 *  pointer has its own graph key — no read-modify-write, no clobbering. */
	addToIndex(key: string, charId: CharacterId, keyring: Keyring): Promise<void>;
}

/** Builds a signed pointer index namespaced under `tags/{namespace}/{key}/{bucket}`. */
export function createSignedPointerIndex(namespace: string): SignedPointerIndex {
	function bucketNode(key: string, bucket: string): GunNode {
		return gunPath(getGun(), `${namespace}/${encodeURIComponent(key)}/${bucket}`);
	}

	function readBucket(key: string, bucket: string): Promise<CharacterId[]> {
		return new Promise((resolve) => {
			const pending: Promise<CharacterId | null>[] = [];
			let settled = false;

			function finish() {
				if (settled) return;
				settled = true;
				Promise.all(pending).then((results) => {
					resolve(results.filter((id): id is CharacterId => id !== null));
				});
			}

			// Give a cold-started client's WebSocket handshake a moment to finish
			// before starting the fixed enumeration window below — otherwise the
			// very first read after page load can settle with zero peers ever
			// having been asked, and come back looking like an empty network.
			gunPeerReady().then(() => {
				if (settled) return;
				setTimeout(finish, ENUMERATE_TIMEOUT_MS);
				bucketNode(key, bucket)
					.map()
					.once((data: unknown, childKey: string) => {
						if (settled) return;
						pending.push(verifyPointer(data, decodeURIComponent(childKey)));
					});
			});
		});
	}

	async function getIndex(key: string): Promise<CharacterId[]> {
		const perBucket = await Promise.all(recentBuckets().map((bucket) => readBucket(key, bucket)));
		return Array.from(new Set(perBucket.flat()));
	}

	async function addToIndex(key: string, charId: CharacterId, keyring: Keyring): Promise<void> {
		const draft: IndexPointer = { key, charId, authorPub: keyring.publicKey, signature: '' };
		draft.signature = await signDocument(draft, keyring);
		const node = bucketNode(key, monthBucket(new Date())).get(pointerKey(charId));
		await putDocument(node, draft);
	}

	return { getIndex, addToIndex };
}
