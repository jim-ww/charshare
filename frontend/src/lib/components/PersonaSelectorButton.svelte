<script lang="ts">
	import { untrack } from "svelte";
	import type { CharacterId } from "$lib/types";
	import {
		createPersona,
		getPersonas,
		getSelectedPersonaId,
		initPersonas,
		isPersonasReady,
		personaDisplayName,
		selectPersonaForCharacter,
	} from "$lib/state/personas.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		characterId: CharacterId;
	}

	let { characterId }: Props = $props();

	untrack(() => void initPersonas());

	const personas = $derived(getPersonas());
	const ready = $derived(isPersonasReady());
	const selectedId = $derived(
		ready ? getSelectedPersonaId(characterId) : undefined,
	);
	const selected = $derived(personas.find((p) => p.id === selectedId));

	let dialogEl: HTMLDialogElement | undefined;
	let search = $state("");
	let creatingName = $state("");
	let creatingDescription = $state("");

	const filtered = $derived(
		personas.filter((p) =>
			personaDisplayName(p)
				.toLowerCase()
				.includes(search.trim().toLowerCase()),
		),
	);

	function open() {
		search = "";
		creatingName = "";
		creatingDescription = "";
		dialogEl?.showModal();
	}

	function manage() {
		dialogEl?.close();
		openSettings("personas");
	}

	async function choose(id: string) {
		await selectPersonaForCharacter(characterId, id);
		dialogEl?.close();
	}

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		const name = creatingName.trim();
		if (!name) return;
		const persona = await createPersona({
			name,
			description: creatingDescription.trim(),
		});
		await selectPersonaForCharacter(characterId, persona.id);
		dialogEl?.close();
	}
</script>

<button
	class="btn btn-block btn-outline btn-dash rounded-2xl"
	type="button"
	onclick={open}
>
	{m.persona_selector_playing_as()} {selected ? personaDisplayName(selected) : m.persona_selector_placeholder()}
	<svg
		viewBox="0 0 24 24"
		width="14"
		height="14"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M6 9l6 6 6-6" />
	</svg>
</button>

<dialog bind:this={dialogEl} class="modal">
	<div class="modal-box flex flex-col gap-3">
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-lg font-semibold">
				{m.persona_selector_choose_heading()}
			</h3>
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				onclick={manage}>{m.persona_selector_manage()}</button
			>
		</div>
		<input
			class="input input-bordered w-full"
			placeholder={m.persona_selector_search_placeholder()}
			bind:value={search}
		/>
		<ul class="flex max-h-48 flex-col gap-1 overflow-y-auto">
			{#each filtered as persona (persona.id)}
				<li>
					<button
						type="button"
						class="btn btn-sm btn-block justify-start"
						class:btn-primary={persona.id ===
							selectedId}
						onclick={() =>
							choose(persona.id)}
					>
						{personaDisplayName(persona)}
					</button>
				</li>
			{:else}
				<li class="px-1 py-2 text-sm opacity-60">
					{m.persona_selector_no_match()}
				</li>
			{/each}
		</ul>

		<div class="divider">{m.persona_selector_or_create()}</div>
		<form class="flex flex-col gap-2" onsubmit={handleCreate}>
			<input
				class="input input-bordered w-full"
				placeholder={m.persona_selector_name_placeholder()}
				bind:value={creatingName}
			/>
			<textarea
				class="textarea textarea-bordered w-full"
				placeholder={m.persona_selector_description_placeholder()}
				bind:value={creatingDescription}
			></textarea>
			<button
				class="btn btn-primary self-start"
				type="submit"
				disabled={!creatingName.trim()}
			>
				{m.persona_selector_create_and_use()}
			</button>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.persona_selector_close()}>{m.persona_selector_close_label()}</button>
	</form>
</dialog>
