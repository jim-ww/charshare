import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Character, Chat } from '$lib/types';
import { __setChatsForTests, addMessage, createChat, getActivePath, getChat, switchBranch } from '$lib/state/chats.svelte';
import { sendMessage, generateUserDraft, regenerateMessage, fitToContext } from './chat';
import type { CompletionMessage } from './index';

const character: Character = {
	id: 'char-1',
	version: 1,
	name: 'Aria',
	image_urls: [],
	description: '',
	personality: 'Aloof but curious.',
	scenario: 'A quiet library.',
	tags: [],
	nsfw: false,
	language: '',
	system_prompt: 'Stay in character.',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: ['{{user}}: Hi.\nAria: *glances up*'],
	comments_enabled: true,
	slideshow_enabled: false,
	author: 'pubkey',
	forked_from: null,
	deleted: false,
	deleted_at: null,
	created_at: 0,
	updated_at: 0
};

/** Builds a fetch Response streaming OpenRouter-style SSE chunks, one
 *  `data:` event per delta, ending with `data: [DONE]`. */
function sseResponse(deltas: string[], finishReason: string): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const delta of deltas) {
				const chunk = { choices: [{ delta: { content: delta } }] };
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
			}
			const final = { choices: [{ delta: {}, finish_reason: finishReason }] };
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(final)}\n\n`));
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		}
	});
	return { ok: true, body: stream } as unknown as Response;
}

beforeEach(() => {
	__setChatsForTests({});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => sseResponse(['a reply'], 'stop'))
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
		expect(stored.messages[1].content).toBe('a reply');
	});

	it('cancels mid-stream and keeps whatever was generated so far', async () => {
		const encoder = new TextEncoder();
		const abortController = new AbortController();
		let fetchStarted!: () => void;
		const fetchStartedPromise = new Promise<void>((resolve) => (fetchStarted = resolve));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, init: RequestInit) => {
				let streamController: ReadableStreamDefaultController<Uint8Array>;
				const stream = new ReadableStream<Uint8Array>({
					start(c) {
						streamController = c;
						c.enqueue(
							encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Her thumb pauses' } }] })}\n\n`)
						);
					}
				});
				// real fetch rejects the next reader.read() once the signal aborts —
				// simulate that so the stream doesn't hang forever in the test.
				init.signal?.addEventListener('abort', () => {
					streamController.error(new DOMException('Aborted', 'AbortError'));
				});
				fetchStarted();
				return { ok: true, body: stream } as unknown as Response;
			})
		);

		const chat: Chat = await createChat(character.id, 'Test chat');
		const sendPromise = sendMessage(chat, character, 'hi there', { signal: abortController.signal });
		await fetchStartedPromise;
		// let the reader loop consume the already-queued first chunk before we
		// abort, so the abort only cuts off what comes *after* it
		await new Promise((resolve) => setTimeout(resolve, 0));
		abortController.abort();
		await sendPromise;

		const stored = getChat(chat.id)!;
		expect(stored.messages[1].content).toBe('Her thumb pauses');
	});
});

describe('generateUserDraft', () => {
	it('returns the completion without appending a message', async () => {
		const chat: Chat = await createChat(character.id, 'Test chat');
		const draft = await generateUserDraft(chat, character);

		expect(draft).toBe('a reply');
		expect(getChat(chat.id)!.messages).toEqual([]);
	});

	it('drops the character-voice system_prompt and instructs writing for {{user}}', async () => {
		const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => sseResponse(['a reply'], 'stop'));
		vi.stubGlobal('fetch', fetchMock);

		const chat: Chat = await createChat(character.id, 'Test chat');
		await generateUserDraft(chat, character);

		const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
		const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system').content;

		expect(systemMessage).not.toContain(character.system_prompt);
		expect(systemMessage).not.toContain(character.name);
		expect(systemMessage).not.toContain(character.personality);
		expect(systemMessage).not.toContain(character.example_dialogues[0]);
		expect(systemMessage).toContain(character.scenario);
		expect(systemMessage).toContain('{{user}}');
		expect(systemMessage).toContain('never speak, act, or narrate for {{char}}');
	});
});

