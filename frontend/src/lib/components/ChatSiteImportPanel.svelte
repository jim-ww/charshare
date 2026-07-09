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
					error =
						"That didn't look like a character chat — try sending a message again.";
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
		Import from another chat site
	</button>

	<dialog bind:this={dialogEl} class="modal">
		<div class="modal-box">
			<h3 class="text-lg font-bold">
				Import a character you're chatting with
				elsewhere
			</h3>
			<p class="mt-1 text-sm opacity-70">
				Currently works with: JanitorAI
			</p>

			<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm">
				<li>Open the character's chat on the other site.</li>
				<li>
					Find its setting for a custom AI/API proxy
					(sometimes called "Custom API", "Reverse
					Proxy", or "API endpoint"), and set the
					address to:
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
					Send any message in that chat (even just
					"hi").
				</li>
				<li>
					Come back to this window — it will fill
					in the character's info automatically
					and close on its own.
				</li>
			</ol>

			<div class="mt-4 flex items-center gap-2">
				{#if starting}
					<span
						class="loading loading-spinner loading-sm"
					></span>
					<span class="text-sm opacity-70"
						>Getting ready…</span
					>
				{:else if running}
					<span
						class="loading loading-spinner loading-sm"
					></span>
					<span class="text-sm opacity-70"
						>Waiting for a message…</span
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
					onclick={close}>Cancel</button
				>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			aria-label="Close"
			onclick={close}
		></button>
	</dialog>
{/if}
