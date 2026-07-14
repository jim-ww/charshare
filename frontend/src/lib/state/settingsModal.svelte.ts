import { pushState } from '$app/navigation';

export type SettingsTab = 'account' | 'personas' | 'general' | 'sound' | 'network' | 'ai' | 'content' | 'data' | 'comments';

let isOpen = $state(false);
let activeTab = $state<SettingsTab>('account');

// Whether we pushed a history entry for the currently-open modal — lets the
// phone/browser Back button close it instead of navigating away, without
// double-popping history when the user closes it some other way.
let ownsHistoryEntry = false;

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', () => {
		if (!isOpen) return;
		ownsHistoryEntry = false;
		isOpen = false;
	});
}

export function isSettingsOpen(): boolean {
	return isOpen;
}

export function getActiveSettingsTab(): SettingsTab {
	return activeTab;
}

export function setActiveSettingsTab(tab: SettingsTab): void {
	activeTab = tab;
}

export function openSettings(tab: SettingsTab = 'account'): void {
	activeTab = tab;
	isOpen = true;
	if (typeof window !== 'undefined') {
		pushState('', { settingsModal: true });
		ownsHistoryEntry = true;
	}
}

export function closeSettings(): void {
	if (!isOpen) return;
	isOpen = false;
	if (ownsHistoryEntry && typeof window !== 'undefined') {
		ownsHistoryEntry = false;
		history.back();
	}
}
