<script lang="ts">
	import { untrack } from 'svelte';
	import { pushState } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';

	/** One form for setting/changing the local-data encryption passphrase,
	 *  instead of chaining separate PromptDialogs for "current"/"new"/
	 *  "confirm" — the Wails webview's native <dialog> close/reopen timing
	 *  made a chained-dialogs version unreliable (see PromptDialog.svelte's
	 *  suppressNextClose comment; in practice it still misbehaved under
	 *  Wails, hiding after the first step). One dialog with all the fields
	 *  needed for a given operation avoids reopening the dialog at all.
	 *
	 *  No separate "confirm passphrase" field — a reveal ("eye") toggle per
	 *  field catches the same typos a retyped-confirmation would, with one
	 *  less field to fill in. */
	interface Props {
		open: boolean;
		title: string;
		requireCurrent: boolean;
		onconfirm: (values: { current?: string; next: string }) => void;
		oncancel: () => void;
	}

	let { open, title, requireCurrent, onconfirm, oncancel }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined;
	let current = $state('');
	let next = $state('');
	let showCurrent = $state(false);
	let showNext = $state(false);
	let currentInputEl: HTMLInputElement | undefined;
	let nextInputEl: HTMLInputElement | undefined;

	$effect(() => {
		if (open) {
			untrack(() => {
				current = '';
				next = '';
				showCurrent = false;
				showNext = false;
			});
			dialogEl?.showModal();
			(requireCurrent ? currentInputEl : nextInputEl)?.focus();
		} else {
			dialogEl?.close();
		}
	});

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
		pushState('', { passphraseSetupDialog: true });
		ownsHistoryEntry = true;
		return () => {
			if (ownsHistoryEntry) {
				ownsHistoryEntry = false;
				history.back();
			}
		};
	});

	// See PromptDialog.svelte's suppressNextClose for why this exists — the
	// dialog's own trailing `close` event (fired after a successful confirm
	// sets `open` false) must not also be treated as a cancel.
	let suppressNextClose = false;

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (requireCurrent && !current.trim()) return;
		if (!next.trim()) return;
		suppressNextClose = true;
		onconfirm(requireCurrent ? { current: current.trim(), next } : { next });
	}

	function handleClose() {
		if (suppressNextClose) {
			suppressNextClose = false;
			return;
		}
		oncancel();
	}

	const canSubmit = $derived((!requireCurrent || current.trim() !== '') && next.trim() !== '');
</script>

{#snippet eyeIcon(shown: boolean)}
	{#if shown}
		<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6 0-9.9-5.5-10.6-8 .3-1.08 1.2-3.03 2.8-4.72M9.9 4.24A10.6 10.6 0 0 1 12 4c6 0 9.9 5.5 10.6 8a12.6 12.6 0 0 1-2.16 3.68" />
			<path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
			<path d="M1 1l22 22" />
		</svg>
	{:else}
		<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M1.4 12S5 4 12 4s10.6 8 10.6 8-3.6 8-10.6 8S1.4 12 1.4 12Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	{/if}
{/snippet}

<dialog bind:this={dialogEl} class="modal" onclose={handleClose}>
	<div class="modal-box max-h-[90vh] overflow-y-auto">
		<h3 class="text-lg font-semibold">{title}</h3>
		<form class="mt-3 flex flex-col gap-3" onsubmit={handleSubmit}>
			{#if requireCurrent}
				<label class="input input-bordered flex w-full items-center gap-2">
					<input
						bind:this={currentInputEl}
						type={showCurrent ? 'text' : 'password'}
						class="grow"
						bind:value={current}
						placeholder={m.data_tab_encryption_current_passphrase_title()}
						onkeydown={(e) => e.key === 'Escape' && oncancel()}
					/>
					<button
						type="button"
						class="cursor-pointer opacity-60 hover:opacity-100"
						aria-label={m.passphrase_field_toggle_visibility()}
						onclick={() => (showCurrent = !showCurrent)}
					>
						{@render eyeIcon(showCurrent)}
					</button>
				</label>
			{/if}
			<label class="input input-bordered flex w-full items-center gap-2">
				<input
					bind:this={nextInputEl}
					type={showNext ? 'text' : 'password'}
					class="grow"
					bind:value={next}
					placeholder={m.data_tab_encryption_new_passphrase_title()}
					onkeydown={(e) => e.key === 'Escape' && oncancel()}
				/>
				<button
					type="button"
					class="cursor-pointer opacity-60 hover:opacity-100"
					aria-label={m.passphrase_field_toggle_visibility()}
					onclick={() => (showNext = !showNext)}
				>
					{@render eyeIcon(showNext)}
				</button>
			</label>
			<div class="modal-action">
				<button class="btn btn-sm" type="button" onclick={oncancel}>{m.prompt_dialog_cancel()}</button>
				<button class="btn btn-sm btn-primary" type="submit" disabled={!canSubmit}>
					{m.prompt_dialog_default_confirm()}
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.prompt_dialog_cancel()}>{m.prompt_dialog_close_label()}</button>
	</form>
</dialog>
