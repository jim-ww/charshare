<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Character, CharacterDraft } from '$lib/types';
	import { subscribeCharacter } from '$lib/nostr/characters';
	import {
		createOrEditCharacter,
		getMyCharacters,
		importCharacterCardJson,
		importCharacterCardPng,
		importCharacterDraft,
		isCharacterLocalOnly
	} from '$lib/state/characters.svelte';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import ChatSiteImportPanel from '$lib/components/ChatSiteImportPanel.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const id = $derived(page.params.id as string);

	let character = $state<Character | null>(null);
	let notFound = $state(false);
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

	/** Overwrites the form's editable fields with an imported draft while
	 *  keeping this character's own id/version/author/forked_from/timestamps —
	 *  same three formats as the "new character" page (own JSON export, a raw
	 *  TavernAI/SillyTavern character-card JSON blob, or a character-card PNG). */
	function applyImportedDraft(draft: CharacterDraft) {
		if (!character) return;
		character = { ...character, ...draft };
		formKey += 1;
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

	async function handleImportConfirm() {
		const file = selectedFile;
		if (!file) return;
		importing = true;
		importError = '';
		try {
			if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
				applyImportedDraft(importCharacterCardPng(new Uint8Array(await file.arrayBuffer())));
			} else {
				const text = await file.text();
				try {
					applyImportedDraft(importCharacterDraft(text));
				} catch {
					applyImportedDraft(importCharacterCardJson(text));
				}
			}
			showImportModal = false;
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Failed to import character.';
		} finally {
			importing = false;
		}
	}
</script>

<div class="p-4">
	<div class="mx-auto mb-4 flex max-w-6xl items-center justify-between">
		<h1 class="text-xl font-semibold">{m.char_edit_heading()}</h1>
		{#if character}
			<div class="flex items-center gap-2">
				<ChatSiteImportPanel onimport={applyImportedDraft} />
				<button class="btn btn-sm" type="button" onclick={openImportModal}>
					{m.char_import_json()}
				</button>
			</div>
		{/if}
	</div>
	{#if notFound}
		<p class="text-error">{m.char_not_found()}</p>
	{:else if !character}
		<p>{m.char_list_loading()}</p>
	{:else}
		{#key formKey}
			<CharacterForm
				initial={character}
				submitLabel={m.char_submit_save()}
				onsubmit={handleSubmit}
				cancelHref={resolve('/characters/[id]', { id })}
			/>
		{/key}
	{/if}
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
