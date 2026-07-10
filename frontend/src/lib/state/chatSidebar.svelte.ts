// Tracks whether the mobile chat-list drawer is open. Unused on md+ screens,
// where the sidebar is always visible inline.
let isOpen = $state(false);

export function isChatSidebarOpen(): boolean {
	return isOpen;
}

export function openChatSidebar(): void {
	isOpen = true;
}

export function closeChatSidebar(): void {
	isOpen = false;
}

export function toggleChatSidebar(): void {
	isOpen = !isOpen;
}
