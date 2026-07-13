import type { ChatId } from '$lib/types';

/** Message-generation failures (send, regenerate, continue, edit-and-resend)
 *  keyed per chat, so ChatBubble's per-message actions (regenerate/continue/
 *  edit-resend) and ChatComposer's own send/generate-for-me both surface into
 *  the same place — the composer's error line — rather than some of them
 *  (previously regenerate/continue/edit-resend) failing silently with
 *  nothing shown at all. */
let errors = $state<Record<ChatId, string | null>>({});

export function getChatGenerationError(chatId: ChatId): string | null {
	return errors[chatId] ?? null;
}

export function setChatGenerationError(chatId: ChatId, message: string | null): void {
	errors = { ...errors, [chatId]: message };
}
