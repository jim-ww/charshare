import type { MessageId } from '$lib/types';

/** Which character messages are currently being generated — set by
 *  ai/chat.ts while a completion streams in, cleared when it finishes
 *  (successfully, aborted, or errored). Message.content itself updates on
 *  every chunk with no way to tell "still going" from "just finished", so
 *  this is the one place that actually knows — used by ChatBubble to auto
 *  read a reply aloud only once it's actually done, not while it's still
 *  streaming in. */
let streamingIds = $state<Set<MessageId>>(new Set());

export function isMessageStreaming(id: MessageId): boolean {
	return streamingIds.has(id);
}

export function startStreaming(id: MessageId): void {
	streamingIds = new Set(streamingIds).add(id);
}

export function endStreaming(id: MessageId): void {
	if (!streamingIds.has(id)) return;
	const next = new Set(streamingIds);
	next.delete(id);
	streamingIds = next;
}
