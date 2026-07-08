<script lang="ts">
	import { untrack } from "svelte";
	import {
		getPreferences,
		updatePreferences,
	} from "$lib/state/preferences.svelte";

	const preferences = $derived(getPreferences());
	let relaysText = $state(
		untrack(() => preferences.gunRelays.join("\n")),
	);
	let justSaved = $state(false);
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleSave() {
		const relays = relaysText
			.split("\n")
			.map((r) => r.trim())
			.filter(Boolean);
		updatePreferences({ gunRelays: relays });

		justSaved = true;
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			justSaved = false;
		}, 2000);
	}
</script>

<div class="flex h-full flex-col gap-2">
	<span class="label-text">GUN relays (one per line)</span>
	<textarea
		class="textarea textarea-bordered flex-1 resize-none"
		bind:value={relaysText}
	></textarea>
	<p class="text-sm opacity-70">
		Takes effect the next time the app loads.
	</p>
	<div class="flex items-center gap-2">
		<button
			class="btn btn-sm btn-primary self-start"
			type="button"
			onclick={handleSave}>Save</button
		>
		{#if justSaved}
			<span class="text-success text-sm">Saved!</span>
		{/if}
	</div>
</div>
