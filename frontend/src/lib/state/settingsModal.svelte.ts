import { pushState } from '$app/navigation';

export type SettingsTab = 'account' | 'personas' | 'general' | 'sound' | 'network' | 'ai' | 'content' | 'data' | 'comments';

let isOpen = $state(false);
// null means "no section preselected" — the plain nav-bar entry point into
// Settings, as opposed to an action (publish attempt, sync, etc.) that needs
// to land the user on a specific tab (e.g. 'account') to resolve it.
let activeTab = $state<SettingsTab | null>(null);

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

export function getActiveSettingsTab(): SettingsTab | null {
	return activeTab;
}

export function setActiveSettingsTab(tab: SettingsTab): void {
	activeTab = tab;
}

/** `tab` omitted opens the plain section list with nothing preselected.
 *  Pass a tab explicitly when an action requires resolving something on a
 *  specific one (e.g. 'account' for a publish attempt that needs sign-in). */
export function openSettings(tab?: SettingsTab): void {
	activeTab = tab ?? null;
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
