<script lang="ts">
	import type { Chat, Character, Message } from '$lib/types';
	import { activeContent } from '$lib/types';
	import { addMessageVersion, deleteMessage, getSiblings, setActiveVersion, switchBranch } from '$lib/state/chats.svelte';
	import { regenerateMessage } from '$lib/ai/chat';
	import Avatar from './Avatar.svelte';

	interface Props {
		chat: Chat;
		message: Message;
		character: Character;
	}

	let { chat, message, character }: Props = $props();
	const chatId = $derived(chat.id);

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
		draft = activeContent(message);
		editing = true;
	}

	async function saveEdit() {
		await addMessageVersion(chatId, message.id, draft);
		editing = false;
	}

	function prevVersion() {
		setActiveVersion(chatId, message.id, message.active_version_index - 1);
	}

	function nextVersion() {
		setActiveVersion(chatId, message.id, message.active_version_index + 1);
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

<div class="chat" class:chat-end={message.role === 'user'} class:chat-start={message.role === 'character'}>
	<div class="chat-image">
		{#if message.role === 'character'}
			<a href={`/characters/${character.id}`}>
				<Avatar name={character.name} imageUrl={character.image_urls[0]} />
			</a>
		{:else}
			<Avatar name="You" />
		{/if}
	</div>
	<div class="chat-bubble">
		{#if editing}
			<textarea class="textarea textarea-bordered w-full text-base-content" bind:value={draft}
			></textarea>
			<div class="mt-1 flex gap-1">
				<button class="btn btn-xs" type="button" onclick={saveEdit}>Save</button>
				<button class="btn btn-xs" type="button" onclick={() => (editing = false)}>Cancel</button>
			</div>
		{:else}
			<p class="whitespace-pre-wrap">{activeContent(message)}</p>
		{/if}
	</div>
	<div class="chat-footer flex items-center gap-2 text-xs opacity-70">
		{#if message.versions.length > 1}
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={message.active_version_index === 0}
				onclick={prevVersion}
			>
				‹
			</button>
			<span>{message.active_version_index + 1}/{message.versions.length}</span>
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={message.active_version_index === message.versions.length - 1}
				onclick={nextVersion}
			>
				›
			</button>
		{/if}
		{#if message.role === 'character' && branches.length > 1}
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
		{#if !editing}
			{#if message.role === 'character'}
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
			<button class="btn btn-xs btn-ghost" type="button" onclick={startEdit}>Edit</button>
			<button class="btn btn-xs btn-ghost" type="button" onclick={() => deleteMessage(chatId, message.id)}>
				Delete
			</button>
		{/if}
	</div>
</div>
