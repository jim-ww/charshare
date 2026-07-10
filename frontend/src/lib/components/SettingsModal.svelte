<script lang="ts">
	import {
		closeSettings,
		getActiveSettingsTab,
		isSettingsOpen,
		setActiveSettingsTab,
		type SettingsTab,
	} from "$lib/state/settingsModal.svelte";
	import AccountTab from "./settings/AccountTab.svelte";
	import PersonasTab from "./settings/PersonasTab.svelte";
	import GeneralTab from "./settings/GeneralTab.svelte";
	import NetworkTab from "./settings/NetworkTab.svelte";
	import AiTab from "./settings/AiTab.svelte";
	import ContentTab from "./settings/ContentTab.svelte";
	import DataTab from "./settings/DataTab.svelte";
	import { m } from '$lib/paraglide/messages.js';

	const tabs: { id: SettingsTab; label: string }[] = [
		{ id: "account", label: m.settings_tab_account() },
		{ id: "personas", label: m.settings_tab_personas() },
		{ id: "general", label: m.settings_tab_general() },
		{ id: "network", label: m.settings_tab_network() },
		{ id: "ai", label: m.settings_tab_ai() },
		{ id: "content", label: m.settings_tab_content() },
		{ id: "data", label: m.settings_tab_data() },
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
	<div class="modal-box flex h-[38rem] w-full max-w-2xl gap-4 p-0">
		<ul
			class="menu w-40 shrink-0 gap-1 border-r border-base-300 p-3"
		>
			{#each tabs as tab (tab.id)}
				<li>
					<button
						type="button"
						class:menu-active={activeTab ===
							tab.id}
						onclick={() =>
							setActiveSettingsTab(
								tab.id,
							)}
					>
						{tab.label}
					</button>
				</li>
			{/each}
		</ul>
		<div class="flex-1 overflow-y-auto p-4">
			{#if activeTab === "account"}
				<AccountTab />
			{:else if activeTab === "personas"}
				<PersonasTab />
			{:else if activeTab === "general"}
				<GeneralTab />
			{:else if activeTab === "network"}
				<NetworkTab />
			{:else if activeTab === "ai"}
				<AiTab />
			{:else if activeTab === "content"}
				<ContentTab />
			{:else if activeTab === "data"}
				<DataTab />
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.settings_close()}>{m.settings_close_label()}</button>
	</form>
</dialog>
