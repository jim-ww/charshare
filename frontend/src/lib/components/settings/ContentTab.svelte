<script lang="ts">
	import { untrack } from 'svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import TagCollapse from '$lib/components/TagCollapse.svelte';

	const preferences = $derived(getPreferences());
	const blockedTags = $derived(new Set(preferences.blockedTags));
	let authorsText = $state(untrack(() => preferences.blockedAuthors.join(', ')));

	// Unlike the authors field below, tags persist immediately on toggle —
	// same as the browse-page carousel's own behavior — since a checkbox
	// click is itself the "submit" action, not something to batch.
	function handleToggleTag(tag: string) {
		const tags = blockedTags.has(tag)
			? preferences.blockedTags.filter((t) => t !== tag)
			: [...preferences.blockedTags, tag];
		updatePreferences({ blockedTags: tags });
	}

	function handleSave() {
		const authors = authorsText
			.split(',')
			.map((a) => a.trim())
			.filter(Boolean);
		updatePreferences({ blockedAuthors: authors });
	}
</script>

<div class="flex flex-col gap-2">
	<TagCollapse selected={blockedTags} ontoggle={handleToggleTag} label={m.content_tab_blocked_tags_label()} />
	<p class="text-sm opacity-70">{m.content_tab_blocked_tags_hint()}</p>

	<span class="label-text mt-2">{m.content_tab_blocked_authors_label()}</span>
	<input class="input input-bordered w-full" bind:value={authorsText} />
	<p class="text-sm opacity-70">
		{m.content_tab_blocked_authors_hint()}
	</p>

	<button class="btn btn-sm self-start" type="button" onclick={handleSave}>{m.content_tab_save()}</button>
</div>
