<script lang="ts">
	import type { Chat, Character } from "$lib/types";
	import { setChatImageIndex } from "$lib/state/chats.svelte";
	import { openImageViewer } from "$lib/state/imageViewer.svelte";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";

	interface Props {
		chat: Chat;
		character: Character;
	}

	let { chat, character }: Props = $props();

	// Clamp the persisted index against the current image count — the
	// character's images can change (or be down to zero) since it was saved.
	function clampedIndex(): number {
		const count = (character.media ?? []).length;
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

<div class="aspect-square w-full shrink-0">
	<CharacterImageViewer
		media={character.media ?? []}
		name={character.name}
		class="rounded-xl shadow-lg ring-2 ring-base-100"
		aspectSquare
		onImageClick={() => openImageViewer(chat, character)}
		bind:index
	/>
</div>
