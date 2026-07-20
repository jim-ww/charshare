<script lang="ts">
	import { PREDEFINED_TAGS, type PredefinedTagType } from "$lib/data/tags";
	import { m } from '$lib/paraglide/messages.js';
	import TagSuggestionsList from "./TagSuggestionsList.svelte";

	interface Props {
		selected: Set<string>;
		ontoggle: (tag: string) => void;
	}

	let { selected, ontoggle }: Props = $props();

	const categoryLabels: Record<PredefinedTagType, () => string> = {
		tone: m.tag_carousel_category_tone,
		dere: m.tag_carousel_category_dere,
		species: m.tag_carousel_category_species,
		setting: m.tag_carousel_category_setting,
		relationship: m.tag_carousel_category_relationship,
		role: m.tag_carousel_category_role,
		dynamic: m.tag_carousel_category_dynamic,
		identity: m.tag_carousel_category_identity,
		origin: m.tag_carousel_category_origin,
		pov: m.tag_carousel_category_pov,
		kink: m.tag_carousel_category_kink,
		misc: m.tag_carousel_category_misc,
	};

	// Categories in first-seen order, so the filter row roughly follows the
	// same "most common first" ordering as the tag list itself.
	const categories = [...new Set(PREDEFINED_TAGS.map((t) => t.type))];

	let activeCategory = $state<PredefinedTagType | null>(null);

	const categoryFilteredTags = $derived(
		activeCategory === null
			? PREDEFINED_TAGS
			: PREDEFINED_TAGS.filter((t) => t.type === activeCategory),
	);

	// A flat wrapping cloud reads better than a scroll strip for a list this
	// short — collapsed to a first slice so the common case stays compact,
	// with an explicit expander rather than a clipped/faded overflow. Once a
	// category is picked the list is already short, so skip collapsing.
	const COLLAPSED_COUNT = 16;
	let showAll = $state(false);
	const visibleTags = $derived(
		activeCategory !== null || showAll
			? categoryFilteredTags
			: categoryFilteredTags.slice(0, COLLAPSED_COUNT),
	);

	// Selected tags that aren't currently rendered in the cloud below — either
	// truly custom (typed in, not in the predefined list at all) or a
	// predefined tag picked via search while collapsed/category-filtered out
	// of view. Shown in their own row so a selection never just disappears.
	const hiddenSelectedTags = $derived(
		[...selected]
			.filter((t) => !visibleTags.some((v) => v.name === t))
			.map((t): { name: string; description?: string } =>
				PREDEFINED_TAGS.find((p) => p.name === t) ?? { name: t },
			),
	);

	let customInput = $state("");
	let customInputEl = $state<HTMLInputElement>();
	let suggestionsOpen = $state(false);
	let suggestionsHighlight = $state(-1);

	const suggestions = $derived.by(() => {
		const query = customInput.trim().toLowerCase();
		// Typing a category name (e.g. "kink") lists every tag in it, instead
		// of only tags whose name happens to contain that string.
		const categoryMatch = categories.find((c) => c === query);
		return PREDEFINED_TAGS.filter(
			(t) =>
				(categoryMatch ? t.type === categoryMatch : t.name.includes(query)) &&
				!selected.has(t.name),
		);
	});

	$effect(() => {
		// Reset the highlight whenever the suggestion list itself changes,
		// so an old index doesn't point at an unrelated tag.
		suggestions;
		suggestionsHighlight = -1;
	});

	function addCustomTag() {
		const tag = customInput.trim().toLowerCase().replace(/\s+/g, "-");
		if (!tag) return;
		if (!selected.has(tag)) ontoggle(tag);
		customInput = "";
	}

	function pickSuggestion(name: string) {
		if (!selected.has(name)) ontoggle(name);
		customInput = "";
		customInputEl?.focus();
	}

	function handleCustomInputKeydown(event: KeyboardEvent) {
		if (!suggestionsOpen || !suggestions.length) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			suggestionsHighlight = (suggestionsHighlight + 1) % suggestions.length;
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			suggestionsHighlight =
				(suggestionsHighlight - 1 + suggestions.length) % suggestions.length;
		} else if (event.key === "Enter" && suggestionsHighlight >= 0) {
			event.preventDefault();
			pickSuggestion(suggestions[suggestionsHighlight].name);
		} else if (event.key === "Escape") {
			suggestionsOpen = false;
		}
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
	{#if hiddenSelectedTags.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs opacity-60">{m.tag_carousel_your_tags()}</span>
			{#each hiddenSelectedTags as tag (tag.name)}
				{@render tagChip(tag.name, tag.description)}
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap justify-center gap-1.5">
		<button
			type="button"
			class="badge badge-md sm:badge-sm cursor-pointer"
			class:badge-neutral={activeCategory === null}
			class:badge-outline={activeCategory !== null}
			onclick={() => (activeCategory = null)}
		>
			{m.tag_carousel_category_all()}
		</button>
		{#each categories as category (category)}
			<button
				type="button"
				class="badge badge-md sm:badge-sm cursor-pointer"
				class:badge-neutral={activeCategory === category}
				class:badge-outline={activeCategory !== category}
				onclick={() => (activeCategory = activeCategory === category ? null : category)}
			>
				{categoryLabels[category]()}
			</button>
		{/each}
	</div>

	<div class="flex flex-wrap justify-center gap-2">
		{#each visibleTags as tag (tag.name)}
			{@render tagChip(tag.name, tag.description)}
		{/each}
	</div>

	<div class="flex flex-wrap items-center justify-center gap-3">
		{#if activeCategory === null && PREDEFINED_TAGS.length > COLLAPSED_COUNT}
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
			<div class="dropdown w-32">
				<input
					bind:this={customInputEl}
					class="input input-bordered input-xs w-32"
					placeholder={m.tag_carousel_custom_placeholder()}
					autocomplete="off"
					bind:value={customInput}
					onfocus={() => (suggestionsOpen = true)}
					onblur={() => setTimeout(() => (suggestionsOpen = false), 150)}
					onkeydown={handleCustomInputKeydown}
				/>
				{#if suggestionsOpen && suggestions.length}
					<TagSuggestionsList
						{suggestions}
						highlight={suggestionsHighlight}
						onhighlight={(i) => (suggestionsHighlight = i)}
						onpick={pickSuggestion}
						class="w-48"
					/>
				{/if}
			</div>
			<button type="submit" class="btn btn-ghost btn-xs" disabled={!customInput.trim()}>
				{m.tag_carousel_custom_add()}
			</button>
		</form>
	</div>
</div>
