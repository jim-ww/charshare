import type { Keyring, PubKey } from '$lib/types';
import { signDocument, verifyDocument } from '$lib/crypto/sign';
import { getGun, gunPath, gunPeerReady, type GunNode } from './client';
import { putDocument, type Validator } from './document';
import { parseCharacterId } from './characterId';

/** A general-purpose "which documents are indexed under this key" structure,
 *  shared by tags.ts/names.ts (indexing characters, key = tag/name token) and
 *  comments.ts (indexing comments, key = character id). An entry is its own
 *  small signed document rather than a shared JSON-blob array (the old
 *  scheme — see git history): each pointer lives at its own GUN key
 *  (`.../{docId}`), so two authors indexing under the same key write to
 *  different graph keys and can never clobber each other's pointer — no
 *  read-modify-write race, no lost writes. */
interface IndexPointer {
	key: string;
	docId: string;
	authorPub: PubKey;
	signature: string;
}

const isIndexPointer: Validator<IndexPointer> = (data): data is IndexPointer => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.key === 'string' &&
		typeof d.docId === 'string' &&
		typeof d.authorPub === 'string' &&
		typeof d.signature === 'string'
	);
};

/** Decides whether `authorPub` is allowed to index `docId` — the extra,
 *  locally-verifiable-without-fetching-the-document check described above.
 *  Pluggable per namespace: tags.ts/names.ts use `defaultOwnershipCheck`
 *  below (docId is a CharacterId, which encodes its author, so a forged
 *  pointer for a character someone doesn't own is rejected outright).
 *  comments.ts (see its own file) instead passes a permissive `() => true`,
 *  since comment ids are plain UUIDs that don't encode authorship — there,
 *  the pointer index is discovery-only, and the real trust boundary is each
 *  comment's independently-verified signature plus a character_id
 *  cross-check done when resolving the index (matching how tag/name
 *  pointers are also always re-verified against the real character
 *  afterward in browse.ts:resolveIndex). */
export type OwnershipCheck = (docId: string, authorPub: PubKey) => boolean;

const defaultOwnershipCheck: OwnershipCheck = (docId, authorPub) => {
	try {
		return parseCharacterId(docId).author === authorPub;
	} catch {
		return false;
	}
};

function pointerKey(docId: string): string {
	return encodeURIComponent(docId);
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
 *  encoded docId it was stored under) matches the docId inside the document
 *  and that `ownershipCheck` accepts the claimed author for that docId.
 *  Returns the verified docId, or null if anything fails — invalid or
 *  forged pointers are silently dropped, never partially trusted. */
async function verifyPointer(
	raw: unknown,
	keyDocId: string,
	ownershipCheck: OwnershipCheck
): Promise<string | null> {
	const envelope = raw as { json?: string } | null | undefined;
	if (!envelope || typeof envelope.json !== 'string') return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(envelope.json);
	} catch {
		return null;
	}
	if (!isIndexPointer(parsed) || parsed.docId !== keyDocId) return null;
	if (!ownershipCheck(parsed.docId, parsed.authorPub)) return null;
	const verified = await verifyDocument(parsed, parsed.authorPub);
	return verified ? parsed.docId : null;
}

/** GUN gives no explicit "done enumerating" signal for `.map().once()` — same
 *  underlying unreliability as a single node's put-ack (see document.ts) — so
 *  this resolves once no new child has shown up within the timeout window. */
const ENUMERATE_TIMEOUT_MS = 1000;

export interface SignedPointerIndex {
	/** Fetches the (deduped) set of document ids pointed at `key` across the
	 *  recent-months read window. */
	getIndex(key: string): Promise<string[]>;
	/** Adds a signed pointer for `docId` under `key`, in the current month's
	 *  bucket. Idempotent in effect (re-adding writes the same key), and safe
	 *  under concurrent publishers indexing under the same key since each
	 *  pointer has its own graph key — no read-modify-write, no clobbering. */
	addToIndex(key: string, docId: string, keyring: Keyring): Promise<void>;
}

/** Builds a signed pointer index namespaced under `{namespace}/{key}/{bucket}`.
 *  `ownershipCheck` defaults to the CharacterId-aware check (see
 *  defaultOwnershipCheck) — pass a different one for documents whose ids
 *  don't encode their author (see comments.ts). */
export function createSignedPointerIndex(
	namespace: string,
	ownershipCheck: OwnershipCheck = defaultOwnershipCheck
): SignedPointerIndex {
	function bucketNode(key: string, bucket: string): GunNode {
		return gunPath(getGun(), `${namespace}/${encodeURIComponent(key)}/${bucket}`);
	}

	function readBucket(key: string, bucket: string): Promise<string[]> {
		return new Promise((resolve) => {
			const pending: Promise<string | null>[] = [];
			let settled = false;

			function finish() {
				if (settled) return;
				settled = true;
				Promise.all(pending).then((results) => {
					resolve(results.filter((id): id is string => id !== null));
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
						pending.push(verifyPointer(data, decodeURIComponent(childKey), ownershipCheck));
					});
			});
		});
	}

	async function getIndex(key: string): Promise<string[]> {
		const perBucket = await Promise.all(recentBuckets().map((bucket) => readBucket(key, bucket)));
		return Array.from(new Set(perBucket.flat()));
	}

	async function addToIndex(key: string, docId: string, keyring: Keyring): Promise<void> {
		const draft: IndexPointer = { key, docId, authorPub: keyring.publicKey, signature: '' };
		draft.signature = await signDocument(draft, keyring);
		const node = bucketNode(key, monthBucket(new Date())).get(pointerKey(docId));
		await putDocument(node, draft);
	}

	return { getIndex, addToIndex };
}
