import { describe, it, expect, beforeEach } from 'vitest';
import { __setChatsForTests, addMessage, createChat, getActivePath, getChat } from './chats.svelte';

beforeEach(() => {
	__setChatsForTests({});
});

describe('importing a long chat-site conversation', () => {
	it('adds every message from a 165-turn history without crashing', async () => {
		const chat = await createChat('char-1', 'Test chat');
		const history = Array.from({ length: 165 }, (_, i) => ({
			role: (i % 2 === 0 ? 'user' : 'character') as 'user' | 'character',
			// Mimic the real reported content sizes (tens to thousands of chars).
			content: 'x'.repeat(500 + ((i * 137) % 3500))
		}));
		for (const message of history) {
			await addMessage(chat.id, message.role, message.content);
		}
		const finalChat = getChat(chat.id)!;
		expect(finalChat.messages).toHaveLength(165);
		expect(getActivePath(finalChat)).toHaveLength(165);
	});
});
