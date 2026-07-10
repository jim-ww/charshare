<script lang="ts">
	import { onDestroy } from "svelte";
	import type { CharacterDraft } from "$lib/types/character";
	import {
		mapProxyChatRequestToDraft,
		parseProxyChatRequestBody,
	} from "$lib/import/proxyChatImport";
	import {
		isWailsDesktop,
		onProxyImportReceived,
		startProxyImportServer,
		stopProxyImportServer,
	} from "$lib/wails";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		onimport: (draft: CharacterDraft) => void;
	}
	let { onimport }: Props = $props();

	const desktop = isWailsDesktop();

	let dialogEl = $state<HTMLDialogElement>();
	let running = $state(false);
	let starting = $state(false);
	let error = $state<string | null>(null);
	let unsubscribe: (() => void) | undefined;

	async function open() {
		error = null;
		dialogEl?.showModal();
		if (running) return;
		starting = true;
		try {
			unsubscribe ??= onProxyImportReceived((raw) => {
				const request = parseProxyChatRequestBody(raw);
				if (!request) {
					error = m.chat_site_import_no_request_error();
					return;
				}
				onimport(
					mapProxyChatRequestToDraft(request),
				);
				close();
			});
			const err = await startProxyImportServer();
			if (err) {
				error = err;
				return;
			}
			running = true;
		} finally {
			starting = false;
		}
	}

	async function close() {
		dialogEl?.close();
		if (running) await stopProxyImportServer();
		running = false;
	}

	onDestroy(() => {
		unsubscribe?.();
		if (running) void stopProxyImportServer();
	});
</script>

{#if desktop}
	<button type="button" class="btn btn-sm" onclick={open}>
		{m.chat_site_import_button()}
	</button>

	<dialog bind:this={dialogEl} class="modal">
		<div class="modal-box">
			<h3 class="text-lg font-bold">
				{m.chat_site_import_heading()}
			</h3>
			<p class="mt-1 text-sm opacity-70">
				{m.chat_site_import_works_with()}
			</p>

			<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm">
				<li>{m.chat_site_import_step1()}</li>
				<li>
					{m.chat_site_import_step2_before()}
					<div
						class="mt-1 flex items-center gap-2"
					>
						<code
							class="rounded bg-base-200 px-2 py-1 text-xs"
						>
							http://localhost:8787/v1/chat/completions
						</code>
					</div>
				</li>
				<li>
					{m.chat_site_import_step3()}
				</li>
				<li>
					{m.chat_site_import_step4()}
				</li>
			</ol>

			<div class="mt-4 flex items-center gap-2">
				{#if starting}
					<span
						class="loading loading-spinner loading-sm"
					></span>
					<span class="text-sm opacity-70"
						>{m.chat_site_import_getting_ready()}</span
					>
				{:else if running}
					<span
						class="loading loading-spinner loading-sm"
					></span>
					<span class="text-sm opacity-70"
						>{m.chat_site_import_waiting()}</span
					>
				{/if}
			</div>
			{#if error}
				<p class="text-error mt-2 text-sm">{error}</p>
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn"
					onclick={close}>{m.chat_site_import_cancel()}</button
				>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			aria-label={m.chat_site_import_close()}
			onclick={close}
		></button>
	</dialog>
{/if}
