import { describe, it, expect, beforeEach } from 'vitest';
import {
	__setChatsForTests,
	addMessage,
	addMessageVersion,
	createChat,
	deleteChat,
	deleteMessage,
	exportChat,
	getActivePath,
	getChat,
	getChats,
	getSiblings,
	importChat,
	renameChat,
	setActiveVersion,
	switchBranch
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

	it('renames a chat', async () => {
		const chat = await createChat('char-1', 'Test chat');
		await renameChat(chat.id, 'New name');
		expect(getChat(chat.id)!.name).toBe('New name');
	});
});

describe('exportChat / importChat', () => {
	it('round-trips a chat with messages to a new id', async () => {
		const chat = await createChat('char-1', 'Test chat');
		await addMessage(chat.id, 'user', 'hello');

		const json = exportChat(chat.id);
		const imported = await importChat('char-2', json);

		expect(imported.id).not.toBe(chat.id);
		expect(imported.character_id).toBe('char-2');
		expect(imported.name).toBe('Test chat');
		expect(imported.messages).toHaveLength(1);
		expect(getChat(imported.id)).toEqual(imported);
	});

	it('rejects invalid JSON', async () => {
		await expect(importChat('char-1', 'not json')).rejects.toThrow('Not valid JSON.');
	});

	it('rejects JSON that is not a chat export', async () => {
		await expect(importChat('char-1', JSON.stringify({ foo: 'bar' }))).rejects.toThrow(
			'Not a valid chat export.'
		);
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

describe('message tree: branches, getActivePath, switchBranch', () => {
	it('a message with no alternates is its own only sibling', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		expect(getSiblings(getChat(chat.id)!, message.id).map((m) => m.id)).toEqual([message.id]);
	});

	it('regenerating (adding a sibling under the same parent) switches the active path without losing the old branch', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const first = await addMessage(chat.id, 'user', 'hello');
		const replyA = await addMessage(chat.id, 'character', 'reply A');
		await addMessage(chat.id, 'user', 'follow-up on A');

		// regenerate replyA: new sibling under the same parent (first)
		const replyB = await addMessage(chat.id, 'character', 'reply B', first.id);

		let stored = getChat(chat.id)!;
		expect(getActivePath(stored).map((m) => m.id)).toEqual([first.id, replyB.id]);
		expect(getSiblings(stored, replyA.id).map((m) => m.id)).toEqual([replyA.id, replyB.id]);

		// switch back to the original branch — the follow-up built on it is still there
		await switchBranch(chat.id, replyA.id);
		stored = getChat(chat.id)!;
		const path = getActivePath(stored);
		expect(path.map((m) => m.role)).toEqual(['user', 'character', 'user']);
		expect(path[1].id).toBe(replyA.id);
	});

	it('deleting a message cascades to everything built on top of it', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const first = await addMessage(chat.id, 'user', 'hello');
		const reply = await addMessage(chat.id, 'character', 'reply');
		await addMessage(chat.id, 'user', 'follow-up');

		await deleteMessage(chat.id, reply.id);

		const stored = getChat(chat.id)!;
		expect(getActivePath(stored).map((m) => m.id)).toEqual([first.id]);
		expect(stored.messages).toHaveLength(1);
	});
});
