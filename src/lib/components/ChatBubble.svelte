<script lang="ts">
	import type { ChatId, Character, Message } from '$lib/types';
	import { activeContent } from '$lib/types';
	import { addMessageVersion, deleteMessage, setActiveVersion } from '$lib/state/chats.svelte';
	import Avatar from './Avatar.svelte';

	interface Props {
		chatId: ChatId;
		message: Message;
		character: Character;
	}

	let { chatId, message, character }: Props = $props();

	let editing = $state(false);
	let draft = $state('');

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
		{#if !editing}
			<button class="btn btn-xs btn-ghost" type="button" onclick={startEdit}>Edit</button>
			<button class="btn btn-xs btn-ghost" type="button" onclick={() => deleteMessage(chatId, message.id)}>
				Delete
			</button>
		{/if}
	</div>
</div>
