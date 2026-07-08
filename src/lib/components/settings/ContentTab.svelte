<script lang="ts">
	import { untrack } from 'svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';

	const preferences = $derived(getPreferences());
	let tagsText = $state(untrack(() => preferences.blockedTags.join(', ')));
	let authorsText = $state(untrack(() => preferences.blockedAuthors.join(', ')));

	function handleSave() {
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const authors = authorsText
			.split(',')
			.map((a) => a.trim())
			.filter(Boolean);
		updatePreferences({ blockedTags: tags, blockedAuthors: authors });
	}
</script>

<div class="flex flex-col gap-2">
	<span class="label-text">Blocked tags (comma-separated)</span>
	<input class="input input-bordered w-full" bind:value={tagsText} />
	<p class="text-sm opacity-70">Characters carrying any of these tags are excluded from Browse.</p>

	<span class="label-text mt-2">Blocked authors (comma-separated pubkeys)</span>
	<input class="input input-bordered w-full" bind:value={authorsText} />
	<p class="text-sm opacity-70">
		Characters published by these authors are excluded from Browse. Local to this browser only —
		you can also block an author directly from their character's card.
	</p>

	<button class="btn btn-sm self-start" type="button" onclick={handleSave}>Save</button>
</div>
