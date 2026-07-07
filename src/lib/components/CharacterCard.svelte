<script lang="ts">
	import type { Character } from "$lib/types";

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();
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
