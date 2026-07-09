<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import type { CharacterDraft } from '$lib/types';
	import { createOrEditCharacter, importCharacterDraft } from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import ChatSiteImportPanel from '$lib/components/ChatSiteImportPanel.svelte';

	let localOnly = $state(true);
	let importedDraft = $state<CharacterDraft | undefined>(undefined);
	let importError = $state('');
	let importInput = $state<HTMLInputElement>();
	let formKey = $state(0);

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft, { localOnly });
		await goto(`${base}/characters`);
	}

	async function handleImport(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = '';
		try {
			importedDraft = importCharacterDraft(await file.text());
			formKey += 1;
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Failed to import character.';
		} finally {
			if (importInput) importInput.value = '';
		}
	}

	function handleChatSiteImport(draft: CharacterDraft) {
		importError = '';
		importedDraft = draft;
		formKey += 1;
	}
</script>

<div class="p-4">
	<div class="mx-auto mb-4 flex max-w-6xl items-center justify-between">
		<h1 class="text-xl font-semibold">New character</h1>
		<div class="flex items-center gap-2">
			<ChatSiteImportPanel onimport={handleChatSiteImport} />
			<button class="btn btn-sm" type="button" onclick={() => importInput?.click()}>
				Import from JSON
			</button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json"
				class="hidden"
				onchange={handleImport}
			/>
		</div>
	</div>
	{#if importError}
		<p class="mx-auto mb-4 max-w-6xl text-sm text-error">{importError}</p>
	{/if}
	{#key formKey}
		<CharacterForm
			draft={importedDraft}
			submitLabel="Create character"
			onsubmit={handleSubmit}
			bind:localOnly
			showLocalOnlyToggle
		/>
	{/key}
</div>
