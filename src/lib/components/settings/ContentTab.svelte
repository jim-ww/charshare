<script lang="ts">
	import { untrack } from 'svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';

	const preferences = $derived(getPreferences());
	let tagsText = $state(untrack(() => preferences.blockedTags.join(', ')));

	function handleSave() {
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		updatePreferences({ blockedTags: tags });
	}
</script>

<div class="flex flex-col gap-2">
	<span class="label-text">Blocked tags (comma-separated)</span>
	<input class="input input-bordered w-full" bind:value={tagsText} />
	<p class="text-sm opacity-70">Characters carrying any of these tags are excluded from Browse.</p>
	<button class="btn btn-sm self-start" type="button" onclick={handleSave}>Save</button>
</div>
