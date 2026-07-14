import type { ChatId } from '$lib/types';

/** Which chats currently have a completion in flight, and the AbortController
 *  that can cancel it — shared across every entry point that can start a
 *  generation for a chat (a direct send/continue in ChatComposer, or a
 *  regenerate/continue/edit-and-resend from any ChatBubble), so the "Stop"
 *  affordance works no matter which one kicked things off, and only one can
 *  run per chat at a time. */
let controllers = $state<Record<ChatId, AbortController>>({});

export function isChatGenerating(chatId: ChatId): boolean {
	return chatId in controllers;
}

/** Registers a new in-flight generation for `chatId` and returns its
 *  AbortController — callers pass `.signal` to whatever streams the
 *  completion, then must call `endChatGeneration` when it settles. */
export function startChatGeneration(chatId: ChatId): AbortController {
	const controller = new AbortController();
	controllers = { ...controllers, [chatId]: controller };
	return controller;
}

export function endChatGeneration(chatId: ChatId): void {
	if (!(chatId in controllers)) return;
	const next = { ...controllers };
	delete next[chatId];
	controllers = next;
}

export function stopChatGeneration(chatId: ChatId): void {
	controllers[chatId]?.abort();
}
