<script lang="ts">
	import { onMount, untrack } from "svelte";
	import {
		getPreferences,
		updatePreferences,
	} from "$lib/state/preferences.svelte";
	import { getCurrentUser, getKeyring, isAccountRegistered } from "$lib/state/auth.svelte";
	import { getRelayList, publishRelayList } from "$lib/nostr/relayList";
	import { m } from '$lib/paraglide/messages.js';

	const preferences = $derived(getPreferences());
	let relaysText = $state(
		untrack(() => preferences.nostrRelays.join("\n")),
	);
	let justSaved = $state(false);
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;

	// The active relay set is only read at app startup (see
	// +layout.svelte:initCharacters/initChats/initProfile) — a saved change
	// here has no effect on the already-running session until the page
	// reloads, so offer that reload directly instead of leaving the user to
	// notice the hint below and go do it themselves.
	let relaysChanged = $state(false);

	function handleSave() {
		const relays = relaysText
			.split("\n")
			.map((r) => r.trim())
			.filter(Boolean);
		updatePreferences({ nostrRelays: relays });
		relaysChanged = true;

		justSaved = true;
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			justSaved = false;
		}, 2000);
	}

	// Distinct from the app's own default relay set above — this is the
	// user's own NIP-65 relay list (kind 10002), published to the network so
	// other clients following the outbox model know where to look for this
	// user's content.
	const registered = $derived(isAccountRegistered());
	let ownRelaysText = $state("");
	let ownRelaysLoading = $state(true);
	let ownRelaysSaving = $state(false);
	let ownRelaysSaved = $state(false);
	let ownRelaysError = $state<string | null>(null);

	onMount(async () => {
		const pubkey = getCurrentUser();
		if (!pubkey) {
			ownRelaysLoading = false;
			return;
		}
		try {
			const list = await getRelayList(pubkey);
			ownRelaysText = Array.from(new Set([...list.read, ...list.write])).join("\n");
		} finally {
			ownRelaysLoading = false;
		}
	});

	async function handleSaveOwnRelays() {
		const keyring = getKeyring();
		if (!keyring) return;
		const relays = ownRelaysText
			.split("\n")
			.map((r) => r.trim())
			.filter(Boolean);
		ownRelaysSaving = true;
		ownRelaysError = null;
		try {
			await publishRelayList(
				relays.map((url) => ({ url, read: true, write: true })),
				keyring,
			);
			ownRelaysSaved = true;
			setTimeout(() => (ownRelaysSaved = false), 2000);
		} catch (err) {
			ownRelaysError = err instanceof Error ? err.message : String(err);
		} finally {
			ownRelaysSaving = false;
		}
	}
</script>

<div class="flex h-full flex-col gap-6">
	<div class="flex flex-1 flex-col gap-2">
		<span class="label-text">{m.network_tab_relays_label()}</span>
		<textarea
			class="textarea textarea-bordered flex-1 resize-none"
			bind:value={relaysText}
		></textarea>
		<p class="text-sm opacity-70">
			{m.network_tab_hint()}
		</p>
		<div class="flex items-center gap-2">
			<button
				class="btn btn-sm btn-primary self-start"
				type="button"
				onclick={handleSave}>{m.network_tab_save()}</button
			>
			{#if justSaved}
				<span class="text-success text-sm">{m.network_tab_saved()}</span>
			{/if}
		</div>
		{#if relaysChanged}
			<div class="alert alert-warning flex items-center justify-between gap-2 py-2 text-sm">
				<span>{m.network_tab_reload_notice()}</span>
				<button
					class="btn btn-xs shrink-0"
					type="button"
					onclick={() => location.reload()}
				>
					{m.network_tab_reload_button()}
				</button>
			</div>
		{/if}
	</div>

	<div class="divider my-0"></div>

	<div class="flex flex-1 flex-col gap-2">
		<span class="label-text">{m.network_tab_own_relays_label()}</span>
		{#if !registered}
			<p class="text-sm opacity-70">{m.network_tab_own_relays_signin_required()}</p>
		{:else if ownRelaysLoading}
			<p class="text-sm opacity-70">{m.char_list_loading()}</p>
		{:else}
			<textarea
				class="textarea textarea-bordered flex-1 resize-none"
				bind:value={ownRelaysText}
			></textarea>
			<p class="text-sm opacity-70">
				{m.network_tab_own_relays_hint()}
			</p>
			<div class="flex items-center gap-2">
				<button
					class="btn btn-sm btn-primary self-start"
					type="button"
					disabled={ownRelaysSaving}
					onclick={handleSaveOwnRelays}>{m.network_tab_save()}</button
				>
				{#if ownRelaysSaved}
					<span class="text-success text-sm">{m.network_tab_saved()}</span>
				{/if}
				{#if ownRelaysError}
					<span class="text-error text-sm">{ownRelaysError}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
