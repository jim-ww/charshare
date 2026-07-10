<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		title: string;
		initialValue?: string;
		confirmLabel?: string;
		onconfirm: (value: string) => void;
		oncancel: () => void;
	}

	let { open, title, initialValue = '', confirmLabel = m.prompt_dialog_default_confirm(), onconfirm, oncancel }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined;
	let value = $state('');
	let inputEl: HTMLInputElement | undefined;

	$effect(() => {
		if (open) {
			untrack(() => (value = initialValue));
			dialogEl?.showModal();
			inputEl?.focus();
			inputEl?.select();
		} else {
			dialogEl?.close();
		}
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (trimmed) onconfirm(trimmed);
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={oncancel}>
	<div class="modal-box max-h-[90vh] overflow-y-auto">
		<h3 class="text-lg font-semibold">{title}</h3>
		<form class="mt-3 flex flex-col gap-3" onsubmit={handleSubmit}>
			<input
				bind:this={inputEl}
				class="input input-bordered w-full"
				bind:value
				onkeydown={(e) => e.key === 'Escape' && oncancel()}
			/>
			<div class="modal-action">
				<button class="btn btn-sm" type="button" onclick={oncancel}>{m.prompt_dialog_cancel()}</button>
				<button class="btn btn-sm btn-primary" type="submit" disabled={!value.trim()}>
					{confirmLabel}
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.prompt_dialog_cancel()}>{m.prompt_dialog_close_label()}</button>
	</form>
</dialog>
