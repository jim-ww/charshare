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

	// /chats/[id] renders its own sidebar-toggle button inline in its header
	// row, so it costs no extra vertical space. The bare /chats index has no
	// such header, so it needs this standalone bar to reach the sidebar at all.
	const showToggleBar = $derived(!page.params.id);
</script>

<div
	class="flex h-[calc(100vh-4rem)] bg-cover bg-center"
	style={chat?.active_background ? `background-image: url('${chat.active_background}')` : ''}
>
	<ChatSidebar />
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden" style="box-shadow: -4px 0 12px -4px rgba(0, 0, 0, 0.35);">
		{#if showToggleBar}
			<div class="flex shrink-0 items-center border-b border-base-300 bg-base-100/80 px-2 py-1.5 backdrop-blur md:hidden">
				<button
					class="btn btn-sm btn-ghost gap-2"
					type="button"
					onclick={toggleChatSidebar}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4"
					>
						<rect width="18" height="18" x="3" y="3" rx="2" />
						<path d="M9 3v18" />
					</svg>
					Chats
				</button>
			</div>
		{/if}
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>
