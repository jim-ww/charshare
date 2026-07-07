<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Character, CharacterDraft } from '$lib/types';
	import { getCharacter } from '$lib/gun/characters';
	import { createOrEditCharacter, getMyCharacters, isCharacterLocalOnly } from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';

	const id = $derived(page.params.id as string);

	let character = $state<Character | null>(null);
	let notFound = $state(false);

	$effect(() => {
		// Local-only characters were never written to GUN — fetching them from
		// GUN would always report not-found. Their doc only lives in the local
		// "my characters" store.
		const local = getMyCharacters().find((c) => c.id === id);
		if (local && isCharacterLocalOnly(id)) {
			character = local;
			return;
		}
		getCharacter(id).then((result) => {
			if (result.ok) character = result.doc;
			else notFound = true;
		});
	});

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft, { localOnly: isCharacterLocalOnly(id) });
		await goto('/characters');
	}
</script>

<div class="p-4">
	<h1 class="mx-auto mb-4 max-w-6xl text-xl font-semibold">Edit character</h1>
	{#if notFound}
		<p class="text-error">Character not found.</p>
	{:else if !character}
		<p>Loading…</p>
	{:else}
		<CharacterForm initial={character} submitLabel="Save changes" onsubmit={handleSubmit} />
	{/if}
</div>
