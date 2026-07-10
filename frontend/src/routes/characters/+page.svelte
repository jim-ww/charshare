<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import type { Character } from "$lib/types";
	import {
		getMyCharacters,
		isCharacterLocalOnly,
		isCharactersReady,
	} from "$lib/state/characters.svelte";
	import { getSavedCharacters } from "$lib/state/savedCharacters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import CharacterCard from "$lib/components/CharacterCard.svelte";
	import TagCarousel from "$lib/components/TagCarousel.svelte";
	import {
		getPreferences,
		isCharacterHidden,
		updatePreferences,
	} from "$lib/state/preferences.svelte";
	import {
		effectiveQuery,
		getNetworkResults,
		getRemoteResults,
		getSearchQuery,
		getSearchedQuery,
		getSelectedTags,
		matchesQuery,
		refreshNetwork,
		runSearch,
		setSearchQuery,
		setSelectedTags,
		toggleTag,
	} from "$lib/state/search.svelte";
	import { m } from "$lib/paraglide/messages.js";

	type ListFilter = "all" | "mine" | "saved" | "published";
	let listFilter = $state<ListFilter>("all");
	let showHidden = $state(false);
	const showNsfw = $derived(getPreferences().showNsfw);
	const networkResults = $derived(getNetworkResults());
	// Tracks the last "?q="/"?tags=" we actually ran a search for, so
	// navigating here with a new query (e.g. from the NavBar on another page)
	// re-triggers the search exactly once instead of looping against the
	// shared search state.
	let lastRunQuery: string | null = $state(null);
	let lastRunTags: string | null = $state(null);

	const myCharacters = $derived(
		getMyCharacters().filter((c) => !c.deleted),
	);
	// Unlike myCharacters, deliberately not filtered by `!c.deleted` — a saved
	// character stays visible (marked deleted) even once the author tombstones
	// it, per spec: Character Management's "save character locally" behavior.
	const savedCharacters = $derived(getSavedCharacters());
	const savedIds = $derived(new Set(savedCharacters.map((c) => c.id)));
	const ready = $derived(isCharactersReady());

	onMount(() => {
		refreshNetwork();
	});

	$effect(() => {
		const q = page.url.searchParams.get("q") ?? "";
		const tagsParam = page.url.searchParams.get("tags") ?? "";
		if (q !== lastRunQuery || tagsParam !== lastRunTags) {
			lastRunQuery = q;
			lastRunTags = tagsParam;
			setSearchQuery(q);
			setSelectedTags(
				new Set(tagsParam.split(",").filter(Boolean)),
			);
			runSearch();
		}
	});

	/** Toggles a tag and reflects the new selection into the URL (so it's
	 *  shareable/bookmarkable the same way the free-text query already is),
	 *  then re-runs the search immediately — unlike free text, a checkbox
	 *  toggle is itself the "submit" action. */
	function handleToggleTag(tag: string) {
		toggleTag(tag);
		const params = new URLSearchParams(page.url.searchParams);
		const tags = [...getSelectedTags()];
		if (tags.length > 0) params.set("tags", tags.join(","));
		else params.delete("tags");
		lastRunTags = params.get("tags") ?? "";
		goto(`${resolve("/characters")}?${params}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
		runSearch();
	}

	const results = $derived.by(() => {
		const remoteResults = getRemoteResults();
		const searchedQuery = getSearchedQuery();
		const rawQuery = getSearchQuery().trim();
		const isAuthorQuery = rawQuery.startsWith("@");
		// Selected tags don't apply to an "@" author lookup — see runSearch.
		const trimmed = isAuthorQuery ? rawQuery : effectiveQuery();
		const me = getCurrentUser();

		const combined = new Map<string, Character>();

		// "@name"/"@pubkey" author search has no meaningful local text-match
		// equivalent — remoteResults (browseByAuthor) is the whole answer.
		if (!isAuthorQuery) {
			const localMatches = [
				...myCharacters,
				...savedCharacters,
			].filter((c) => !trimmed || matchesQuery(c, trimmed));
			for (const c of localMatches) combined.set(c.id, c);
			for (const c of networkResults) {
				if (!trimmed || matchesQuery(c, trimmed)) {
					if (!combined.has(c.id))
						combined.set(c.id, c);
				}
			}
		}
		if (searchedQuery) {
			for (const c of remoteResults) {
				if (!combined.has(c.id)) combined.set(c.id, c);
			}
		}

		let list = [...combined.values()];
		if (listFilter === "mine")
			list = list.filter((c) => c.author === me);
		else if (listFilter === "saved")
			list = list.filter((c) => savedIds.has(c.id));
		else if (listFilter === "published") {
			list = list.filter((c) => !isCharacterLocalOnly(c.id));
		}
		if (!showHidden) {
			list = list.filter(
				(c) =>
					c.author === me ||
					!isCharacterHidden(c.id),
			);
		}
		if (!showNsfw) {
			list = list.filter((c) => !c.nsfw);
		}
		return list;
	});
</script>

<div class="p-4">
	<div class="mb-6 flex flex-col items-center gap-3">
		<TagCarousel
			selected={getSelectedTags()}
			ontoggle={handleToggleTag}
		/>
		<div
			class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1"
		>
			<label
				class="label cursor-pointer gap-2 py-0"
				title={m.char_list_filter_all_tooltip()}
			>
				<input
					type="radio"
					name="listFilter"
					class="radio radio-sm"
					value="all"
					bind:group={listFilter}
				/>
				<span class="label-text"
					>{m.char_list_filter_all()}</span
				>
			</label>
			<label
				class="label cursor-pointer gap-2 py-0"
				title={m.char_list_mine_only_tooltip()}
			>
				<input
					type="radio"
					name="listFilter"
					class="radio radio-sm"
					value="mine"
					bind:group={listFilter}
				/>
				<span class="label-text"
					>{m.char_list_mine_only()}</span
				>
			</label>
			<label
				class="label cursor-pointer gap-2 py-0"
				title={m.char_list_filter_published_tooltip()}
			>
				<input
					type="radio"
					name="listFilter"
					class="radio radio-sm"
					value="published"
					bind:group={listFilter}
				/>
				<span class="label-text"
					>{m.char_list_filter_published()}</span
				>
			</label>
			<label
				class="label cursor-pointer gap-2 py-0"
				title={m.char_list_saved_only_tooltip()}
			>
				<input
					type="radio"
					name="listFilter"
					class="radio radio-sm"
					value="saved"
					bind:group={listFilter}
				/>
				<span class="label-text"
					>{m.char_list_saved_only()}</span
				>
			</label>

			<label class="label cursor-pointer gap-2 py-0">
				<input
					type="checkbox"
					class="toggle toggle-sm"
					bind:checked={showHidden}
				/>
				<span class="label-text"
					>{m.char_list_show_hidden()}</span
				>
			</label>
			<label class="label cursor-pointer gap-2 py-0">
				<input
					type="checkbox"
					class="toggle toggle-sm toggle-warning"
					checked={showNsfw}
					onchange={(e) =>
						updatePreferences({
							showNsfw: e
								.currentTarget
								.checked,
						})}
				/>
				<span class="label-text"
					>{m.char_list_show_nsfw()}</span
				>
			</label>
		</div>
	</div>

	{#if !ready}
		<p>{m.char_list_loading()}</p>
	{:else if results.length === 0}
		<p class="opacity-70">
			{#if listFilter === "mine" && !getSearchQuery().trim()}
				{m.char_list_empty_mine()}
			{:else}
				{m.char_list_empty_all()}
			{/if}
		</p>
	{:else}
		<div
			class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
		>
			{#each results as character (character.id)}
				<CharacterCard {character} />
			{/each}
		</div>
	{/if}
</div>
