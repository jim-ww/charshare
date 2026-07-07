<script lang="ts">
	import { untrack } from 'svelte';
	import type { CharacterId } from '$lib/types';
	import {
		createPersona,
		getPersonas,
		getSelectedPersonaId,
		initPersonas,
		isPersonasReady,
		personaDisplayName,
		selectPersonaForCharacter
	} from '$lib/state/personas.svelte';
	import { openSettings } from '$lib/state/settingsModal.svelte';

	interface Props {
		characterId: CharacterId;
	}

	let { characterId }: Props = $props();

	untrack(() => void initPersonas());

	const personas = $derived(getPersonas());
	const ready = $derived(isPersonasReady());
	const selectedId = $derived(ready ? getSelectedPersonaId(characterId) : undefined);
	const selected = $derived(personas.find((p) => p.id === selectedId));

	let dialogEl: HTMLDialogElement | undefined;
	let search = $state('');
	let creatingName = $state('');
	let creatingDescription = $state('');

	const filtered = $derived(
		personas.filter((p) => personaDisplayName(p).toLowerCase().includes(search.trim().toLowerCase()))
	);

	function open() {
		search = '';
		creatingName = '';
		creatingDescription = '';
		dialogEl?.showModal();
	}

	function manage() {
		dialogEl?.close();
		openSettings('personas');
	}

	async function choose(id: string) {
		await selectPersonaForCharacter(characterId, id);
		dialogEl?.close();
	}

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		const name = creatingName.trim();
		if (!name) return;
		const persona = await createPersona({ name, description: creatingDescription.trim() });
		await selectPersonaForCharacter(characterId, persona.id);
		dialogEl?.close();
	}
</script>

<button
	class="btn btn-block btn-outline btn-secondary rounded-full"
	type="button"
	onclick={open}
>
	Playing as {selected ? personaDisplayName(selected) : '…'}
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
			<h3 class="text-lg font-semibold">Choose your persona</h3>
			<button class="btn btn-xs btn-ghost" type="button" onclick={manage}>Manage personas</button>
		</div>
		<input class="input input-bordered w-full" placeholder="Search personas…" bind:value={search} />
		<ul class="flex max-h-48 flex-col gap-1 overflow-y-auto">
			{#each filtered as persona (persona.id)}
				<li>
					<button
						type="button"
						class="btn btn-sm btn-block justify-start"
						class:btn-primary={persona.id === selectedId}
						onclick={() => choose(persona.id)}
					>
						{personaDisplayName(persona)}
					</button>
				</li>
			{:else}
				<li class="px-1 py-2 text-sm opacity-60">No personas match.</li>
			{/each}
		</ul>

		<div class="divider">or create a new one</div>
		<form class="flex flex-col gap-2" onsubmit={handleCreate}>
			<input class="input input-bordered w-full" placeholder="Name" bind:value={creatingName} />
			<textarea
				class="textarea textarea-bordered w-full"
				placeholder="Description (optional)"
				bind:value={creatingDescription}
			></textarea>
			<button class="btn btn-primary self-start" type="submit" disabled={!creatingName.trim()}>
				Create &amp; use
			</button>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Close persona selector">close</button>
	</form>
</dialog>
