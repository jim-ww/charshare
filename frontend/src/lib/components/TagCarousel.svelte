<script lang="ts">
	import { PREDEFINED_TAGS } from "$lib/data/tags";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		selected: Set<string>;
		ontoggle: (tag: string) => void;
	}

	let { selected, ontoggle }: Props = $props();

	// A flat wrapping cloud reads better than a scroll strip for a list this
	// short — collapsed to a first slice so the common case stays compact,
	// with an explicit expander rather than a clipped/faded overflow.
	const COLLAPSED_COUNT = 16;
	let showAll = $state(false);
	const visibleTags = $derived(
		showAll ? PREDEFINED_TAGS : PREDEFINED_TAGS.slice(0, COLLAPSED_COUNT),
	);

	// Selected tags that aren't in the predefined list — typed in via the
	// custom-tag field below. Shown in their own row so it's clear the app
	// isn't limited to the predefined set, and so a custom pick has somewhere
	// to keep rendering (it wouldn't otherwise show up in visibleTags at all).
	const customTags = $derived(
		[...selected].filter((t) => !PREDEFINED_TAGS.some((p) => p.name === t)),
	);

	let customInput = $state("");

	function addCustomTag() {
		const tag = customInput.trim().toLowerCase().replace(/\s+/g, "-");
		if (!tag) return;
		if (!selected.has(tag)) ontoggle(tag);
		customInput = "";
	}
</script>

{#snippet tagChip(name: string, description: string | undefined)}
	<label
		class="badge badge-lg cursor-pointer gap-1.5 whitespace-nowrap"
		class:badge-primary={selected.has(name)}
		title={description ?? name}
	>
		<input
			type="checkbox"
			class="checkbox checkbox-xs"
			checked={selected.has(name)}
			onchange={() => ontoggle(name)}
		/>
		{name}
	</label>
{/snippet}

<div class="flex w-full max-w-3xl flex-col gap-2">
	{#if customTags.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs opacity-60">{m.tag_carousel_your_tags()}</span>
			{#each customTags as tag (tag)}
				{@render tagChip(tag, undefined)}
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap justify-center gap-2">
		{#each visibleTags as tag (tag.name)}
			{@render tagChip(tag.name, tag.description)}
		{/each}
	</div>

	<div class="flex flex-wrap items-center justify-center gap-3">
		{#if PREDEFINED_TAGS.length > COLLAPSED_COUNT}
			<button
				type="button"
				class="link link-hover text-xs"
				onclick={() => (showAll = !showAll)}
			>
				{showAll
					? m.tag_carousel_show_less()
					: m.tag_carousel_show_all({ count: String(PREDEFINED_TAGS.length) })}
			</button>
		{/if}
		<form
			class="flex items-center gap-1"
			onsubmit={(e) => {
				e.preventDefault();
				addCustomTag();
			}}
		>
			<input
				class="input input-bordered input-xs w-32"
				placeholder={m.tag_carousel_custom_placeholder()}
				bind:value={customInput}
			/>
			<button type="submit" class="btn btn-ghost btn-xs" disabled={!customInput.trim()}>
				{m.tag_carousel_custom_add()}
			</button>
		</form>
	</div>
</div>
