export type SettingsTab = 'account' | 'personas' | 'general' | 'network' | 'ai' | 'content' | 'data' | 'comments';

let isOpen = $state(false);
let activeTab = $state<SettingsTab>('account');

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
}

export function closeSettings(): void {
	isOpen = false;
}
