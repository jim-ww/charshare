import { browser } from '$app/environment';
import { getMyCharacters } from '$lib/state/characters.svelte';
import { getSavedCharacters } from '$lib/state/savedCharacters.svelte';
import {
	clearMediaBackup,
	getBackedUpMedia,
	listBackedUpMediaUrls,
	saveBackedUpMedia
} from '$lib/db/mediaBackup';

let cachedUrls = $state<Set<string>>(new Set());
let initPromise: Promise<void> | null = null;

/** Loads the set of already-backed-up URLs, so isMediaBackedUp/getMediaBackupCount
 *  have an answer before backupAllCharacterImages ever runs. Safe to call
 *  from multiple places (settings page, image viewer) — subsequent calls
 *  just await the same in-flight/completed load. */
export function initMediaBackup(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			cachedUrls = new Set(await listBackedUpMediaUrls());
		})();
	}
	return initPromise;
}

/** Every image URL currently referenced by a character this device knows
 *  about (own + saved) — the backup target set. Video URLs are left alone;
 *  they can be much larger and aren't what "image backup" is meant to cover. */
export function getAllCharacterImageUrls(): string[] {
	const urls = new Set<string>();
	for (const character of [...getMyCharacters(), ...getSavedCharacters()]) {
		for (const item of character.media) {
			if (item.type === 'image') urls.add(item.url);
		}
	}
	return [...urls];
}

export function isMediaBackedUp(url: string): boolean {
	return cachedUrls.has(url);
}

export function getMediaBackupCount(): number {
	return cachedUrls.size;
}

interface BackupProgress {
	running: boolean;
	done: number;
	total: number;
	failed: number;
}

let progress = $state<BackupProgress>({ running: false, done: 0, total: 0, failed: 0 });

export function getMediaBackupProgress(): BackupProgress {
	return progress;
}

/** Downloads every not-yet-cached character image and stores its bytes
 *  locally, so CharacterImageViewer (see mediaBackupFallback) can still show
 *  something once the original URL goes dead. Skips URLs already backed up
 *  rather than re-fetching them every run. Failures (dead link, CORS, no
 *  network) are counted and skipped — one bad URL shouldn't abort the rest. */
export async function backupAllCharacterImages(): Promise<void> {
	await initMediaBackup();
	const urls = getAllCharacterImageUrls().filter((url) => !cachedUrls.has(url));
	progress = { running: true, done: 0, total: urls.length, failed: 0 };
	try {
		for (const url of urls) {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error(String(response.status));
				const blob = await response.blob();
				await saveBackedUpMedia(url, blob);
				cachedUrls = new Set(cachedUrls).add(url);
				progress = { ...progress, done: progress.done + 1 };
			} catch {
				progress = { ...progress, done: progress.done + 1, failed: progress.failed + 1 };
			}
		}
	} finally {
		progress = { ...progress, running: false };
	}
}

/** Object URL for the locally-backed-up copy of `url`, or null if it was
 *  never backed up — used as an <img>/onerror fallback so a dead remote
 *  link doesn't just show a broken image. Caller owns the returned object
 *  URL's lifetime (revoke it when no longer displayed). */
export async function getMediaBackupObjectUrl(url: string): Promise<string | null> {
	const blob = await getBackedUpMedia(url);
	return blob ? URL.createObjectURL(blob) : null;
}

export async function clearAllMediaBackup(): Promise<void> {
	await clearMediaBackup();
	cachedUrls = new Set();
}