describe('regenerateMessage', () => {
	it('replaces the last character message on the active path when nothing comes after it', async () => {
		const chat: Chat = await createChat(character.id, 'Test chat');
		await sendMessage(chat, character, 'hi there');
		const before = getChat(chat.id)!;
		const replyId = getActivePath(before)[1].id;

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => sseResponse(['a different reply'], 'stop'))
		);
		await regenerateMessage(before, character, replyId);

		const stored = getChat(chat.id)!;
		const activePath = getActivePath(stored);
		expect(activePath).toHaveLength(2);
		expect(activePath[1].id).not.toBe(replyId);
		expect(activePath[1].content).toBe('a different reply');
		// the old reply is still stored, just no longer on the active path
		expect(stored.messages.some((m) => m.id === replyId)).toBe(true);
	});

	it('keeps the old branch (and what was built on it) reachable when later messages depend on the regenerated one', async () => {
		const chat: Chat = await createChat(character.id, 'Test chat');
		await sendMessage(chat, character, 'hi there');
		const midpoint = getChat(chat.id)!;
		const replyId = getActivePath(midpoint)[1].id;
		await addMessage(chat.id, 'user', 'a follow-up');
		const before = getChat(chat.id)!;

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => sseResponse(['a branched reply'], 'stop'))
		);
		await regenerateMessage(before, character, replyId);

		const stored = getChat(chat.id)!;
		const activePath = getActivePath(stored);
		// the new branch is now active, and is shorter (nothing built on it yet)
		expect(activePath).toHaveLength(2);
		expect(activePath[1].content).toBe('a branched reply');

		// switching back to the old reply restores the follow-up after it
		await switchBranch(chat.id, replyId);
		const restored = getActivePath(getChat(chat.id)!);
		expect(restored).toHaveLength(3);
		expect(restored[1].id).toBe(replyId);
		expect(restored[2].role).toBe('user');
		expect(restored[2].content).toBe('a follow-up');
	});
});

describe('truncated replies', () => {
	it('asks the model to continue when finish_reason is length, and stitches the pieces together', async () => {
		let call = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				call++;
				return call === 1
					? sseResponse(['Her thumb pauses mid-sc'], 'length')
					: sseResponse(['roll, hovering over send.'], 'stop');
			})
		);

		const chat: Chat = await createChat(character.id, 'Test chat');
		await sendMessage(chat, character, 'hi there');

		const stored = getChat(chat.id)!;
		expect(stored.messages[1].content).toBe('Her thumb pauses mid-scroll, hovering over send.');
		expect(call).toBe(2);
	});

	it('gives up after MAX_CONTINUATIONS rounds instead of looping forever', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => sseResponse(['x'], 'length'))
		);

		const chat: Chat = await createChat(character.id, 'Test chat');
		await sendMessage(chat, character, 'hi there');

		const stored = getChat(chat.id)!;
		expect(stored.messages[1].content).toBe('xxxx');
	});
});

describe('fitToContext', () => {
	function msg(role: CompletionMessage['role'], content: string): CompletionMessage {
		return { role, content };
	}

	it('leaves messages untouched when well within budget', () => {
		const messages = [msg('system', 'be nice'), msg('user', 'hi'), msg('assistant', 'hello')];
		expect(fitToContext(messages, 8192, 512)).toEqual(messages);
	});

	it('disables truncation entirely when contextSize is not configured (<=0)', () => {
		const messages = [msg('system', 'x'), msg('user', 'y'.repeat(100000))];
		expect(fitToContext(messages, 0, 512)).toEqual(messages);
	});

	it('trims content off the oldest non-system message first, never the system message or the newest one', () => {
		const messages = [
			msg('system', 'System prompt.'),
			msg('user', 'a'.repeat(2000)),
			msg('assistant', 'b'.repeat(50)),
			msg('user', 'c'.repeat(50))
		];
		const result = fitToContext(messages, 60, 0);

		expect(result[0]).toEqual(messages[0]);
		expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
		expect(result.find((m) => m.role === 'user' && m.content.startsWith('a'))?.content.length).toBeLessThan(2000);
	});

	it('drops an oldest message entirely once fully drained, then continues trimming the next one', () => {
		const messages = [
			msg('system', 'System prompt.'),
			msg('user', 'short'),
			msg('assistant', 'd'.repeat(2000)),
			msg('user', 'newest message')
		];
		const result = fitToContext(messages, 40, 0);

		// The tiny "short" message should be fully dropped rather than left as
		// an empty husk, since draining it alone can't close the gap.
		expect(result.some((m) => m.content === 'short')).toBe(false);
		expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
	});

	it('never trims the final message even if the whole thing is over budget', () => {
		const messages = [msg('system', 's'), msg('user', 'e'.repeat(5000))];
		const result = fitToContext(messages, 10, 0);
		expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
	});
});
