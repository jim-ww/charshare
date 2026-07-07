import { describe, it, expect, beforeEach } from 'vitest';
import {
	__setChatsForTests,
	addMessage,
	addMessageVersion,
	createChat,
	deleteChat,
	deleteMessage,
	getChat,
	getChats,
	setActiveVersion
} from './chats.svelte';
import { activeContent } from '$lib/types';

beforeEach(() => {
	__setChatsForTests({});
});

describe('createChat / deleteChat', () => {
	it('creates and lists a chat', async () => {
		const chat = await createChat('char-1', 'Test chat');
		expect(getChats()).toEqual([chat]);
		expect(getChat(chat.id)).toEqual(chat);
	});

	it('deletes a chat', async () => {
		const chat = await createChat('char-1', 'Test chat');
		await deleteChat(chat.id);
		expect(getChats()).toEqual([]);
	});
});

describe('messages', () => {
	it('adds a message with a single version', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		const stored = getChat(chat.id)!.messages[0];
		expect(stored.id).toBe(message.id);
		expect(activeContent(stored)).toBe('hello');
	});

	it('editing appends a version and activates it, keeping history', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await addMessageVersion(chat.id, message.id, 'hello there');

		const stored = getChat(chat.id)!.messages[0];
		expect(stored.versions).toHaveLength(2);
		expect(activeContent(stored)).toBe('hello there');
		expect(stored.versions[0].content).toBe('hello');
	});

	it('can swap back to an earlier version', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await addMessageVersion(chat.id, message.id, 'hello there');
		await setActiveVersion(chat.id, message.id, 0);

		expect(activeContent(getChat(chat.id)!.messages[0])).toBe('hello');
	});

	it('deletes a message', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await deleteMessage(chat.id, message.id);

		expect(getChat(chat.id)!.messages).toEqual([]);
	});
});
