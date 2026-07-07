<script lang="ts">
	import { page } from '$app/state';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import { getChat } from '$lib/state/chats.svelte';

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
	<div class="flex-1 overflow-hidden">
		{@render children()}
	</div>
</div>
