<script lang="ts">
	import type { Character, ChatId } from "$lib/types";
	import {
		getMyCharacters,
		importCharacterDraft,
		createOrEditCharacter,
	} from "$lib/state/characters.svelte";
	import { setChatCharacter } from "$lib/state/chats.svelte";
	import { retryCharacterLoad } from "$lib/state/characterCache.svelte";
	import { browseByName, browseByTag } from "$lib/gun/browse";
	import { queryWords, matchesQuery } from "$lib/state/search.svelte";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		chatId: ChatId;
		missingCharacterId: string;
		/** "error": the character genuinely failed to load — shows the wait/
		 *  timeout framing and a "wait longer" option. "manual": the user opened
		 *  this deliberately (chat list "Choose character") to switch to a
		 *  different character on purpose — no error copy, and cancellable. */
		mode?: "error" | "manual";
		oncancel?: () => void;
		/** Called after a successful reassignment — lets the parent (e.g. drop
		 *  the "pick-character" query param) return to the normal chat view. */
		onpicked?: () => void;
	}

	let {
		chatId,
		missingCharacterId,
		mode = "error",
		oncancel,
		onpicked,
	}: Props = $props();

	let query = $state("");
	let networkResults = $state<Character[]>([]);
	let searching = $state(false);
	let reassigning = $state(false);
	let error = $state<string | null>(null);

	const localResults = $derived(
		query.trim()
			? getMyCharacters().filter((c) =>
					matchesQuery(c, query),
				)
			: getMyCharacters(),
	);

	async function runSearch() {
		const q = query.trim();
		if (!q) {
			networkResults = [];
			return;
		}
		searching = true;
		error = null;
		try {
			const words = queryWords(q);
			const perWord = await Promise.all(
				words.map((w) =>
					Promise.all([
						browseByName(w),
						browseByTag(w),
					]),
				),
			);
			const merged = new Map<string, Character>();
			for (const [byName, byTag] of perWord) {
				for (const c of [...byName, ...byTag])
					merged.set(c.id, c);
			}
			networkResults = [...merged.values()].filter((c) =>
				matchesQuery(c, q),
			);
		} catch (err) {
			error = m.error_generic({
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			searching = false;
		}
	}

	async function pickCharacter(character: Character) {
		reassigning = true;
		error = null;
		try {
			await setChatCharacter(chatId, character.id);
			onpicked?.();
		} catch (err) {
			error = m.error_generic({
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			reassigning = false;
		}
	}

	async function handleUpload(event: Event) {
		error = null;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		reassigning = true;
		try {
			const text = await file.text();
			const draft = importCharacterDraft(text);
			const character = await createOrEditCharacter(draft, {
				localOnly: true,
			});
			await setChatCharacter(chatId, character.id);
			onpicked?.();
		} catch (err) {
			error = m.error_generic({
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			reassigning = false;
			input.value = "";
		}
	}

	function waitLonger() {
		retryCharacterLoad(missingCharacterId);
	}
</script>

<div class="mx-auto flex max-w-lg flex-col gap-4 p-6 text-sm">
	<div>
		{#if mode === "error"}
			<h2 class="font-semibold">
				{m.chat_recovery_error_heading()}
			</h2>
			<p class="opacity-70">
				<code class="text-xs">{missingCharacterId}</code
				> isn't reachable right now — it may have been deleted,
				or no relay with it is currently reachable. The chat
				history is still here; pick a replacement character
				to keep using it, or wait longer in case it's just
				slow to sync.
			</p>
			<button
				type="button"
				class="btn btn-sm btn-soft mt-2"
				onclick={waitLonger}
			>
				{m.chat_recovery_wait_longer()}
			</button>
		{:else}
			<h2 class="font-semibold">
				{m.chat_recovery_manual_heading()}
			</h2>
			<p class="opacity-70">
				{m.chat_recovery_manual_body()}
			</p>
			{#if oncancel}
				<button
					type="button"
					class="btn btn-sm btn-ghost mt-2"
					onclick={oncancel}
				>
					{m.chat_recovery_cancel()}
				</button>
			{/if}
		{/if}
	</div>

	{#if error}
		<p class="text-error">{error}</p>
	{/if}

	<div class="flex flex-col gap-2">
		<label
			class="input input-bordered input-sm flex items-center gap-2"
		>
			<input
				type="text"
				class="grow"
				placeholder={m.chat_recovery_search_placeholder()}
				bind:value={query}
				oninput={() => runSearch()}
			/>
			{#if searching}<span
					class="loading loading-spinner loading-xs"
				></span>{/if}
		</label>

		<div class="flex max-h-64 flex-col gap-1 overflow-y-auto">
			{#each localResults as character (character.id)}
				<button
					type="button"
					class="btn btn-sm btn-ghost justify-start"
					disabled={reassigning}
					onclick={() => pickCharacter(character)}
				>
					{character.name}
					<span class="opacity-50">{m.chat_recovery_yours_badge()}</span>
				</button>
			{/each}
			{#each networkResults as character (character.id)}
				<button
					type="button"
					class="btn btn-sm btn-ghost justify-start"
					disabled={reassigning}
					onclick={() => pickCharacter(character)}
				>
					{character.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="divider text-xs">{m.chat_recovery_or()}</div>

	<div class="flex flex-col gap-1">
		<span class="label-text">{m.chat_recovery_upload_label()}</span>
		<input
			class="file-input file-input-bordered file-input-sm"
			type="file"
			accept="application/json,.json"
			disabled={reassigning}
			onchange={handleUpload}
		/>
	</div>
</div>
