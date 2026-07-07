<script lang="ts">
	import type { Chat } from '$lib/types';
	import { addChatBackground, removeChatBackground, setChatActiveBackground } from '$lib/state/chats.svelte';

	interface Props {
		chat: Chat;
		onclose: () => void;
	}

	let { chat, onclose }: Props = $props();

	let newUrl = $state('');

	function handleAdd() {
		if (!newUrl.trim()) return;
		void addChatBackground(chat.id, newUrl);
		newUrl = '';
	}
</script>

<div class="flex h-full w-72 shrink-0 flex-col gap-4 border-l border-base-300 bg-base-100 p-4">
	<div class="flex items-center justify-between">
		<h3 class="font-semibold">Chat settings</h3>
		<button class="btn btn-xs btn-ghost" type="button" onclick={onclose} aria-label="Close chat settings">
			✕
		</button>
	</div>

	<div class="flex flex-col gap-2">
		<span class="label-text">Background</span>

		<div class="grid grid-cols-3 gap-2">
			<button
				class="btn btn-xs h-12"
				class:btn-primary={chat.active_background === null}
				type="button"
				onclick={() => setChatActiveBackground(chat.id, null)}
			>
				None
			</button>
			{#each chat.backgrounds as url (url)}
				<div class="group relative">
					<button
						class="h-12 w-full rounded border-2 bg-cover bg-center"
						class:border-primary={chat.active_background === url}
						class:border-transparent={chat.active_background !== url}
						style="background-image: url('{url}')"
						type="button"
						title={url}
						onclick={() => setChatActiveBackground(chat.id, url)}
						aria-label="Use this background"
					></button>
					<button
						class="btn btn-xs btn-circle btn-error absolute -top-2 -right-2 hidden group-hover:flex"
						type="button"
						aria-label="Delete background"
						onclick={() => removeChatBackground(chat.id, url)}
					>
						✕
					</button>
				</div>
			{/each}
		</div>

		<div class="mt-2 flex gap-2">
			<input
				class="input input-bordered input-sm flex-1"
				type="url"
				placeholder="https://…"
				bind:value={newUrl}
				onkeydown={(e) => e.key === 'Enter' && handleAdd()}
			/>
			<button class="btn btn-sm" type="button" onclick={handleAdd}>Add</button>
		</div>
	</div>
</div>
