<script lang="ts">
	import { getPendingConfirm, resolvePendingConfirm } from '$lib/state/confirmDialog.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	const pending = $derived(getPendingConfirm());
</script>

{#if pending}
	<ConfirmDialog
		open={true}
		title={pending.title}
		message={pending.message}
		confirmLabel={pending.confirmLabel}
		danger={pending.danger}
		onconfirm={() => resolvePendingConfirm(true)}
		oncancel={() => resolvePendingConfirm(false)}
	/>
{/if}
