<script lang="ts">
	import type { Character } from "$lib/types";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();
	let expanded = $state(false);
</script>

<div class="aspect-square w-28 shrink-0 sm:w-56">
	<CharacterImageViewer
		images={character.image_urls}
		name={character.name}
		class="rounded-xl shadow-lg ring-2 ring-base-100"
		aspectSquare
		onImageClick={() => (expanded = true)}
	/>
</div>

{#if expanded}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
		role="button"
		tabindex="0"
		onclick={() => (expanded = false)}
		onkeydown={(e) => e.key === "Escape" && (expanded = false)}
	>
		<div
			class="aspect-square w-full max-w-lg"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
		>
			<CharacterImageViewer
				images={character.image_urls}
				name={character.name}
				class="rounded-2xl shadow-2xl"
				aspectSquare
				onImageClick={() => (expanded = false)}
			/>
		</div>
	</div>
{/if}
