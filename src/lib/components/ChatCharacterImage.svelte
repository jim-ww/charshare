<script lang="ts">
	import type { Character } from '$lib/types';
	import CharacterImageViewer from './CharacterImageViewer.svelte';

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();
	let expanded = $state(false);
</script>

<div class="mx-auto {expanded ? 'w-48' : 'w-20'} transition-[width]">
	<CharacterImageViewer
		images={character.image_urls}
		name={character.name}
		onImageClick={() => (expanded = !expanded)}
	/>
</div>
