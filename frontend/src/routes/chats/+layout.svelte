<script lang="ts">
	import { page } from '$app/state';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import { getChat } from '$lib/state/chats.svelte';
	import { toggleChatSidebar } from '$lib/state/chatSidebar.svelte';

	let { children } = $props();

	// The route's :id param is only present under /chats/[id], but reading it
	// here (rather than duplicating this in the page) lets the background
	// cover the sidebar too, not just the message pane.
	const chat = $derived(page.params.id ? getChat(page.params.id) : undefined);
</script>

<div
	class="flex h-[calc(100vh-4rem)] bg-cover bg-center"
	style={chat?.active_background ? `background-image: url('${chat.active_background}')` : ''}
>
	<ChatSidebar />
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden" style="box-shadow: -4px 0 12px -4px rgba(0, 0, 0, 0.35);">
		<button
			class="btn btn-sm btn-ghost m-2 w-fit shrink-0 md:hidden"
			type="button"
			onclick={toggleChatSidebar}
		>
			☰ Chats
		</button>
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>
