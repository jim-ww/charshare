<script lang="ts">
	import { goto } from '$app/navigation';
	import type { CharacterDraft } from '$lib/types';
	import { createOrEditCharacter } from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';

	let localOnly = $state(true);

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft, { localOnly });
		await goto('/characters');
	}
</script>

<div class="p-4">
	<h1 class="mx-auto mb-4 max-w-6xl text-xl font-semibold">New character</h1>
	<label class="label mx-auto mb-4 flex max-w-6xl cursor-pointer justify-start gap-2">
		<input type="checkbox" class="checkbox" bind:checked={localOnly} />
		<span class="label-text">
			Keep local-only (not published to the network — no comments, only visible to you)
		</span>
	</label>
	<CharacterForm submitLabel="Create character" onsubmit={handleSubmit} />
</div>
