<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<div class="flex h-full flex-col items-center justify-center gap-2 text-center opacity-60">
	<span class="text-4xl">💬</span>
	<p class="text-sm">{m.chats_empty_state()}</p>
</div>
