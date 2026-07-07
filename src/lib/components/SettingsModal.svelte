<script lang="ts">
	import {
		closeSettings,
		getActiveSettingsTab,
		isSettingsOpen,
		setActiveSettingsTab,
		type SettingsTab
	} from '$lib/state/settingsModal.svelte';
	import ProfileTab from './settings/ProfileTab.svelte';
	import BackupTab from './settings/BackupTab.svelte';
	import GeneralTab from './settings/GeneralTab.svelte';
	import NetworkTab from './settings/NetworkTab.svelte';
	import AiTab from './settings/AiTab.svelte';
	import ContentTab from './settings/ContentTab.svelte';

	const tabs: { id: SettingsTab; label: string }[] = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'backup', label: 'Backup' },
		{ id: 'general', label: 'General' },
		{ id: 'network', label: 'Network' },
		{ id: 'ai', label: 'AI' },
		{ id: 'content', label: 'Content' }
	];

	let dialogEl: HTMLDialogElement | undefined;
	const open = $derived(isSettingsOpen());
	const activeTab = $derived(getActiveSettingsTab());

	$effect(() => {
		if (open) dialogEl?.showModal();
		else dialogEl?.close();
	});
</script>

<dialog bind:this={dialogEl} class="modal" onclose={closeSettings}>
	<div class="modal-box flex max-w-2xl gap-4 p-0">
		<ul class="menu w-40 shrink-0 gap-1 border-r border-base-300 p-3">
			{#each tabs as tab (tab.id)}
				<li>
					<button
						type="button"
						class:menu-active={activeTab === tab.id}
						onclick={() => setActiveSettingsTab(tab.id)}
					>
						{tab.label}
					</button>
				</li>
			{/each}
		</ul>
		<div class="flex-1 p-4">
			{#if activeTab === 'profile'}
				<ProfileTab />
			{:else if activeTab === 'backup'}
				<BackupTab />
			{:else if activeTab === 'general'}
				<GeneralTab />
			{:else if activeTab === 'network'}
				<NetworkTab />
			{:else if activeTab === 'ai'}
				<AiTab />
			{:else if activeTab === 'content'}
				<ContentTab />
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Close settings">close</button>
	</form>
</dialog>
