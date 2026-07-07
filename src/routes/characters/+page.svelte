<script lang="ts">
	import type { Character } from "$lib/types";
	import {
		getMyCharacters,
		isCharactersReady,
	} from "$lib/state/characters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import { browseByTag } from "$lib/gun/browse";
	import CharacterCard from "$lib/components/CharacterCard.svelte";

	let mineOnly = $state(false);
	let query = $state("");
	let remoteResults = $state<Character[]>([]);
	let searching = $state(false);
	let searchedTag = $state("");

	const myCharacters = $derived(
		getMyCharacters().filter((c) => !c.deleted),
	);
	const ready = $derived(isCharactersReady());

	async function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		const tag = query.trim();
		if (!tag) {
			remoteResults = [];
			searchedTag = "";
			return;
		}
		searching = true;
		try {
			remoteResults = await browseByTag(tag);
			searchedTag = tag;
		} finally {
			searching = false;
		}
	}

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const me = getCurrentUser();

		const localMatches = myCharacters.filter(
			(c) =>
				!q ||
				c.name.toLowerCase().includes(q) ||
				c.tags.some((t) => t.toLowerCase().includes(q)),
		);

		const combined = new Map<string, Character>();
		for (const c of localMatches) combined.set(c.id, c);
		if (searchedTag) {
			for (const c of remoteResults) {
				if (!combined.has(c.id)) combined.set(c.id, c);
			}
		}

		let list = [...combined.values()];
		if (mineOnly) list = list.filter((c) => c.author === me);
		return list;
	});
</script>

<div class="p-4">
	<div class="mb-4 flex flex-col items-center gap-3">
		<form
			class="flex w-full max-w-md gap-2"
			onsubmit={handleSearch}
		>
			<input
				class="input input-bordered w-full"
				placeholder="Search by name or tag…"
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
		<label class="label cursor-pointer gap-2">
			<input
				type="checkbox"
				class="checkbox"
				bind:checked={mineOnly}
			/>
			<span class="label-text">Mine only</span>
		</label>
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
