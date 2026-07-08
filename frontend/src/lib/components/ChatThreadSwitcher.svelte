<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import type { Chat } from '$lib/types';
	import { getChats } from '$lib/state/chats.svelte';

	interface Props {
		chat: Chat;
	}

	let { chat }: Props = $props();

	// Siblings = other chats with the same character, oldest first, so prev/next
	// arrows move through them predictably (see build-order design discussion:
	// "quickly switch between them with arrow").
	const siblings = $derived(
		getChats()
			.filter((c) => c.character_id === chat.character_id)
			.sort((a, b) => a.created_at - b.created_at)
	);
	const index = $derived(siblings.findIndex((c) => c.id === chat.id));

	function go(delta: number) {
		const next = siblings[index + delta];
		if (next) goto(`${base}/chats/${next.id}`);
	}
</script>

{#if siblings.length > 1}
	<div class="flex items-center gap-2 text-sm">
		<button
			class="btn btn-xs"
			type="button"
			onclick={() => goto(`${base}/characters/${chat.character_id}`)}
		>
			Back
		</button>
		<button class="btn btn-xs" type="button" disabled={index <= 0} onclick={() => go(-1)}>
			‹
		</button>
		<span class="opacity-70">Conversation {index + 1} of {siblings.length}</span>
		<button
			class="btn btn-xs"
			type="button"
			disabled={index >= siblings.length - 1}
			onclick={() => go(1)}
		>
			›
		</button>
	</div>
{/if}
