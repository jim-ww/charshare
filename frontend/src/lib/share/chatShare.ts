import type { Chat, Character, CharacterId, MessageRole } from '$lib/types';
import { getActivePath } from '$lib/state/chats.svelte';
import { isWailsDesktop } from '$lib/wails';

// The desktop build's webview serves its own assets under a custom scheme
// (e.g. `wails://wails.localhost`), not a normal http(s) origin — pasting
// that elsewhere makes the OS/browser treat it as a search query instead of
// a link, since nothing outside the app itself knows how to open it. Share
// links generated from Wails point at the public web build instead of
// `location.origin`, which is only meaningful there. Keep in sync with the
// BASE_PATH the pages.yml workflow builds that deployment with.
const PUBLIC_WEB_APP_URL = 'https://jim-ww.github.io/charshare';

// Bump when SharedChatData's shape changes in a way old decoders can't just
// ignore (renamed/removed field, changed meaning) — decodeSharedChat rejects
// anything with an unknown version rather than silently misrendering it.
export const SHARE_FORMAT_VERSION = 1;

export interface SharedChatMessage {
	role: MessageRole;
	content: string;
	created_at: number;
}

export interface SharedChatData {
	v: typeof SHARE_FORMAT_VERSION;
	chatName: string;
	characterId: CharacterId;
	characterName: string;
	characterImageUrl: string | null;
	userName: string | null;
	messages: SharedChatMessage[];
}

/** Snapshots the currently-active conversation (not the whole branch tree)
 *  plus just enough display info to render standalone — the recipient of a
 *  share link may not have this character (or even an account) so the
 *  viewer can't rely on resolveCharacter()/personas state. Still carries the
 *  real character_id so the bubble's avatar/name link behaves exactly like
 *  the regular chat view when the viewer does have that character. */
export function buildSharedChatData(chat: Chat, character: Character, userName: string | null): SharedChatData {
	return {
		v: SHARE_FORMAT_VERSION,
		chatName: chat.name,
		characterId: character.id,
		characterName: character.name,
		characterImageUrl: character.image_urls[0] ?? null,
		userName,
		messages: getActivePath(chat).map((m) => ({
			role: m.role,
			content: m.content,
			created_at: m.created_at
		}))
	};
}

/** Base64url-encodes the shared chat data for embedding in a URL query
 *  param — url-safe alphabet (no +/=) so it survives copy/paste untouched. */
export function encodeSharedChat(data: SharedChatData): string {
	const json = JSON.stringify(data);
	const bytes = new TextEncoder().encode(json);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const base64 = btoa(binary);
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Builds the full copyable share URL, routing around Wails' non-http
 *  origin (see PUBLIC_WEB_APP_URL above) — the one place callers should
 *  assemble this rather than concatenating location.origin themselves.
 *  `resolvedSharedPath` is `resolve('/shared')` from the caller (kept out of
 *  this module so it stays plain-importable from vitest, which can't resolve
 *  `$app/paths` outside a SvelteKit app context). */
export function buildShareUrl(data: SharedChatData, resolvedSharedPath: string): string {
	const query = `?d=${encodeSharedChat(data)}`;
	if (isWailsDesktop()) return `${PUBLIC_WEB_APP_URL}/shared${query}`;
	return `${location.origin}${resolvedSharedPath}${query}`;
}

export function decodeSharedChat(encoded: string): SharedChatData {
	const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	let json: string;
	try {
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		json = new TextDecoder().decode(bytes);
	} catch {
		throw new Error('Not a valid share link.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not a valid share link.');
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!Array.isArray((parsed as SharedChatData).messages) ||
		typeof (parsed as SharedChatData).characterName !== 'string'
	) {
		throw new Error('Not a valid share link.');
	}
	if ((parsed as SharedChatData).v !== SHARE_FORMAT_VERSION) {
		throw new Error('This share link was made by an incompatible version of Charshare.');
	}
	return parsed as SharedChatData;
}
