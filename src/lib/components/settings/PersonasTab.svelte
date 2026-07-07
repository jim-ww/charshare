<script lang="ts">
	import { untrack } from 'svelte';
	import type { Persona } from '$lib/types';
	import {
		createPersona,
		deletePersona,
		exportPersona,
		getPersonas,
		importPersonaDraft,
		initPersonas,
		isPersonasReady,
		personaDisplayName,
		updatePersona
	} from '$lib/state/personas.svelte';

	untrack(() => void initPersonas());

	const ready = $derived(isPersonasReady());
	const personas = $derived(getPersonas());

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let error = $state<string | null>(null);

	let creatingName = $state('');
	let creatingDescription = $state('');

	let importInput = $state<HTMLInputElement>();

	function startEdit(persona: Persona) {
		error = null;
		editingId = persona.id;
		editName = personaDisplayName(persona);
		editDescription = persona.description;
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveEdit() {
		if (!editingId) return;
		const name = editName.trim();
		if (!name) {
			error = "Persona name can't be blank.";
			return;
		}
		await updatePersona(editingId, { name, description: editDescription });
		editingId = null;
	}

	async function handleDelete(id: string) {
		error = null;
		try {
			await deletePersona(id);
			if (editingId === id) editingId = null;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		const name = creatingName.trim();
		if (!name) return;
		await createPersona({ name, description: creatingDescription.trim() });
		creatingName = '';
		creatingDescription = '';
	}

	function handleExport(persona: Persona) {
		const blob = new Blob([exportPersona(persona.id)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${personaDisplayName(persona).replace(/[^a-z0-9_-]+/gi, '_') || 'persona'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportFile(event: Event) {
		error = null;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const draft = importPersonaDraft(await file.text());
			await createPersona(draft);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			input.value = '';
		}
	}
</script>

{#if !ready}
	<p>Loading personas…</p>
{:else}
	<div class="flex flex-col gap-4">
		<div>
			<h3 class="font-semibold">Personas</h3>
			<p class="text-sm opacity-70">
				Masks you can wear while chatting with characters. Personas are stored only in this
				browser — they're never published.
			</p>
		</div>

		{#if error}
			<p class="text-error text-sm">{error}</p>
		{/if}

		<ul class="flex flex-col gap-2">
			{#each personas as persona (persona.id)}
				<li class="rounded-box bg-base-200 p-3">
					{#if editingId === persona.id}
						<div class="flex flex-col gap-2">
							<input class="input input-bordered input-sm w-full" bind:value={editName} />
							<textarea
								class="textarea textarea-bordered textarea-sm w-full"
								placeholder="Description (optional)"
								bind:value={editDescription}
							></textarea>
							<div class="flex gap-2">
								<button class="btn btn-sm btn-primary" type="button" onclick={saveEdit}>Save</button>
								<button class="btn btn-sm" type="button" onclick={cancelEdit}>Cancel</button>
							</div>
						</div>
					{:else}
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="font-medium">{personaDisplayName(persona)}</p>
								{#if persona.description}
									<p class="text-sm opacity-70">{persona.description}</p>
								{/if}
							</div>
							<div class="flex shrink-0 gap-1">
								<button class="btn btn-xs" type="button" onclick={() => startEdit(persona)}>Edit</button>
								<button class="btn btn-xs" type="button" onclick={() => handleExport(persona)}
									>Export</button
								>
								<button
									class="btn btn-xs btn-error"
									type="button"
									disabled={personas.length <= 1}
									onclick={() => handleDelete(persona.id)}
								>
									Delete
								</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="divider"></div>

		<form class="flex flex-col gap-2" onsubmit={handleCreate}>
			<h3 class="font-semibold">New persona</h3>
			<input class="input input-bordered input-sm w-full" placeholder="Name" bind:value={creatingName} />
			<textarea
				class="textarea textarea-bordered textarea-sm w-full"
				placeholder="Description (optional)"
				bind:value={creatingDescription}
			></textarea>
			<button class="btn btn-sm btn-primary self-start" type="submit" disabled={!creatingName.trim()}>
				Create
			</button>
		</form>

		<div>
			<h3 class="font-semibold">Import a persona</h3>
			<input
				bind:this={importInput}
				class="file-input file-input-bordered file-input-sm mt-2"
				type="file"
				accept="application/json,.json"
				onchange={handleImportFile}
			/>
		</div>
	</div>
{/if}
