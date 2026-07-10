<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
		children?: Snippet;
	}

	let { open, title, message, confirmLabel = m.confirm_dialog_default_confirm(), danger = false, onconfirm, oncancel, children }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined;

	$effect(() => {
		if (open) dialogEl?.showModal();
		else dialogEl?.close();
	});
</script>

<dialog bind:this={dialogEl} class="modal" onclose={oncancel}>
	<div class="modal-box max-h-[90vh] overflow-y-auto">
		<h3 class="text-lg font-semibold">{title}</h3>
		<p class="py-3 text-sm opacity-80">{message}</p>
		{#if children}
			<div class="pb-1">{@render children()}</div>
		{/if}
		<div class="modal-action">
			<button class="btn btn-sm" type="button" onclick={oncancel}>{m.confirm_dialog_cancel()}</button>
			<button
				class="btn btn-sm {danger ? 'btn-error' : 'btn-primary'}"
				type="button"
				onclick={onconfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.confirm_dialog_cancel()}>{m.confirm_dialog_close_label()}</button>
	</form>
</dialog>
