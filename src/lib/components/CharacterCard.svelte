<script lang="ts">
	import { goto } from "$app/navigation";
	import type { Character } from "$lib/types";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import {
		deleteMyCharacter,
		forkCharacter,
	} from "$lib/state/characters.svelte";
	import { createChat, getChats } from "$lib/state/chats.svelte";

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();

	const isMine = $derived(getCurrentUser() === character.author);

	async function handleFork() {
		await forkCharacter(character.id);
	}

	async function handleDelete() {
		await deleteMyCharacter(character.id);
	}

	async function handleChat() {
		const existing = getChats().find(
			(c) => c.character_id === character.id,
		);
		const chat =
			existing ??
			(await createChat(character.id, character.name));
		await goto(`/chats/${chat.id}`);
	}
</script>

<div class="card bg-base-200 shadow-sm">
	{#if character.image_url}
		<figure class="h-32 w-full overflow-hidden">
			<img
				src={character.image_url}
				alt={character.name}
				class="h-full w-full object-cover"
			/>
		</figure>
	{/if}
	<div class="card-body p-4">
		<h3
			class:line-through={character.deleted}
			class="card-title text-base"
		>
			{character.name}
			<span class="text-xs font-normal opacity-60"
				>v{character.version}</span
			>
		</h3>
		{#if character.description}
			<p class="text-sm opacity-80">
				{character.description}
			</p>
		{/if}
		{#if character.tags.length}
			<div class="flex flex-wrap gap-1">
				{#each character.tags as tag (tag)}
					<span class="badge badge-sm">{tag}</span
					>
				{/each}
			</div>
		{/if}
		<div class="card-actions mt-2">
			<button
				class="btn btn-xs btn-primary"
				type="button"
				onclick={handleChat}>Chat</button
			>
			{#if isMine}
				<a
					class="btn btn-xs"
					href={`/characters/${character.id}/edit`}
					>Edit</a
				>
				<button
					class="btn btn-xs btn-error"
					type="button"
					onclick={handleDelete}>Delete</button
				>
			{:else}
				<button
					class="btn btn-xs"
					type="button"
					onclick={handleFork}>Fork</button
				>
			{/if}
		</div>
	</div>
</div>
