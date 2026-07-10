import type { Chat, Character } from '$lib/types';

let expandedChat = $state<Chat | undefined>(undefined);
let expandedCharacter = $state<Character | undefined>(undefined);

// Whether we pushed a history entry for the currently-open viewer — lets the
// phone/browser Back button close the overlay instead of navigating away,
// without double-popping history when the user closes it some other way.
let ownsHistoryEntry = false;

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', () => {
		if (!expandedChat) return;
		ownsHistoryEntry = false;
		expandedChat = undefined;
		expandedCharacter = undefined;
	});
}

export function getExpandedImageViewer(): { chat: Chat; character: Character } | undefined {
	if (!expandedChat || !expandedCharacter) return undefined;
	return { chat: expandedChat, character: expandedCharacter };
}

export function openImageViewer(chat: Chat, character: Character): void {
	expandedChat = chat;
	expandedCharacter = character;
	if (typeof window !== 'undefined') {
		history.pushState({ imageViewer: true }, '');
		ownsHistoryEntry = true;
	}
}

export function closeImageViewer(): void {
	if (!expandedChat) return;
	expandedChat = undefined;
	expandedCharacter = undefined;
	if (ownsHistoryEntry && typeof window !== 'undefined') {
		ownsHistoryEntry = false;
		history.back();
	}
}
