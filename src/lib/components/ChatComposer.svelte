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

	async function handleSend(event: SubmitEvent) {
		event.preventDefault();
		if (!content.trim()) return;
		sending = true;
		error = null;
		try {
			await sendMessage(chat, character, content);
			content = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			sending = false;
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
		<button class="btn btn-sm btn-primary" type="submit" disabled={sending}>
			{sending ? 'Sending…' : 'Send'}
		</button>
	</div>
	{#if error}
		<p class="text-error text-sm">{error}</p>
	{/if}
</form>
