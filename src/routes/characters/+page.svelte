<script lang="ts">
	import { onMount } from "svelte";
	import type { Character } from "$lib/types";
	import {
		getMyCharacters,
		isCharactersReady,
	} from "$lib/state/characters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import { browseByTag, browseNetwork, browseByName, browseByAuthor } from "$lib/gun/browse";
	import CharacterCard from "$lib/components/CharacterCard.svelte";
	import { isCharacterHidden } from "$lib/state/preferences.svelte";

	let mineOnly = $state(false);
	let showHidden = $state(false);
	let showNsfw = $state(false);
	let query = $state("");
	let remoteResults = $state<Character[]>([]);
	let networkResults = $state<Character[]>([]);
	let searching = $state(false);
	let searchedQuery = $state("");

	const myCharacters = $derived(
		getMyCharacters().filter((c) => !c.deleted),
	);
	const ready = $derived(isCharactersReady());

	onMount(() => {
		browseNetwork().then((results) => {
			networkResults = results;
		});
	});

	async function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		const q = query.trim();
		if (!q) {
			remoteResults = [];
			searchedQuery = "";
			return;
		}
		searching = true;
		try {
			if (q.startsWith("@")) {
				remoteResults = await browseByAuthor(q.slice(1));
			} else {
				const [byName, byTag] = await Promise.all([
					browseByName(q),
					browseByTag(q),
				]);
				const merged = new Map(
					[...byName, ...byTag].map((c) => [c.id, c]),
				);
				remoteResults = [...merged.values()];
			}
			searchedQuery = q;
		} finally {
			searching = false;
		}
	}

	const results = $derived.by(() => {
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
			list = list.filter((c) => c.author === me || !c.nsfw);
		}
		return list;
	});
</script>

<div class="p-4">
	<div class="mb-6 flex flex-col items-center gap-3">
		<form
			class="flex w-full max-w-md gap-2"
			onsubmit={handleSearch}
		>
			<input
				class="input input-bordered w-full"
				placeholder="Search by name, tag, or @username/@pubkey…"
				bind:value={query}
			/>
			<button
				class="btn btn-primary"
				type="submit"
				disabled={searching}
			>
				{searching ? "Searching…" : "Search"}
			</button>
		</form>
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
					bind:checked={showNsfw}
				/>
				<span class="label-text">Show NSFW</span>
			</label>
		</div>
	</div>

	{#if !ready}
		<p>Loading…</p>
	{:else if results.length === 0}
		<p class="opacity-70">
			{#if mineOnly && !query.trim()}
				You haven't created any characters yet.
			{:else}
				No characters found.
			{/if}
		</p>
	{:else}
		<div
			class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
		>
			{#each results as character (character.id)}
				<CharacterCard {character} />
			{/each}
		</div>
	{/if}
</div>
