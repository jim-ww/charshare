<script lang="ts">
	import { untrack } from 'svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { m } from '$lib/paraglide/messages.js';

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
	<span class="label-text">{m.content_tab_blocked_tags_label()}</span>
	<input class="input input-bordered w-full" bind:value={tagsText} />
	<p class="text-sm opacity-70">{m.content_tab_blocked_tags_hint()}</p>

	<span class="label-text mt-2">{m.content_tab_blocked_authors_label()}</span>
	<input class="input input-bordered w-full" bind:value={authorsText} />
	<p class="text-sm opacity-70">
		{m.content_tab_blocked_authors_hint()}
	</p>

	<button class="btn btn-sm self-start" type="button" onclick={handleSave}>{m.content_tab_save()}</button>
</div>
