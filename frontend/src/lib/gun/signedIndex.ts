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
	createdAt: number;
	authorPub: PubKey;
	signature: string;
}

const isIndexPointer: Validator<IndexPointer> = (data): data is IndexPointer => {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.key === 'string' &&
		typeof d.docId === 'string' &&
		typeof d.createdAt === 'number' &&
		typeof d.authorPub === 'string' &&
		typeof d.signature === 'string'
	);
};

/** A pointer's docId plus the indexed document's `created_at`, denormalized
 *  onto the (small, cheap) pointer itself rather than only living on the
 *  full document — lets a bucket's contents be sorted and paginated using
 *  only pointer reads, deferring the expensive part (fetching and
 *  signature-verifying the actual documents via getCharacter) to just the
 *  page slice actually being shown, even when a single bucket holds far more
 *  than one page's worth (see browse.ts:browseNetworkPage). */
export interface IndexEntry {
	docId: string;
	createdAt: number;
}

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

/** New pointers always land in the current calendar month's bucket. Reads
 *  scan back to `GENESIS_MONTH` — the month this indexing scheme was built
 *  (this repo's initial commit) — rather than an arbitrary rolling window,
 *  since no character could possibly have been published before it exists.
 *  Nothing ever ages out or stops surfacing; the number of buckets scanned
 *  just grows by one every month (see {@link getReadWindowSize}), which is
 *  cheap since bucket reads are batched (see browse.ts:BUCKET_BATCH_SIZE),
 *  not all fired in parallel on every load. */
const GENESIS_MONTH = { year: 2026, month: 7 };

/** How many monthly buckets exist between now and {@link GENESIS_MONTH},
 *  inclusive of the current month — i.e. the full size of the read/write
 *  window. Exported so callers that walk buckets by offset (see
 *  browse.ts:browseNetworkPage) know where the oldest end is, without
 *  needing to read anything first (pure date arithmetic). */
export function getReadWindowSize(): number {
	const now = new Date();
	return (
		(now.getUTCFullYear() - GENESIS_MONTH.year) * 12 + (now.getUTCMonth() + 1 - GENESIS_MONTH.month) + 1
	);
}

function recentBuckets(): string[] {
	const now = new Date();
	const buckets: string[] = [];
	for (let i = 0; i < getReadWindowSize(); i++) {
		buckets.push(monthBucket(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
	}
	return buckets;
}

/** Parses, schema-validates, and signature-verifies a raw pointer envelope
 *  read off a bucket node, additionally checking that its GUN key (the
 *  encoded docId it was stored under) matches the docId inside the document
 *  and that `ownershipCheck` accepts the claimed author for that docId.
 *  Returns the verified entry, or null if anything fails — invalid or
 *  forged pointers are silently dropped, never partially trusted. Note
 *  `createdAt` here is only as trustworthy as the pointer's signer claimed
 *  it to be at write time (see addToIndex) — it's still signed and
 *  ownership-checked like the rest of the pointer, but nothing cross-checks
 *  it against the actual document's `created_at` until that document is
 *  separately fetched, same as every other pointer field. */
async function verifyPointer(
	raw: unknown,
	keyDocId: string,
	ownershipCheck: OwnershipCheck
): Promise<IndexEntry | null> {
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
	return verified ? { docId: parsed.docId, createdAt: parsed.createdAt } : null;
}

/** GUN gives no explicit "done enumerating" signal for `.map().once()` — same
 *  underlying unreliability as a single node's put-ack (see document.ts) — so
 *  this resolves once no new child has shown up within the timeout window. */
const ENUMERATE_TIMEOUT_MS = 1000;

export interface SignedPointerIndex {
	/** Fetches the (deduped) set of document ids pointed at `key` across the
	 *  recent-months read window. */
	getIndex(key: string): Promise<string[]>;
	/** Fetches the entries (docId + denormalized createdAt — see
	 *  {@link IndexEntry}) in a single bucket, identified by its offset into
	 *  {@link recentBuckets} (0 = current/oldest end depending on `order` —
	 *  see browse.ts:browseNetworkPage, the only caller, which walks one
	 *  bucket at a time and stops as soon as it has enough for a page,
	 *  instead of always reading the whole window. Returns `null` once
	 *  `bucketOffset` runs past the read window — the "no more buckets"
	 *  signal. */
	getIndexBucket(key: string, bucketOffset: number): Promise<IndexEntry[] | null>;
	/** Adds a signed pointer for `docId` under `key`, in the current month's
	 *  bucket, carrying `createdAt` (the indexed document's own creation
	 *  time) so it can be sorted/paginated without fetching that document.
	 *  Idempotent in effect (re-adding writes the same key), and safe under
	 *  concurrent publishers indexing under the same key since each pointer
	 *  has its own graph key — no read-modify-write, no clobbering. */
	addToIndex(key: string, docId: string, createdAt: number, keyring: Keyring): Promise<void>;
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

	function readBucket(key: string, bucket: string): Promise<IndexEntry[]> {
		return new Promise((resolve) => {
			const pending: Promise<IndexEntry | null>[] = [];
			let settled = false;

			function finish() {
				if (settled) return;
				settled = true;
				Promise.all(pending).then((results) => {
					resolve(results.filter((entry): entry is IndexEntry => entry !== null));
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
		return Array.from(new Set(perBucket.flat().map((entry) => entry.docId)));
	}

	async function getIndexBucket(key: string, bucketOffset: number): Promise<IndexEntry[] | null> {
		const buckets = recentBuckets();
		if (bucketOffset < 0 || bucketOffset >= buckets.length) return null;
		return readBucket(key, buckets[bucketOffset]);
	}

	async function addToIndex(key: string, docId: string, createdAt: number, keyring: Keyring): Promise<void> {
		const draft: IndexPointer = { key, docId, createdAt, authorPub: keyring.publicKey, signature: '' };
		draft.signature = await signDocument(draft, keyring);
		const node = bucketNode(key, monthBucket(new Date())).get(pointerKey(docId));
		await putDocument(node, draft);
	}

	return { getIndex, getIndexBucket, addToIndex };
}
