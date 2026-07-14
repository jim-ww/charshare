<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { CharacterDraft } from '$lib/types';
	import {
		createOrEditCharacter,
		importCharacterCardJson,
		importCharacterCardPng,
		importCharacterDraft
	} from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import ChatSiteImportPanel from '$lib/components/ChatSiteImportPanel.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let localOnly = $state(true);
	let importedDraft = $state<CharacterDraft | undefined>(undefined);
	let formKey = $state(0);

	let importDialogEl: HTMLDialogElement | undefined;
	let showImportModal = $state(false);
	let selectedFile = $state<File | null>(null);
	let importError = $state('');
	let importing = $state(false);

	$effect(() => {
		if (showImportModal) importDialogEl?.showModal();
		else importDialogEl?.close();
	});

	async function handleSubmit(draft: CharacterDraft) {
		await createOrEditCharacter(draft, { localOnly });
		await goto(resolve('/characters'));
	}

	function openImportModal() {
		selectedFile = null;
		importError = '';
		showImportModal = true;
	}

	function closeImportModal() {
		showImportModal = false;
	}

	function handleFileSelected(event: Event) {
		selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		importError = '';
	}

	/** Accepts our own JSON export, a raw TavernAI/SillyTavern character-card
	 *  JSON blob, or a character-card PNG (the common distribution format for
	 *  the latter — see import/characterCard.ts) — detected by file type/name
	 *  rather than a separate control, since all three are just "import a
	 *  character file" to the user. */
	async function handleImportConfirm() {
		const file = selectedFile;
		if (!file) return;
		importing = true;
		importError = '';
		try {
			if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
				importedDraft = importCharacterCardPng(new Uint8Array(await file.arrayBuffer()));
			} else {
				const text = await file.text();
				try {
					importedDraft = importCharacterDraft(text);
				} catch {
					importedDraft = importCharacterCardJson(text);
				}
			}
			formKey += 1;
			showImportModal = false;
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Failed to import character.';
		} finally {
			importing = false;
		}
	}

	function handleChatSiteImport(draft: CharacterDraft) {
		importedDraft = draft;
		formKey += 1;
	}
</script>

<div class="p-4">
	<div class="mx-auto mb-4 flex max-w-6xl items-center justify-between">
		<h1 class="text-xl font-semibold">{m.char_new_heading()}</h1>
		<div class="flex items-center gap-2">
			<ChatSiteImportPanel onimport={handleChatSiteImport} />
			<button class="btn btn-sm" type="button" onclick={openImportModal}>
				{m.char_import_json()}
			</button>
		</div>
	</div>
	{#key formKey}
		<CharacterForm
			draft={importedDraft}
			submitLabel={m.char_submit_create()}
			onsubmit={handleSubmit}
			bind:localOnly
			showLocalOnlyToggle
			cancelHref={resolve('/characters')}
		/>
	{/key}
</div>

<dialog bind:this={importDialogEl} class="modal" onclose={closeImportModal}>
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.char_import_json()}</h3>
		<p class="py-3 text-sm opacity-70">{m.char_import_json_formats()}</p>
		<input
			type="file"
			class="file-input file-input-bordered w-full"
			accept="application/json,.json,image/png,.png"
			onchange={handleFileSelected}
		/>
		{#if importError}
			<p class="mt-2 text-sm text-error">{importError}</p>
		{/if}
		<div class="modal-action">
			<button class="btn btn-sm" type="button" onclick={closeImportModal}>
				{m.confirm_dialog_cancel()}
			</button>
			<button
				class="btn btn-sm btn-primary"
				type="button"
				disabled={!selectedFile || importing}
				onclick={handleImportConfirm}
			>
				{importing ? m.char_import_json_importing() : m.char_import_json()}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.confirm_dialog_cancel()}>{m.confirm_dialog_close_label()}</button>
	</form>
</dialog>
