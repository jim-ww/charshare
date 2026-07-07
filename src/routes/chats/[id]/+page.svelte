<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getChat, addMessage } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';
	import ChatThreadSwitcher from '$lib/components/ChatThreadSwitcher.svelte';
	import ChatBubble from '$lib/components/ChatBubble.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';

	const chatId = $derived(page.params.id as string);
	const chat = $derived(getChat(chatId));

	$effect(() => {
		if (chat) ensureCharacterLoaded(chat.character_id);
	});

	const character = $derived(chat ? resolveCharacter(chat.character_id) : undefined);

	// A brand-new chat has no messages yet — post the character's greeting as
	// the opening message so a fresh chat isn't just an empty composer.
	$effect(() => {
		if (chat && character && chat.messages.length === 0 && character.first_message) {
			untrack(() => {
				void addMessage(chat.id, 'character', character.first_message);
			});
		}
	});
</script>

{#if !chat}
	<div class="flex h-full items-center justify-center text-sm opacity-70">Chat not found.</div>
{:else}
	<div class="flex h-full flex-col">
		<ChatThreadSwitcher {chat} />
		<div class="flex-1 overflow-y-auto p-4">
			{#each chat.messages as message (message.id)}
				<ChatBubble {chatId} {message} />
			{/each}
		</div>
		{#if character}
			<ChatComposer {chat} {character} />
		{:else}
			<p class="p-3 text-sm opacity-70">Loading character…</p>
		{/if}
	</div>
{/if}
