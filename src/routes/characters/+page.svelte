<script lang="ts">
	import type { Character } from '$lib/types';
	import { getMyCharacters, isCharactersReady } from '$lib/state/characters.svelte';
	import { browseByTag } from '$lib/gun/browse';
	import CharacterCard from '$lib/components/CharacterCard.svelte';

	type Filter = 'mine' | 'tag';

	let filter = $state<Filter>('mine');
	let tag = $state('');
	let tagResults = $state<Character[]>([]);
	let searching = $state(false);
	let searched = $state(false);

	const myCharacters = $derived(getMyCharacters());
	const ready = $derived(isCharactersReady());

	async function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		if (!tag.trim()) return;
		searching = true;
		try {
			tagResults = await browseByTag(tag.trim());
			searched = true;
		} finally {
			searching = false;
		}
	}
</script>

<div class="p-4">
	<div class="tabs tabs-boxed mb-4 w-fit">
		<button class="tab" class:tab-active={filter === 'mine'} onclick={() => (filter = 'mine')}>
			Mine
		</button>
		<button class="tab" class:tab-active={filter === 'tag'} onclick={() => (filter = 'tag')}>
			Browse by tag
		</button>
	</div>

	{#if filter === 'mine'}
		{#if !ready}
			<p>Loading…</p>
		{:else if myCharacters.length === 0}
			<p class="opacity-70">You haven't created any characters yet.</p>
		{:else}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each myCharacters as character (character.id)}
					<CharacterCard {character} />
				{/each}
			</div>
		{/if}
	{:else}
		<form class="mb-4 flex max-w-md gap-2" onsubmit={handleSearch}>
			<input class="input input-bordered w-full" placeholder="tag" bind:value={tag} />
			<button class="btn btn-primary" type="submit" disabled={searching}>
				{searching ? 'Searching…' : 'Search'}
			</button>
		</form>
		{#if searched}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each tagResults as character (character.id)}
					<CharacterCard {character} />
				{:else}
					<p class="opacity-70">No characters found for that tag.</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>
