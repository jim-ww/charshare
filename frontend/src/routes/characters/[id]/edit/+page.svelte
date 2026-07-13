<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Character, CharacterDraft } from '$lib/types';
	import { subscribeCharacter } from '$lib/nostr/characters';
	import { createOrEditCharacter, getMyCharacters, isCharacterLocalOnly } from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const id = $derived(page.params.id as string);

	let character = $state<Character | null>(null);
	let notFound = $state(false);

	$effect(() => {
		character = null;
		notFound = false;
		const currentId = id;

		// Local-only characters were never published to a relay — fetching them from
		// the network would always report not-found. Their doc only lives in the local
		// "my characters" store.
		const local = getMyCharacters().find((c) => c.id === currentId);
		if (local && isCharacterLocalOnly(currentId)) {
			character = local;
			return;
		}

		return untrack(() =>
			subscribeCharacter(currentId, (result) => {
				if (result.ok) {
					character = result.doc;
					notFound = false;
				} else if (!character) {
					// Only flag not-found while we have nothing to show yet — a relay's
					// `.on()` can fire once with stale/missing local data before a
					// relay answers, then fire again once the real doc syncs in.
					notFound = true;
				}
			})
		);
	});

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft, { localOnly: isCharacterLocalOnly(id) });
		await goto(resolve('/characters'));
	}
</script>

<div class="p-4">
	<h1 class="mx-auto mb-4 max-w-6xl text-xl font-semibold">{m.char_edit_heading()}</h1>
	{#if notFound}
		<p class="text-error">{m.char_not_found()}</p>
	{:else if !character}
		<p>{m.char_list_loading()}</p>
	{:else}
		<CharacterForm initial={character} submitLabel={m.char_submit_save()} onsubmit={handleSubmit} />
	{/if}
</div>
