<script lang="ts">
	import { untrack } from "svelte";
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
	import CommentsTab from "./settings/CommentsTab.svelte";
	import { m } from '$lib/paraglide/messages.js';

	const tabs: { id: SettingsTab; label: string }[] = [
		{ id: "account", label: m.settings_tab_account() },
		{ id: "personas", label: m.settings_tab_personas() },
		{ id: "general", label: m.settings_tab_general() },
		{ id: "network", label: m.settings_tab_network() },
		{ id: "ai", label: m.settings_tab_ai() },
		{ id: "content", label: m.settings_tab_content() },
		{ id: "comments", label: m.settings_tab_comments() },
		{ id: "data", label: m.settings_tab_data() },
	];

	let dialogEl: HTMLDialogElement | undefined;
	const open = $derived(isSettingsOpen());
	const activeTab = $derived(getActiveSettingsTab());
	const activeTabLabel = $derived(
		tabs.find((tab) => tab.id === activeTab)?.label ?? "",
	);

	// Mobile-only: drill-down between the section list and the section detail,
	// like the stock Android Settings app. Ignored at `sm:` and up, where both
	// the sidebar and the detail pane are always shown side by side.
	let mobileView = $state<"list" | "detail">("list");

	$effect(() => {
		if (open) {
			dialogEl?.showModal();
			untrack(() => (mobileView = "list"));
		} else {
			dialogEl?.close();
		}
	});

	function selectTab(tab: SettingsTab) {
		setActiveSettingsTab(tab);
		mobileView = "detail";
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={closeSettings}>
	<div
		class="modal-box flex h-full w-full max-w-2xl flex-col gap-0 rounded-none p-0 sm:h-[38rem] sm:rounded-2xl"
	>
		<div
			class="flex shrink-0 items-center gap-2 border-b border-base-300 p-3 sm:hidden"
		>
			{#if mobileView === "detail"}
				<button
					class="btn btn-sm btn-circle btn-ghost"
					type="button"
					aria-label={m.settings_back()}
					onclick={() => (mobileView = "list")}
				>
					‹
				</button>
				<h2 class="flex-1 truncate text-sm font-semibold">
					{activeTabLabel}
				</h2>
			{:else}
				<h2 class="flex-1 text-sm font-semibold">{m.settings_heading()}</h2>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					type="button"
					aria-label={m.settings_close()}
					onclick={closeSettings}
				>
					✕
				</button>
			{/if}
		</div>
		<div class="flex min-h-0 flex-1 sm:flex-row">
			<ul
				class="menu w-full shrink-0 flex-col gap-1 overflow-y-auto p-2 sm:flex sm:w-40 sm:border-r sm:border-base-300 sm:p-3 {mobileView ===
				'list'
					? 'flex'
					: 'hidden'}"
			>
				{#each tabs as tab (tab.id)}
					<li>
						<button
							type="button"
							class:menu-active={activeTab ===
								tab.id}
							onclick={() => selectTab(tab.id)}
						>
							<span class="flex-1">{tab.label}</span>
							<span class="opacity-40 sm:hidden">›</span>
						</button>
					</li>
				{/each}
			</ul>
			<div
				class="flex-1 overflow-y-auto p-4 sm:block {mobileView ===
				'detail'
					? 'block'
					: 'hidden'}"
			>
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
				{:else if activeTab === "comments"}
					<CommentsTab />
				{:else if activeTab === "data"}
					<DataTab />
				{/if}
			</div>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.settings_close()}>{m.settings_close_label()}</button>
	</form>
</dialog>
