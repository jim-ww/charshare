<script lang="ts">
	import { page } from '$app/state';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import { getChat } from '$lib/state/chats.svelte';

	let { children } = $props();

	// The route's :id param is only present under /chats/[id], but reading it
	// here (rather than duplicating this in the page) lets the background
	// cover the sidebar too, not just the message pane.
	const chat = $derived(page.params.id ? getChat(page.params.id) : undefined);

	// On mobile, the chat list and the open chat are mutually exclusive full-
	// screen views (see ChatSidebar's own responsive classes) — no chat
	// selected means "show me the list", not "list plus an empty pane".
	const hasSelectedChat = $derived(!!page.params.id);
</script>

<div
	class="flex h-[calc(100vh-4rem)] bg-cover bg-center"
	style={chat?.active_background ? `background-image: url('${chat.active_background}')` : ''}
>
	<ChatSidebar />
	<div
		class="{hasSelectedChat ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden md:flex"
		style="box-shadow: -4px 0 12px -4px rgba(0, 0, 0, 0.35);"
	>
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>
