<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getChat, addMessage, getActivePath } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';
	import ChatThreadSwitcher from '$lib/components/ChatThreadSwitcher.svelte';
	import ChatBubble from '$lib/components/ChatBubble.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';
	import ChatCharacterImage from '$lib/components/ChatCharacterImage.svelte';
	import ChatSettingsSidebar from '$lib/components/ChatSettingsSidebar.svelte';
	import { getPreferences } from '$lib/state/preferences.svelte';

	const chatId = $derived(page.params.id as string);
	const chat = $derived(getChat(chatId));
	const activeMessages = $derived(chat ? getActivePath(chat) : []);

	let scrollContainer = $state<HTMLDivElement | undefined>();
	let sidebarOpen = $state(false);

	$effect(() => {
		if (chat) ensureCharacterLoaded(chat.character_id);
	});

	// Re-run whenever a message is added and scroll it into view.
	$effect(() => {
		const lastMessage = activeMessages[activeMessages.length - 1];
		if (!lastMessage || !scrollContainer) return;
		untrack(() => {
			scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
		});
	});

	const character = $derived(chat ? resolveCharacter(chat.character_id) : undefined);
	const chatOpacity = $derived(getPreferences().chatOpacity / 100);

	// A brand-new chat has no messages yet — post one of the character's
	// greetings (picked at random when alternates exist) as the opening
	// message so a fresh chat isn't just an empty composer.
	$effect(() => {
		if (chat && character && chat.root_id === null && character.first_message) {
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
	<div class="flex h-full">
		<div class="flex h-full min-w-0 flex-1 flex-col">
			<div class="flex items-center justify-between">
				<ChatThreadSwitcher {chat} />
				<button
					class="btn btn-sm m-2 ml-auto gap-2"
					type="button"
					onclick={() => (sidebarOpen = !sidebarOpen)}
				>
					⚙ Chat settings
				</button>
			</div>
			<div class="relative flex-1 overflow-hidden">
				<div class="h-full overflow-y-auto p-4" bind:this={scrollContainer}>
					{#each activeMessages as message (message.id)}
						{#if character}
							<div style="opacity: {chatOpacity}">
								<ChatBubble {chat} {message} {character} />
							</div>
						{/if}
					{/each}
				</div>
				{#if character}
					<div class="fixed bottom-3 left-3 z-20">
						<ChatCharacterImage {chat} {character} />
					</div>
				{/if}
			</div>
			{#if character}
				<div style="opacity: {chatOpacity}">
					<ChatComposer {chat} {character} />
				</div>
			{:else}
				<p class="p-3 text-sm opacity-70">Loading character…</p>
			{/if}
		</div>
		{#if sidebarOpen}
			<ChatSettingsSidebar {chat} onclose={() => (sidebarOpen = false)} />
		{/if}
	</div>
{/if}
