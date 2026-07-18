<script lang="ts">
	import { untrack } from 'svelte';
	import { pushState } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		title: string;
		initialValue?: string;
		confirmLabel?: string;
		inputType?: 'text' | 'password';
		onconfirm: (value: string) => void;
		oncancel: () => void;
	}

	let {
		open,
		title,
		initialValue = '',
		confirmLabel = m.prompt_dialog_default_confirm(),
		inputType = 'text',
		onconfirm,
		oncancel
	}: Props = $props();

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

	// Whether we pushed a history entry for the currently-open dialog — lets
	// the phone/browser Back button close it instead of navigating away,
	// without double-popping history when the user closes it some other way.
	let ownsHistoryEntry = false;

	$effect(() => {
		function handlePopstate() {
			if (!ownsHistoryEntry) return;
			ownsHistoryEntry = false;
			oncancel();
		}
		window.addEventListener('popstate', handlePopstate);
		return () => window.removeEventListener('popstate', handlePopstate);
	});

	$effect(() => {
		if (!open) return;
		pushState('', { promptDialog: true });
		ownsHistoryEntry = true;
		return () => {
			if (ownsHistoryEntry) {
				ownsHistoryEntry = false;
				history.back();
			}
		};
	});

	// The dialog's own `close` event fires on *every* close — including the
	// one that happens right after a successful confirm (onconfirm sets
	// `open` false, which makes the `$effect` above call dialogEl.close()).
	// Without this flag, that trailing close would call `oncancel` too, right
	// after `oncancel`'s caller may have already moved on to a new prompt
	// (e.g. a "confirm passphrase" step chained after "set passphrase") —
	// resolving that brand-new prompt with a stray cancel before the user
	// ever sees it, instead of the confirm-path close being a no-op like it
	// should be.
	let suppressNextClose = false;

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (trimmed) {
			suppressNextClose = true;
			onconfirm(trimmed);
		}
	}

	function handleClose() {
		if (suppressNextClose) {
			suppressNextClose = false;
			return;
		}
		oncancel();
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={handleClose}>
	<div class="modal-box max-h-[90vh] overflow-y-auto">
		<h3 class="text-lg font-semibold">{title}</h3>
		<form class="mt-3 flex flex-col gap-3" onsubmit={handleSubmit}>
			<input
				bind:this={inputEl}
				type={inputType}
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
