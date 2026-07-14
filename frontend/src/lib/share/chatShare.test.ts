import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildShareUrl, buildSharedChatData, decodeSharedChat, encodeSharedChat, SHARE_FORMAT_VERSION } from './chatShare';
import type { Chat, Character } from '$lib/types';

vi.mock('$lib/wails', () => ({ isWailsDesktop: vi.fn(() => false) }));
import { isWailsDesktop } from '$lib/wails';

function makeChat(overrides: Partial<Chat> = {}): Chat {
	return {
		id: 'chat-1',
		character_id: 'char-1',
		persona_id: null,
		name: 'Test chat',
		messages: [
			{ id: 'm1', parent_id: null, role: 'character', content: 'Hi there!', created_at: 1, updated_at: 1 },
			{ id: 'm2', parent_id: 'm1', role: 'user', content: 'Hello 👋 with unicode ünïcödé', created_at: 2, updated_at: 2 }
		],
		root_id: 'm1',
		active_child: { m1: 'm2' },
		created_at: 0,
		draft: '',
		editing_message_id: null,
		editing_draft: '',
		image_index: 0,
		backgrounds: [],
		active_background: null,
		tts_provider: { provider: 'local' },
		tts_voice_id: 'f1',
		tts_pitch: 1,
		tts_speed: 1,
		...overrides
	};
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
	return {
		id: 'char-1',
		version: 1,
		name: 'Aria',
		media: [{ url: 'https://example.com/a.png', type: 'image' }],
		description: '',
		personality: '',
		scenario: '',
		tags: [],
		nsfw: false,
		language: 'en',
		system_prompt: '',
		first_message: '',
		alternate_greetings: [],
		example_dialogues: [],
		comments_enabled: true,
		forked_from: null,
		author: 'pub-1',
		created_at: 0,
		updated_at: 0,
		deleted: false,
		deleted_at: null,
		...overrides
	} as Character;
}

describe('encodeSharedChat / decodeSharedChat', () => {
	it('round-trips a chat built via buildSharedChatData, including unicode content', () => {
		const chat = makeChat();
		const character = makeCharacter();
		const data = buildSharedChatData(chat, character, 'Jim');
		const encoded = encodeSharedChat(data);

		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

		const decoded = decodeSharedChat(encoded);
		expect(decoded).toEqual(data);
		expect(decoded.characterId).toBe('char-1');
		expect(decoded.messages.map((m) => m.content)).toEqual(['Hi there!', 'Hello 👋 with unicode ünïcödé']);
	});

	it('rejects a share link from an incompatible format version', () => {
		const data = buildSharedChatData(makeChat(), makeCharacter(), 'Jim');
		const encoded = encodeSharedChat({ ...data, v: (SHARE_FORMAT_VERSION + 1) as typeof SHARE_FORMAT_VERSION });
		expect(() => decodeSharedChat(encoded)).toThrow();
	});

	it('only includes the active path, not other branches', () => {
		const chat = makeChat({
			messages: [
				{ id: 'm1', parent_id: null, role: 'character', content: 'root', created_at: 1, updated_at: 1 },
				{ id: 'm2', parent_id: 'm1', role: 'user', content: 'active branch', created_at: 2, updated_at: 2 },
				{ id: 'm3', parent_id: 'm1', role: 'user', content: 'inactive branch', created_at: 3, updated_at: 3 }
			],
			root_id: 'm1',
			active_child: { m1: 'm2' }
		});
		const data = buildSharedChatData(chat, makeCharacter(), null);
		expect(data.messages.map((m) => m.content)).toEqual(['root', 'active branch']);
	});

	it('rejects garbage input', () => {
		expect(() => decodeSharedChat('not-valid-base64!!!')).toThrow();
		expect(() => decodeSharedChat(btoa('{"foo":"bar"}'))).toThrow();
	});
});

describe('buildShareUrl', () => {
	beforeEach(() => {
		vi.stubGlobal('location', { origin: 'https://self-hosted.example' });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.mocked(isWailsDesktop).mockReturnValue(false);
	});

	it('uses the current origin outside Wails, so self-hosted deployments link to themselves', () => {
		const data = buildSharedChatData(makeChat(), makeCharacter(), 'Jim');
		const url = buildShareUrl(data, '/shared');
		expect(url.startsWith('https://self-hosted.example/shared?d=')).toBe(true);
	});

	it("uses the public web app's origin inside Wails, whose own origin isn't a normal http(s) URL", () => {
		vi.mocked(isWailsDesktop).mockReturnValue(true);
		const data = buildSharedChatData(makeChat(), makeCharacter(), 'Jim');
		const url = buildShareUrl(data, '/shared');
		expect(url.startsWith('https://jim-ww.github.io/charshare/shared?d=')).toBe(true);
		expect(url).not.toContain('self-hosted.example');
	});
});
