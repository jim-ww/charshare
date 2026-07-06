<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentUser, initAuth, isAuthReady } from '$lib/state/auth.svelte';

	onMount(() => {
		initAuth();
	});

	const ready = $derived(isAuthReady());
	const user = $derived(getCurrentUser());
</script>

{#if !ready}
	<p>Loading identity…</p>
{:else}
	<div role="alert" class="alert alert-info max-w-md">
		<div>
			<p>
				Signed in as <code class="break-all">{user}</code>
			</p>
			<p class="text-sm opacity-70">
				This identity lives only in this browser. There's no recovery if it's lost.
			</p>
		</div>
	</div>
{/if}
