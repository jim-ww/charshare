import { describe, it, expect, beforeEach } from 'vitest';
import {
	__setChatsForTests,
	addChatBackground,
	addMessage,
	createChat,
	deleteChat,
	deleteMessage,
	editMessage,
	exportChat,
	getActivePath,
	getChat,
	getChats,
	getSiblings,
	importChat,
	removeChatBackground,
	renameChat,
	setChatActiveBackground,
	switchBranch
} from './chats.svelte';

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

describe('chat backgrounds', () => {
	it('adds, selects, and removes a background', async () => {
		const chat = await createChat('char-1', 'Test chat');
		await addChatBackground(chat.id, 'https://example.com/bg.png');
		expect(getChat(chat.id)!.backgrounds).toEqual(['https://example.com/bg.png']);

		await setChatActiveBackground(chat.id, 'https://example.com/bg.png');
		expect(getChat(chat.id)!.active_background).toBe('https://example.com/bg.png');

		await removeChatBackground(chat.id, 'https://example.com/bg.png');
		expect(getChat(chat.id)!.backgrounds).toEqual([]);
		expect(getChat(chat.id)!.active_background).toBeNull();
	});

	it('ignores duplicate and blank background urls', async () => {
		const chat = await createChat('char-1', 'Test chat');
		await addChatBackground(chat.id, 'https://example.com/bg.png');
		await addChatBackground(chat.id, 'https://example.com/bg.png');
		await addChatBackground(chat.id, '   ');
		expect(getChat(chat.id)!.backgrounds).toEqual(['https://example.com/bg.png']);
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
	it('adds a message', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		const stored = getChat(chat.id)!.messages[0];
		expect(stored.id).toBe(message.id);
		expect(stored.content).toBe('hello');
	});

	it('editing adds a sibling branch under the same parent and switches to it, keeping the old one', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await editMessage(chat.id, message.id, 'hello there');

		const stored = getChat(chat.id)!;
		expect(stored.messages).toHaveLength(2);
		expect(getActivePath(stored).map((m) => m.content)).toEqual(['hello there']);
		expect(getSiblings(stored, message.id).map((m) => m.content)).toEqual(['hello', 'hello there']);
	});

	it('editing with unchanged content is a no-op', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await editMessage(chat.id, message.id, 'hello');

		expect(getChat(chat.id)!.messages).toHaveLength(1);
	});

	it('can switch back to the pre-edit branch', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const message = await addMessage(chat.id, 'user', 'hello');
		await editMessage(chat.id, message.id, 'hello there');
		await switchBranch(chat.id, message.id);

		expect(getActivePath(getChat(chat.id)!).map((m) => m.content)).toEqual(['hello']);
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

	it('deleting a message splices it out, keeping everything built on top of it', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const first = await addMessage(chat.id, 'user', 'hello');
		const reply = await addMessage(chat.id, 'character', 'reply');
		const followUp = await addMessage(chat.id, 'user', 'follow-up');

		await deleteMessage(chat.id, reply.id);

		const stored = getChat(chat.id)!;
		expect(getActivePath(stored).map((m) => m.id)).toEqual([first.id, followUp.id]);
		expect(stored.messages).toHaveLength(2);
		expect(stored.messages.find((m) => m.id === followUp.id)?.parent_id).toBe(first.id);
	});

	it('deleting a leaf message just removes it, leaving its parent as the new leaf', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const first = await addMessage(chat.id, 'user', 'hello');
		const reply = await addMessage(chat.id, 'character', 'reply');

		await deleteMessage(chat.id, reply.id);

		const stored = getChat(chat.id)!;
		expect(getActivePath(stored).map((m) => m.id)).toEqual([first.id]);
		expect(stored.messages).toHaveLength(1);
	});

	it('deleting the root promotes its active child to root', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const first = await addMessage(chat.id, 'user', 'hello');
		const reply = await addMessage(chat.id, 'character', 'reply');

		await deleteMessage(chat.id, first.id);

		const stored = getChat(chat.id)!;
		expect(stored.root_id).toBe(reply.id);
		expect(getActivePath(stored).map((m) => m.id)).toEqual([reply.id]);
	});
});
