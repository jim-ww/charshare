<script lang="ts">
	import { setChatImageIndex } from "$lib/state/chats.svelte";
	import { getExpandedImageViewer, closeImageViewer } from "$lib/state/imageViewer.svelte";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";

	const entry = $derived(getExpandedImageViewer());

	// Clamp the persisted index against the current image count — the
	// character's images can change (or be down to zero) since it was saved.
	function clampedIndex(): number {
		if (!entry) return 0;
		const count = entry.character.image_urls.length;
		if (count === 0) return 0;
		return Math.min(Math.max(entry.chat.image_index, 0), count - 1);
	}

	let index = $state(0);

	$effect(() => {
		index = clampedIndex();
	});

	$effect(() => {
		if (entry) setChatImageIndex(entry.chat.id, index);
	});
</script>

<svelte:window onkeydown={(e) => entry && e.key === "Escape" && closeImageViewer()} />

{#if entry}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
		role="button"
		tabindex="0"
		onclick={closeImageViewer}
	>
		<div role="presentation" onclick={(e) => e.stopPropagation()}>
			<CharacterImageViewer
				images={entry.character.image_urls}
				name={entry.character.name}
				class="shadow-2xl"
				fullSize
				onImageClick={closeImageViewer}
				keyboardNav
				bind:index
			/>
		</div>
	</div>
{/if}
