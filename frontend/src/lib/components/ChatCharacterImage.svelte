<script lang="ts">
	import type { Chat, Character } from "$lib/types";
	import { setChatImageIndex } from "$lib/state/chats.svelte";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";

	interface Props {
		chat: Chat;
		character: Character;
	}

	let { chat, character }: Props = $props();
	let expanded = $state(false);

	// Clamp the persisted index against the current image count — the
	// character's images can change (or be down to zero) since it was saved.
	function clampedIndex(): number {
		const count = character.image_urls.length;
		if (count === 0) return 0;
		return Math.min(Math.max(chat.image_index, 0), count - 1);
	}

	let index = $state(clampedIndex());

	$effect(() => {
		index = clampedIndex();
	});

	$effect(() => {
		setChatImageIndex(chat.id, index);
	});
</script>

<div class="aspect-square w-28 shrink-0 sm:w-56">
	<CharacterImageViewer
		images={character.image_urls}
		name={character.name}
		class="rounded-xl shadow-lg ring-2 ring-base-100"
		aspectSquare
		onImageClick={() => (expanded = true)}
		bind:index
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
		<div role="presentation" onclick={(e) => e.stopPropagation()}>
			<CharacterImageViewer
				images={character.image_urls}
				name={character.name}
				class="shadow-2xl"
				fullSize
				onImageClick={() => (expanded = false)}
				keyboardNav
				bind:index
			/>
		</div>
	</div>
{/if}
