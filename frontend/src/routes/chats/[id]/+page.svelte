<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import {
		getChat,
		addMessage,
		getActivePath,
	} from "$lib/state/chats.svelte";
	import {
		resolveCharacter,
		ensureCharacterLoaded,
		isCharacterLoadFailed,
	} from "$lib/state/characterCache.svelte";
	import { isCharactersReady } from "$lib/state/characters.svelte";
	import ChatThreadSwitcher from "$lib/components/ChatThreadSwitcher.svelte";
	import ChatBubble from "$lib/components/ChatBubble.svelte";
	import ChatComposer from "$lib/components/ChatComposer.svelte";
	import ChatSettingsSidebar from "$lib/components/ChatSettingsSidebar.svelte";
	import ChatCharacterRecovery from "$lib/components/ChatCharacterRecovery.svelte";
	import { getPreferences } from "$lib/state/preferences.svelte";
	import { initPersonas } from "$lib/state/personas.svelte";
	import { m } from "$lib/paraglide/messages.js";

	untrack(() => void initPersonas());

	const chatId = $derived(page.params.id as string);
	const chat = $derived(getChat(chatId));
	const activeMessages = $derived(chat ? getActivePath(chat) : []);

	let scrollContainer = $state<HTMLDivElement | undefined>();
	let sidebarOpen = $state(false);

	// "My characters" (including local-only ones never published to GUN) load
	// asynchronously from IndexedDB — wait for that before falling back to a
	// GUN subscription, otherwise a local-only character race-loses to the
	// subscription's timeout and wrongly shows the "couldn't be loaded" error.
	const charactersReady = $derived(isCharactersReady());

	$effect(() => {
		if (chat && charactersReady) ensureCharacterLoaded(chat.character_id);
	});

	// Re-run whenever a message is added and scroll it into view.
	$effect(() => {
		const lastMessage = activeMessages[activeMessages.length - 1];
		if (!lastMessage || !scrollContainer) return;
		untrack(() => {
			scrollContainer?.scrollTo({
				top: scrollContainer.scrollHeight,
				behavior: "smooth",
			});
		});
	});

	const character = $derived(
		chat ? resolveCharacter(chat.character_id) : undefined,
	);
	const characterLoadFailed = $derived(
		chat ? isCharacterLoadFailed(chat.character_id) : false,
	);
	const manualPickCharacter = $derived(page.url.searchParams.has("pick-character"));
	function closeManualPick() {
		void goto(resolve('/chats/[id]', { id: chatId }));
	}
	const chatOpacity = $derived(getPreferences().chatOpacity / 100);

	// A brand-new chat has no messages yet — post one of the character's
	// greetings (picked at random when alternates exist) as the opening
	// message so a fresh chat isn't just an empty composer.
	$effect(() => {
		if (
			chat &&
			character &&
			chat.root_id === null &&
			character.first_message
		) {
			untrack(() => {
				const greetings = [
					character.first_message,
					...character.alternate_greetings,
				];
				const greeting =
					greetings[
						Math.floor(
							Math.random() *
								greetings.length,
						)
					];
				void addMessage(chat.id, "character", greeting);
			});
		}
	});
</script>

{#if !chat}
	<div class="flex h-full items-center justify-center text-sm opacity-70">
		Chat not found.
	</div>
{:else if !charactersReady}
	<div class="flex h-full items-center justify-center text-sm opacity-70">
		{m.char_list_loading()}
	</div>
{:else if !character && characterLoadFailed}
	<ChatCharacterRecovery chatId={chat.id} missingCharacterId={chat.character_id} mode="error" />
{:else if manualPickCharacter}
	<ChatCharacterRecovery
		chatId={chat.id}
		missingCharacterId={chat.character_id}
		mode="manual"
		oncancel={closeManualPick}
		onpicked={closeManualPick}
	/>
{:else}
	<div class="flex h-full">
		<div class="flex h-full min-w-0 flex-1 flex-col">
			<div class="flex flex-wrap items-center justify-between gap-1">
				<ChatThreadSwitcher {chat} />
				<button
					class="btn btn-sm m-2 ml-auto gap-2"
					type="button"
					onclick={() =>
						(sidebarOpen = !sidebarOpen)}
				>
					⚙ Chat settings
				</button>
			</div>
			<div class="relative flex-1 overflow-hidden">
				<div
					class="h-full overflow-y-auto p-4"
					bind:this={scrollContainer}
				>
					{#each activeMessages as message (message.id)}
						{#if character}
							<div
								style="opacity: {chatOpacity}"
							>
								<ChatBubble
									{chat}
									{message}
									{character}
								/>
							</div>
						{/if}
					{/each}
				</div>
			</div>
			{#if character}
				<div
					class="mx-auto w-full max-w-3xl px-4"
					style="opacity: {chatOpacity}"
				>
					<ChatComposer {chat} {character} />
				</div>
			{:else}
				<p class="p-3 text-sm opacity-70">
					Loading character…
				</p>
			{/if}
		</div>
		{#if sidebarOpen}
			<div
				class="fixed inset-0 z-30 bg-black/40 lg:hidden"
				role="button"
				tabindex="0"
				aria-label={m.chat_settings_close()}
				onclick={() => (sidebarOpen = false)}
				onkeydown={(e) => e.key === "Escape" && (sidebarOpen = false)}
			></div>
			<div class="fixed inset-y-0 right-0 z-40 lg:static lg:z-auto">
				<ChatSettingsSidebar
					{chat}
					onclose={() => (sidebarOpen = false)}
				/>
			</div>
		{/if}
	</div>
{/if}
