import type { CharacterId } from '$lib/types';
import { getGun, gunPath } from './client';

/** Maintains `/tags/{tag}/index` as a JSON-blob array of character ids (see
 *  spec: Tag indexing — GUN has no query engine, so browsing by tag needs a
 *  manually maintained index). Stored as a single unsigned blob rather than
 *  native GUN graph children, matching this project's document-storage
 *  convention (see document.ts) and its flat-key gunPath fix. This is a
 *  known simplification: concurrent publishers tagging the same tag can
 *  race and clobber each other's pointer (last-write-wins, no merge) — the
 *  spec explicitly defers designing a real indexing scheme, so this is
 *  good enough until that's revisited. */
const TAG_INDEX_TIMEOUT_MS = 3000;

function tagIndexPath(tag: string): string {
	return `tags/${encodeURIComponent(tag)}/index`;
}

/** GUN's `.once()` callback never fires at all for a path that has never
 *  been written to (no ack, no data) — confirmed via isolated testing, same
 *  underlying unreliability as putDocument's put-ack (see document.ts).
 *  A never-published tag is the common case, so this needs the same
 *  timeout-fallback treatment: no callback within the window means "empty". */
async function readTagIndex(tag: string): Promise<CharacterId[]> {
	const node = gunPath(getGun(), tagIndexPath(tag));
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve([]);
			}
		}, TAG_INDEX_TIMEOUT_MS);
		node.once((data: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			const raw = (data as { json?: string } | null | undefined)?.json;
			if (!raw) {
				resolve([]);
				return;
			}
			try {
				const parsed = JSON.parse(raw);
				resolve(Array.isArray(parsed) ? parsed : []);
			} catch {
				resolve([]);
			}
		});
	});
}

function writeTagIndex(tag: string, ids: CharacterId[]): Promise<void> {
	const node = gunPath(getGun(), tagIndexPath(tag));
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve();
			}
		}, TAG_INDEX_TIMEOUT_MS);
		node.put({ json: JSON.stringify(ids) }, () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		});
	});
}

export function getTagIndex(tag: string): Promise<CharacterId[]> {
	return readTagIndex(tag);
}

export async function addToTagIndex(tag: string, id: CharacterId): Promise<void> {
	const ids = await readTagIndex(tag);
	if (!ids.includes(id)) await writeTagIndex(tag, [...ids, id]);
}
