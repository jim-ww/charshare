<script lang="ts">
	import { goto } from '$app/navigation';
	import type { CharacterDraft } from '$lib/types';
	import { createOrEditCharacter } from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft);
		await goto('/characters');
	}
</script>

<div class="p-4">
	<h1 class="mb-4 text-xl font-semibold">New character</h1>
	<CharacterForm submitLabel="Create character" onsubmit={handleSubmit} />
</div>
