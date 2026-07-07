<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Chat, Character } from '$lib/types';
	import { sendMessage, continueChat, generateUserDraft } from '$lib/ai/chat';
	import { setChatDraft, getActivePath } from '$lib/state/chats.svelte';

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
	let loadedDraftFor: string | null = null;

	// Up/down arrow history navigation over the user's own past messages
	// (oldest to newest). -1 means "showing the draft"; 0 is the most recent
	// past message, counting back from there. Reset whenever the chat
	// changes or the user types, so navigation always starts from "newest".
	let historyIndex = $state(-1);
	let draftBackup = '';
	const userHistory = $derived(getActivePath(chat).filter((m) => m.role === 'user').map((m) => m.content));

	// The composer stays mounted while navigating between chats (same route,
	// different :id param), so `content` needs re-syncing to the new chat's
	// saved draft rather than carrying over the previous chat's text.
	$effect(() => {
		if (chat.id !== loadedDraftFor) {
			untrack(() => {
				content = chat.draft;
				loadedDraftFor = chat.id;
				historyIndex = -1;
				draftBackup = '';
			});
		}
	});

	$effect(() => {
		const text = content;
		untrack(() => setChatDraft(chat.id, text));
	});

	async function handleSend(event: SubmitEvent) {
		event.preventDefault();
		if (sending) {
			abortController?.abort();
			return;
		}
		const trimmed = content.trim();
		// Clear the box the moment the send goes out, so it doesn't sit there
		// while the AI replies — restored below if the send doesn't pan out.
		const backup = content;
		if (trimmed) content = '';
		const controller = new AbortController();
		abortController = controller;
		sending = true;
		error = null;
		try {
			if (trimmed) {
				await sendMessage(chat, character, trimmed, { signal: controller.signal });
			} else {
				await continueChat(chat, character, { signal: controller.signal });
			}
			historyIndex = -1;
			draftBackup = '';
		} catch (err) {
			content = backup;
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
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			const textarea = event.currentTarget as HTMLTextAreaElement;
			// Only hijack the arrow keys at the very start/end of the text (no
			// selection), so navigating within a multi-line draft still works.
			const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
			const atEnd = textarea.selectionStart === content.length && textarea.selectionEnd === content.length;
			if (event.key === 'ArrowUp' && atStart) {
				event.preventDefault();
				navigateHistory('up', textarea);
			} else if (event.key === 'ArrowDown' && atEnd) {
				event.preventDefault();
				navigateHistory('down', textarea);
			}
		}
	}

	function navigateHistory(direction: 'up' | 'down', textarea: HTMLTextAreaElement) {
		const history = userHistory;
		if (direction === 'up') {
			if (historyIndex + 1 >= history.length) return;
			if (historyIndex === -1) draftBackup = content;
			historyIndex += 1;
			content = history[history.length - 1 - historyIndex];
		} else {
			if (historyIndex === -1) return;
			historyIndex -= 1;
			content = historyIndex === -1 ? draftBackup : history[history.length - 1 - historyIndex];
		}
		void tick().then(() => {
			const pos = content.length;
			textarea.setSelectionRange(pos, pos);
		});
	}

	function handleInput() {
		// Manual typing means the box no longer reflects a history entry —
		// treat whatever's there now as the draft going forward.
		historyIndex = -1;
	}

	async function handleGenerateForMe() {
		generating = true;
		error = null;
		try {
			content = await generateUserDraft(chat, character);
			historyIndex = -1;
			draftBackup = '';
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
		oninput={handleInput}
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
