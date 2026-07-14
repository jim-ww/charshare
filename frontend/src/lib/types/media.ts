export type MediaType = "image" | "video";

export interface MediaItem {
	url: string;
	type: MediaType;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".ogv"];

/** Guesses a URL's media type from its extension, defaulting to "image" for
 *  anything unrecognized (data URIs, extensionless CDN links, etc.) — used
 *  by CharacterForm to preselect a type for a newly entered URL. */
export function inferMediaType(url: string): MediaType {
	const path = url.split(/[?#]/)[0].toLowerCase();
	return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? "video" : "image";
}

/** First image-type entry, skipping any leading videos — used wherever a
 *  single still image is needed (avatars, chat thumbnails) rather than the
 *  full ordered media carousel. */
export function firstImageUrl(media: MediaItem[]): string | undefined {
	return media.find((m) => m.type === "image")?.url;
}

/** Converts the pre-media `image_urls: string[]` shape (every character
 *  published/stored before `media` existed) into the new shape, treating
 *  every entry as an image. Only needed for reading old data — delete once
 *  no such data remains (see nostr/characters.ts:eventToCharacter and
 *  state/characters.svelte.ts's local-storage migration). */
export function legacyImageUrlsToMedia(imageUrls: string[]): MediaItem[] {
	return imageUrls.filter((u) => u.trim()).map((url) => ({ url, type: "image" as const }));
}
