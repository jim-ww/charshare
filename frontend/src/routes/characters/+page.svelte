<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import type { Character } from "$lib/types";
	import {
		getMyCharacters,
		isCharactersReady,
	} from "$lib/state/characters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import CharacterCard from "$lib/components/CharacterCard.svelte";
	import TagCarousel from "$lib/components/TagCarousel.svelte";
	import {
		getPreferences,
		isCharacterHidden,
		updatePreferences,
	} from "$lib/state/preferences.svelte";
	import {
		addTagToQuery,
		getNetworkResults,
		getRemoteResults,
		getSearchQuery,
		getSearchedQuery,
		refreshNetwork,
		runSearch,
		setSearchQuery,
	} from "$lib/state/search.svelte";

	let mineOnly = $state(false);
	let showHidden = $state(false);
	const showNsfw = $derived(getPreferences().showNsfw);
	const networkResults = $derived(getNetworkResults());
	// Tracks the last "?q=" we actually ran a search for, so navigating here
	// with a new query (e.g. from the NavBar on another page) re-triggers the
	// search exactly once instead of looping against the shared search state.
	let lastRunQuery: string | null = $state(null);

	const myCharacters = $derived(
		getMyCharacters().filter((c) => !c.deleted),
	);
	const ready = $derived(isCharactersReady());

	onMount(() => {
		refreshNetwork();
	});

	$effect(() => {
		const q = page.url.searchParams.get("q") ?? "";
		if (q !== lastRunQuery) {
			lastRunQuery = q;
			setSearchQuery(q);
			runSearch();
		}
	});

	const results = $derived.by(() => {
		const query = getSearchQuery();
		const remoteResults = getRemoteResults();
		const searchedQuery = getSearchedQuery();
		const trimmed = query.trim();
		const isAuthorQuery = trimmed.startsWith("@");
		const q = trimmed.toLowerCase();
		const me = getCurrentUser();

		const combined = new Map<string, Character>();

		// "@name"/"@pubkey" author search has no meaningful local text-match
		// equivalent — remoteResults (browseByAuthor) is the whole answer.
		if (!isAuthorQuery) {
			const localMatches = myCharacters.filter(
				(c) =>
					!q ||
					c.name.toLowerCase().includes(q) ||
					c.tags.some((t) => t.toLowerCase().includes(q)),
			);
			for (const c of localMatches) combined.set(c.id, c);
			for (const c of networkResults) {
				if (
					!q ||
					c.name.toLowerCase().includes(q) ||
					c.tags.some((t) => t.toLowerCase().includes(q))
				) {
					if (!combined.has(c.id)) combined.set(c.id, c);
				}
			}
		}
		if (searchedQuery) {
			for (const c of remoteResults) {
				if (!combined.has(c.id)) combined.set(c.id, c);
			}
		}

		let list = [...combined.values()];
		if (mineOnly) list = list.filter((c) => c.author === me);
		if (!showHidden) {
			list = list.filter((c) => c.author === me || !isCharacterHidden(c.id));
		}
		if (!showNsfw) {
			list = list.filter((c) => !c.nsfw);
		}
		return list;
	});
</script>

<div class="p-4">
	<div class="mb-6 flex flex-col items-center gap-3">
		<TagCarousel onpick={addTagToQuery} />
		<div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
			<label class="label cursor-pointer gap-2 py-0">
				<input
					type="checkbox"
					class="toggle toggle-sm"
					bind:checked={mineOnly}
				/>
				<span class="label-text">Mine only</span>
			</label>
			<label class="label cursor-pointer gap-2 py-0">
				<input
					type="checkbox"
					class="toggle toggle-sm"
					bind:checked={showHidden}
				/>
				<span class="label-text">Show hidden</span>
			</label>
			<label class="label cursor-pointer gap-2 py-0">
				<input
					type="checkbox"
					class="toggle toggle-sm toggle-warning"
					checked={showNsfw}
					onchange={(e) =>
						updatePreferences({
							showNsfw: e.currentTarget.checked,
						})}
				/>
				<span class="label-text">Show NSFW</span>
			</label>
		</div>
	</div>

	{#if !ready}
		<p>Loading…</p>
	{:else if results.length === 0}
		<p class="opacity-70">
			{#if mineOnly && !getSearchQuery().trim()}
				You haven't created any characters yet.
			{:else}
				No characters found.
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
