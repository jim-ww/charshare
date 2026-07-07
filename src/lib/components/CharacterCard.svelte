<script lang="ts">
	import type { Character } from "$lib/types";
	import { isCharacterLocalOnly } from "$lib/state/characters.svelte";

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();
	const localOnly = $derived(isCharacterLocalOnly(character.id));
</script>

<a
	href={`/characters/${character.id}`}
	class="card bg-base-200 shadow-sm transition-shadow hover:shadow-md"
	class:opacity-60={character.deleted}
>
	<figure class="aspect-[3/4] w-full overflow-hidden bg-base-300">
		{#if character.image_url}
			<img
				src={character.image_url}
				alt={character.name}
				class="h-full w-full object-cover"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center text-4xl opacity-30">
				{character.name.charAt(0).toUpperCase()}
			</div>
		{/if}
	</figure>
	<div class="card-body p-4">
		<h3 class:line-through={character.deleted} class="card-title text-base">
			{character.name}
			<span class="badge badge-sm" class:badge-outline={localOnly} class:badge-primary={!localOnly}>
				{localOnly ? "Local only" : "Published"}
			</span>
		</h3>
		{#if character.description}
			<p class="line-clamp-3 text-sm opacity-80">
				{character.description}
			</p>
		{/if}
		{#if character.tags.length}
			<div class="flex flex-wrap gap-1">
				{#each character.tags as tag (tag)}
					<span class="badge badge-sm">{tag}</span>
				{/each}
			</div>
		{/if}
	</div>
</a>
