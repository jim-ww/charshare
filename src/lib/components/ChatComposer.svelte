<script lang="ts">
	import type { Chat, Character } from '$lib/types';
	import { sendMessage, generateUserDraft } from '$lib/ai/chat';

	interface Props {
		chat: Chat;
		character: Character;
	}

	let { chat, character }: Props = $props();

	let content = $state('');
	let sending = $state(false);
	let generating = $state(false);
	let error = $state<string | null>(null);
	let abortController: AbortController | null = null;

	async function handleSend(event: SubmitEvent) {
		event.preventDefault();
		if (sending) {
			abortController?.abort();
			return;
		}
		if (!content.trim()) return;
		const controller = new AbortController();
		abortController = controller;
		sending = true;
		error = null;
		try {
			await sendMessage(chat, character, content, { signal: controller.signal });
			content = '';
		} catch (err) {
			if (!(err instanceof DOMException && err.name === 'AbortError')) {
				error = err instanceof Error ? err.message : String(err);
			}
		} finally {
			sending = false;
			abortController = null;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend(new SubmitEvent('submit', { cancelable: true }));
		}
	}

	async function handleGenerateForMe() {
		generating = true;
		error = null;
		try {
			content = await generateUserDraft(chat, character);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			generating = false;
		}
	}
</script>

<form class="flex flex-col gap-2 border-t border-base-300 p-3" onsubmit={handleSend}>
	<textarea
		class="textarea textarea-bordered w-full"
		rows="2"
		placeholder="Message"
		bind:value={content}
		onkeydown={handleKeydown}
	></textarea>
	<div class="flex justify-between gap-2">
		<button class="btn btn-sm" type="button" disabled={generating} onclick={handleGenerateForMe}>
			{generating ? 'Generating…' : 'Generate for me'}
		</button>
		<button
			class="btn btn-sm btn-primary btn-circle"
			type="submit"
			aria-label={sending ? 'Stop' : 'Send'}
		>
			{#if sending}
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
					<rect x="6" y="6" width="12" height="12" rx="1.5" />
				</svg>
			{:else}
				<svg
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M12 19V5" />
					<path d="M5 12l7-7 7 7" />
				</svg>
			{/if}
		</button>
	</div>
	{#if error}
		<p class="text-error text-sm">{error}</p>
	{/if}
</form>
