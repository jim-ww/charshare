<script lang="ts">
	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { open, title, message, confirmLabel = 'Confirm', danger = false, onconfirm, oncancel }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined;

	$effect(() => {
		if (open) dialogEl?.showModal();
		else dialogEl?.close();
	});
</script>

<dialog bind:this={dialogEl} class="modal" onclose={oncancel}>
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{title}</h3>
		<p class="py-3 text-sm opacity-80">{message}</p>
		<div class="modal-action">
			<button class="btn btn-sm" type="button" onclick={oncancel}>Cancel</button>
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
		<button aria-label="Cancel">close</button>
	</form>
</dialog>
