<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Chat, Character, Message } from '$lib/types';
	import { deleteMessage, getSiblings, switchBranch, updateMessageContent } from '$lib/state/chats.svelte';
	import { editUserMessage, regenerateMessage } from '$lib/ai/chat';
	import { getMyProfile } from '$lib/state/profile.svelte';
	import { getPersona, personaDisplayName } from '$lib/state/personas.svelte';
	import Avatar from './Avatar.svelte';

	interface Props {
		chat: Chat;
		message: Message;
		character: Character;
	}

	let { chat, message, character }: Props = $props();
	const chatId = $derived(chat.id);

	// The persona the user was playing as when this chat was created — falls
	// back to the real profile username for chats from before personas existed.
	const persona = $derived(chat.persona_id ? getPersona(chat.persona_id) : undefined);
	const userName = $derived(persona ? personaDisplayName(persona) : (getMyProfile()?.username ?? 'You'));

	const displayName = $derived(message.role === 'character' ? character.name : userName);

	const displayContent = $derived.by(() => {
		return userName ? message.content.replaceAll(/{{user}}/gi, userName) : message.content;
	});

	function escapeHtml(text: string): string {
		return text
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
	}

	// Renders *actions* dimmed and (asides) in a distinct color. Escapes first
	// so message content can never inject markup.
	const formattedContent = $derived.by(() => {
		return escapeHtml(displayContent)
			.replace(/\*([^*]+)\*/g, '<span class="opacity-60 italic">$1</span>')
			.replace(/\(([^)]+)\)/g, '<span class="text-secondary">($1)</span>');
	});

	// Messenger-style timestamp: just the time for today, otherwise date + time.
	const formattedTime = $derived.by(() => {
		const date = new Date(message.created_at);
		const isToday = date.toDateString() === new Date().toDateString();
		const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		if (isToday) return time;
		return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
	});

	// Other branches regenerated at this same point in the tree — the "other
	// routes" of the conversation (see regenerateMessage in $lib/ai/chat.ts).
	const branches = $derived(getSiblings(chat, message.id));
	const branchPos = $derived(branches.findIndex((m) => m.id === message.id));

	function goBranch(delta: number) {
		const target = branches[branchPos + delta];
		if (target) switchBranch(chatId, target.id);
	}

	let editing = $state(false);
	let draft = $state('');
	let regenerating = $state(false);

	function startEdit() {
		draft = message.content;
		editing = true;
	}

	/** Corrects the message content in place — no branching, no completion
	 *  request. Unlike saveAndResend, this must leave whatever came after this
	 *  message (replies, later turns) exactly where it was; branching via
	 *  addMessage would switch the active path onto a new childless sibling
	 *  and hide that history, which is wrong for a plain correction. */
	async function saveEditOnly() {
		await updateMessageContent(chatId, message.id, draft, { persist: true });
		editing = false;
	}

	/** Edits the message and resends the conversation so the character
	 *  reacts to the new wording — the common case for a user message edit. */
	async function saveAndResend() {
		editing = false;
		regenerating = true;
		try {
			await editUserMessage(chat, character, message.id, draft);
		} finally {
			regenerating = false;
		}
	}

	async function handleRegenerate() {
		if (regenerating) return;
		regenerating = true;
		try {
			await regenerateMessage(chat, character, message.id);
		} finally {
			regenerating = false;
		}
	}
</script>

<div
	class="chat group"
	class:chat-end={message.role === 'user'}
	class:chat-start={message.role === 'character'}
>
	<div class="chat-image">
		{#if message.role === 'character'}
			<a href={resolve('/characters/[id]', { id: character.id })}>
				<Avatar name={character.name} imageUrl={character.image_urls[0]} />
			</a>
		{:else}
			<Avatar name={displayName} imageUrl={getMyProfile()?.image_url} />
		{/if}
	</div>
	<div
		class="chat-header flex items-center gap-2 text-sm font-semibold opacity-100 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]"
		class:flex-row-reverse={message.role === 'user'}
	>
		<span class="flex items-baseline gap-2">
			<span>{displayName}</span>
			<span class="text-xs font-normal italic opacity-60">{formattedTime}</span>
		</span>
		{#if !editing}
			<div
				class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<button
					class="btn btn-sm btn-ghost btn-circle text-error"
					type="button"
					aria-label="Delete message"
					title="Delete message"
					onclick={() => deleteMessage(chatId, message.id)}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M3 6h18" />
						<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
						<path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
						<path d="M10 11v6" />
						<path d="M14 11v6" />
					</svg>
				</button>
				<button
					class="btn btn-sm btn-ghost btn-circle"
					type="button"
					aria-label="Edit message"
					title="Edit message"
					onclick={startEdit}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M12 20h9" />
						<path
							d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
						/>
					</svg>
				</button>
			</div>
		{/if}
	</div>
	<div class="chat-bubble">
		{#if editing}
			<textarea
				class="textarea textarea-bordered w-full text-base-content"
				style="height: 12rem; max-height: 60vh; min-height: 5rem; resize: vertical;"
				bind:value={draft}
			></textarea>
			<div class="mt-1 flex items-center gap-1">
				{#if message.role === 'user'}
					<button class="btn btn-xs btn-primary" type="button" onclick={saveAndResend}>
						Send
					</button>
					<button class="btn btn-xs btn-ghost" type="button" onclick={saveEditOnly}>
						Save only
					</button>
				{:else}
					<button class="btn btn-xs" type="button" onclick={saveEditOnly}>Save</button>
				{/if}
				<button class="btn btn-xs" type="button" onclick={() => (editing = false)}>Cancel</button>
			</div>
		{:else if message.role === 'character' && message.content === ''}
			<p class="italic opacity-60">Replying…</p>
		{:else}
			<p class="whitespace-pre-wrap">{@html formattedContent}</p>
		{/if}
	</div>
	<div class="chat-footer flex items-center gap-2 text-xs opacity-70">
		{#if branches.length > 1}
			<button class="btn btn-xs btn-ghost" type="button" disabled={branchPos <= 0} onclick={() => goBranch(-1)}>
				‹
			</button>
			<span>{branchPos + 1}/{branches.length}</span>
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={branchPos >= branches.length - 1}
				onclick={() => goBranch(1)}
			>
				›
			</button>
		{/if}
		{#if !editing && message.role === 'character'}
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={regenerating}
				aria-label="Regenerate response"
				title="Regenerate response"
				onclick={handleRegenerate}
			>
				<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 11-3-6.7" />
					<path d="M21 3v6h-6" />
				</svg>
			</button>
		{/if}
	</div>
</div>
