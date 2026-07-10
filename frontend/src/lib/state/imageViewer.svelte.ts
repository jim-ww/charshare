import type { Chat, Character } from '$lib/types';

let expandedChat = $state<Chat | undefined>(undefined);
let expandedCharacter = $state<Character | undefined>(undefined);

export function getExpandedImageViewer(): { chat: Chat; character: Character } | undefined {
	if (!expandedChat || !expandedCharacter) return undefined;
	return { chat: expandedChat, character: expandedCharacter };
}

export function openImageViewer(chat: Chat, character: Character): void {
	expandedChat = chat;
	expandedCharacter = character;
}

export function closeImageViewer(): void {
	expandedChat = undefined;
	expandedCharacter = undefined;
}
