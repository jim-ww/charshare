<script lang="ts">
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';

	let { children } = $props();
</script>

<div class="flex h-[calc(100vh-4rem)]">
	<ChatSidebar />
	<div class="flex-1 overflow-hidden">
		{@render children()}
	</div>
</div>
