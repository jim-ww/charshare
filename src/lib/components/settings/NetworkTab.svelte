<script lang="ts">
	import { untrack } from 'svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';

	const preferences = $derived(getPreferences());
	let relaysText = $state(untrack(() => preferences.gunRelays.join('\n')));

	function handleSave() {
		const relays = relaysText
			.split('\n')
			.map((r) => r.trim())
			.filter(Boolean);
		updatePreferences({ gunRelays: relays });
	}
</script>

<div class="flex flex-col gap-2">
	<span class="label-text">GUN relays (one per line)</span>
	<textarea class="textarea textarea-bordered" rows="4" bind:value={relaysText}></textarea>
	<p class="text-sm opacity-70">Takes effect the next time the app loads.</p>
	<button class="btn btn-sm self-start" type="button" onclick={handleSave}>Save</button>
</div>
