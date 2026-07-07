<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentUser, initAuth, isAuthReady } from '$lib/state/auth.svelte';
	import { getMyProfile, initProfile, isProfileReady, saveProfile } from '$lib/state/profile.svelte';
	import {
		createOrEditCharacter,
		deleteMyCharacter,
		forkCharacter,
		getMyCharacters,
		initCharacters,
		isCharactersReady
	} from '$lib/state/characters.svelte';
	import type { Character, CharacterId } from '$lib/types';
	import { browseByTag } from '$lib/gun/browse';

	onMount(() => {
		initAuth();
		initProfile();
		initCharacters();
	});

	const ready = $derived(isAuthReady());
	const user = $derived(getCurrentUser());
	const profileReady = $derived(isProfileReady());

	let username = $state('');
	let description = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let loadedFromProfile = false;

	// Seed the form from the loaded profile exactly once, so typing doesn't
	// get clobbered by re-derivation on every profile-state read.
	$effect(() => {
		if (profileReady && !loadedFromProfile) {
			const profile = getMyProfile();
			username = profile?.username ?? '';
			description = profile?.description ?? '';
			loadedFromProfile = true;
		}
	});

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		saveError = null;
		try {
			await saveProfile({ username, description });
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	const charactersReady = $derived(isCharactersReady());
	const characters = $derived(getMyCharacters());

	let characterName = $state('');
	let characterSaving = $state(false);
	let characterError = $state<string | null>(null);
	let editingId = $state<CharacterId | null>(null);

	function startEdit(id: CharacterId, name: string) {
		editingId = id;
		characterName = name;
	}

	function cancelEdit() {
		editingId = null;
		characterName = '';
	}

	const emptyDraftFields = {
		image_url: '',
		description: '',
		personality: '',
		scenario: '',
		tags: [],
		nsfw: false,
		language: '',
		system_prompt: '',
		first_message: '',
		alternate_greetings: [],
		comments_enabled: true
	};

	async function handleCharacterSubmit(event: SubmitEvent) {
		event.preventDefault();
		characterSaving = true;
		characterError = null;
		try {
			await createOrEditCharacter({
				...emptyDraftFields,
				id: editingId ?? undefined,
				name: characterName
			});
			cancelEdit();
		} catch (err) {
			characterError = err instanceof Error ? err.message : String(err);
		} finally {
			characterSaving = false;
		}
	}

	async function handleDelete(id: CharacterId) {
		await deleteMyCharacter(id);
	}

	async function handleFork(id: CharacterId) {
		await forkCharacter(id);
	}

	let browseTag = $state('');
	let browsing = $state(false);
	let browseResults = $state<Character[]>([]);
	let browseSearched = $state(false);

	async function handleBrowse(event: SubmitEvent) {
		event.preventDefault();
		if (!browseTag.trim()) return;
		browsing = true;
		try {
			browseResults = await browseByTag(browseTag.trim());
			browseSearched = true;
		} finally {
			browsing = false;
		}
	}
</script>

{#if !ready}
	<p>Loading identity…</p>
{:else}
	<div role="alert" class="alert alert-info max-w-md">
		<div>
			<p>
				Signed in as <code class="break-all">{user}</code>
			</p>
			<p class="text-sm opacity-70">
				This identity lives only in this browser. There's no recovery if it's lost.
			</p>
		</div>
	</div>

	<div class="mt-6 max-w-md">
		<h2 class="text-lg font-semibold">Profile</h2>
		{#if !profileReady}
			<p>Loading profile…</p>
		{:else}
			<form class="mt-2 flex flex-col gap-3" onsubmit={handleSave}>
				<label class="form-control">
					<span class="label-text">Username</span>
					<input class="input input-bordered w-full" bind:value={username} />
				</label>
				<label class="form-control">
					<span class="label-text">Description</span>
					<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
				</label>
				<button class="btn btn-primary" type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				{#if saveError}
					<p class="text-error text-sm">{saveError}</p>
				{/if}
			</form>
		{/if}
	</div>

	<div class="mt-6 max-w-md">
		<h2 class="text-lg font-semibold">Characters</h2>
		{#if !charactersReady}
			<p>Loading characters…</p>
		{:else}
			<ul class="mt-2 flex flex-col gap-2">
				{#each characters as character (character.id)}
					<li class="flex items-center justify-between gap-2 rounded border p-2">
						<span class:line-through={character.deleted}>{character.name} (v{character.version})</span>
						<div class="flex gap-1">
							<button class="btn btn-xs" onclick={() => startEdit(character.id, character.name)}>Edit</button>
							<button class="btn btn-xs" onclick={() => handleFork(character.id)}>Fork</button>
							<button class="btn btn-xs btn-error" onclick={() => handleDelete(character.id)}>Delete</button>
						</div>
					</li>
				{/each}
			</ul>

			<form class="mt-3 flex flex-col gap-3" onsubmit={handleCharacterSubmit}>
				<label class="form-control">
					<span class="label-text">{editingId ? 'Edit character name' : 'New character name'}</span>
					<input class="input input-bordered w-full" bind:value={characterName} />
				</label>
				<div class="flex gap-2">
					<button class="btn btn-primary" type="submit" disabled={characterSaving}>
						{characterSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create character'}
					</button>
					{#if editingId}
						<button class="btn" type="button" onclick={cancelEdit}>Cancel</button>
					{/if}
				</div>
				{#if characterError}
					<p class="text-error text-sm">{characterError}</p>
				{/if}
			</form>
		{/if}
	</div>

	<div class="mt-6 max-w-md">
		<h2 class="text-lg font-semibold">Browse by tag</h2>
		<form class="mt-2 flex gap-2" onsubmit={handleBrowse}>
			<input class="input input-bordered w-full" placeholder="tag" bind:value={browseTag} />
			<button class="btn btn-primary" type="submit" disabled={browsing}>
				{browsing ? 'Searching…' : 'Search'}
			</button>
		</form>
		{#if browseSearched}
			<ul class="mt-2 flex flex-col gap-2">
				{#each browseResults as character (character.id)}
					<li class="rounded border p-2">{character.name}</li>
				{:else}
					<li class="text-sm opacity-70">No characters found for that tag.</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
