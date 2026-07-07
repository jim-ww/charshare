import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Character, Chat } from '$lib/types';
import { __setChatsForTests, createChat, getChat } from '$lib/state/chats.svelte';
import { sendMessage, generateUserDraft } from './chat';

const character: Character = {
	id: 'char-1',
	version: 1,
	name: 'Aria',
	image_url: '',
	description: '',
	personality: '',
	scenario: 'A quiet library.',
	tags: [],
	nsfw: false,
	language: '',
	system_prompt: 'Stay in character.',
	first_message: '',
	alternate_greetings: [],
	comments_enabled: true,
	author: 'pubkey',
	forked_from: null,
	deleted: false,
	deleted_at: null,
	signature: 'sig',
	created_at: 0,
	updated_at: 0
};

beforeEach(() => {
	__setChatsForTests({});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ choices: [{ message: { content: 'a reply' } }] })
		}))
	);
});

describe('sendMessage', () => {
	it('appends the user message and the AI reply', async () => {
		const chat: Chat = await createChat(character.id, 'Test chat');
		await sendMessage(chat, character, 'hi there');

		const stored = getChat(chat.id)!;
		expect(stored.messages).toHaveLength(2);
		expect(stored.messages[0].role).toBe('user');
		expect(stored.messages[1].role).toBe('character');
		expect(stored.messages[1].versions[0].content).toBe('a reply');
	});
});

describe('generateUserDraft', () => {
	it('returns the completion without appending a message', async () => {
		const chat: Chat = await createChat(character.id, 'Test chat');
		const draft = await generateUserDraft(chat, character);

		expect(draft).toBe('a reply');
		expect(getChat(chat.id)!.messages).toEqual([]);
	});
});
