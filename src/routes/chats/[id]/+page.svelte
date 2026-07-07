<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getChat, addMessage } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';
	import ChatThreadSwitcher from '$lib/components/ChatThreadSwitcher.svelte';
	import ChatBubble from '$lib/components/ChatBubble.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';
	import ChatCharacterImage from '$lib/components/ChatCharacterImage.svelte';

	const chatId = $derived(page.params.id as string);
	const chat = $derived(getChat(chatId));

	$effect(() => {
		if (chat) ensureCharacterLoaded(chat.character_id);
	});

	const character = $derived(chat ? resolveCharacter(chat.character_id) : undefined);

	// A brand-new chat has no messages yet — post one of the character's
	// greetings (picked at random when alternates exist) as the opening
	// message so a fresh chat isn't just an empty composer.
	$effect(() => {
		if (chat && character && chat.messages.length === 0 && character.first_message) {
			untrack(() => {
				const greetings = [character.first_message, ...character.alternate_greetings];
				const greeting = greetings[Math.floor(Math.random() * greetings.length)];
				void addMessage(chat.id, 'character', greeting);
			});
		}
	});
</script>

{#if !chat}
	<div class="flex h-full items-center justify-center text-sm opacity-70">Chat not found.</div>
{:else}
	<div class="flex h-full flex-col">
		<ChatThreadSwitcher {chat} />
		<div class="relative flex-1 overflow-hidden">
			<div class="h-full overflow-y-auto p-4">
				{#each chat.messages as message (message.id)}
					{#if character}
						<ChatBubble {chatId} {message} {character} />
					{/if}
				{/each}
			</div>
			{#if character}
				<div class="absolute bottom-3 left-3 z-20">
					<ChatCharacterImage {character} />
				</div>
			{/if}
		</div>
		{#if character}
			<ChatComposer {chat} {character} />
		{:else}
			<p class="p-3 text-sm opacity-70">Loading character…</p>
		{/if}
	</div>
{/if}
