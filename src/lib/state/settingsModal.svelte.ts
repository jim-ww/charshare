export type SettingsTab = 'profile' | 'general' | 'network' | 'ai' | 'content';

let isOpen = $state(false);
let activeTab = $state<SettingsTab>('profile');

export function isSettingsOpen(): boolean {
	return isOpen;
}

export function getActiveSettingsTab(): SettingsTab {
	return activeTab;
}

export function setActiveSettingsTab(tab: SettingsTab): void {
	activeTab = tab;
}

export function openSettings(tab: SettingsTab = 'profile'): void {
	activeTab = tab;
	isOpen = true;
}

export function closeSettings(): void {
	isOpen = false;
}
