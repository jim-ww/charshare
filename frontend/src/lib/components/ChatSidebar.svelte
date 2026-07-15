<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Chat, CharacterId } from '$lib/types';
	import { firstImageUrl } from '$lib/types/media';
	import { getChats, deleteChat, renameChat, exportChat, chatLastMessageAt } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';
	import { isCharactersReady } from '$lib/state/characters.svelte';
	import { getPersona, personaDisplayName } from '$lib/state/personas.svelte';
	import { getMyProfile } from '$lib/state/profile.svelte';
	import { buildShareUrl, buildSharedChatData } from '$lib/share/chatShare';
	import { notify } from '$lib/state/notifications.svelte';
	import Avatar from './Avatar.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import PromptDialog from './PromptDialog.svelte';
	import ChatCharacterImage from './ChatCharacterImage.svelte';
	import { isChatSidebarOpen, closeChatSidebar } from '$lib/state/chatSidebar.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const chats = $derived(getChats());

	// Groups chats by character so a character with many conversations shows
	// one entry (most-recent first) with an expander, rather than flooding
	// the list with duplicates — see build-order design discussion. Groups
	// themselves are then ordered by their most recent activity (not
	// insertion order), so a character you just replied to jumps back to the
	// top of the list — but never interleaved with another character's chats
	// in between, unlike a flat sort of every chat individually would.
	const groups = $derived.by(() => {
		const byCharacter = new Map<CharacterId, Chat[]>();
		for (const chat of chats) {
			const list = byCharacter.get(chat.character_id) ?? [];
			list.push(chat);
			byCharacter.set(chat.character_id, list);
		}
		for (const list of byCharacter.values()) {
			list.sort((a, b) => chatLastMessageAt(b) - chatLastMessageAt(a));
		}
		return [...byCharacter.entries()].sort(
			([, a], [, b]) => chatLastMessageAt(b[0]) - chatLastMessageAt(a[0])
		);
	});

	$effect(() => {
		if (!isCharactersReady()) return;
		for (const [characterId] of groups) {
			ensureCharacterLoaded(characterId);
		}
	});

	let expanded = $state<Record<CharacterId, boolean>>({});

	function toggle(characterId: CharacterId) {
		expanded = { ...expanded, [characterId]: !expanded[characterId] };
	}

	const activeId = $derived(page.params.id);
	const activeChat = $derived(chats.find((c) => c.id === activeId));
	const activeCharacter = $derived(
		activeChat ? resolveCharacter(activeChat.character_id) : undefined
	);

	let deleteTarget = $state<Chat | null>(null);
	let renameTarget = $state<Chat | null>(null);

	function handleDelete(chat: Chat) {
		deleteTarget = chat;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const chat = deleteTarget;
		deleteTarget = null;
		if (activeId === chat.id) await goto(resolve('/chats'));
		await deleteChat(chat.id);
	}

	function handleRename(chat: Chat) {
		renameTarget = chat;
	}

	async function confirmRename(name: string) {
		if (!renameTarget) return;
		const chat = renameTarget;
		renameTarget = null;
		if (name === chat.name) return;
		await renameChat(chat.id, name);
	}

	function handleExport(chat: Chat) {
		const blob = new Blob([exportChat(chat.id)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${chat.name.replace(/[^a-z0-9_-]+/gi, '_') || 'chat'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleShare(chat: Chat) {
		const character = resolveCharacter(chat.character_id);
		if (!character) return;
		const persona = chat.persona_id ? getPersona(chat.persona_id) : undefined;
		const userName = persona ? personaDisplayName(persona) : (getMyProfile()?.username ?? null);
		const data = buildSharedChatData(chat, character, userName);
		const shareUrl = buildShareUrl(data, resolve('/shared'));
		try {
			await navigator.clipboard.writeText(shareUrl);
			notify(m.chat_sidebar_share_link_copied(), { kind: 'success' });
		} catch {
			notify(`${m.chat_sidebar_share_link_failed()} ${shareUrl}`, { kind: 'warning', duration: 0 });
		}
	}
</script>

{#snippet chatActions(chat: Chat)}
	<div class="dropdown dropdown-end">
		<button
			tabindex="0"
			class="btn btn-ghost btn-square btn-sm md:btn-xs"
			type="button"
			aria-label={m.chat_sidebar_more_options()}
		>
			⋮
		</button>
		<ul class="menu dropdown-content z-10 w-48 gap-0.5 rounded-box bg-base-200 p-2 shadow-lg md:menu-sm md:w-40 md:p-1">
			<li><button type="button" class="rounded-lg py-2.5 text-base md:py-1 md:text-sm" onclick={() => handleRename(chat)}>{m.chat_sidebar_rename()}</button></li>
			<li><button type="button" class="rounded-lg py-2.5 text-base md:py-1 md:text-sm" onclick={() => handleShare(chat)}>{m.chat_sidebar_share_link()}</button></li>
			<li><button type="button" class="rounded-lg py-2.5 text-base md:py-1 md:text-sm" onclick={() => handleExport(chat)}>{m.chat_sidebar_export()}</button></li>
			<li>
				<a class="rounded-lg py-2.5 text-base md:py-1 md:text-sm" href={resolve('/characters/[id]', { id: chat.character_id })}>{m.chat_sidebar_view_character()}</a>
			</li>
			<li>
				<a class="rounded-lg py-2.5 text-base md:py-1 md:text-sm" href={`${resolve('/chats/[id]', { id: chat.id })}?pick-character`}>{m.chat_sidebar_choose_character()}</a>
			</li>
			<li><button type="button" class="rounded-lg py-2.5 text-base text-error md:py-1 md:text-sm" onclick={() => handleDelete(chat)}>{m.chat_sidebar_delete()}</button></li>
		</ul>
	</div>
{/snippet}

{#if isChatSidebarOpen()}
	<div
		class="fixed inset-0 z-20 bg-black/40 md:hidden"
		role="button"
		tabindex="0"
		aria-label={m.chat_sidebar_no_conversations()}
		onclick={closeChatSidebar}
		onkeydown={(e) => e.key === 'Escape' && closeChatSidebar()}
	></div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<aside
	class="z-30 flex w-72 shrink-0 flex-col bg-base-100 transition-transform max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:h-full max-md:shadow-xl md:w-80 md:translate-x-0 {isChatSidebarOpen()
		? 'max-md:translate-x-0'
		: 'max-md:-translate-x-full'}"
	onclick={(e) => {
		if ((e.target as HTMLElement).closest('a')) closeChatSidebar();
	}}
>
	<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
		{#each groups as [characterId, characterChats] (characterId)}
		{@const character = resolveCharacter(characterId)}
		{@const latest = characterChats[0]}
		<div class="rounded-box" class:bg-base-200={activeId === latest.id && !expanded[characterId]}>
			<div class="group flex items-center gap-2 rounded-box p-1.5 hover:bg-base-200">
				<a href={resolve('/chats/[id]', { id: latest.id })} class="shrink-0">
					<Avatar
						name={character?.name ?? '?'}
						imageUrl={character && firstImageUrl(character.media)}
						class="w-9"
					/>
				</a>
				<a href={resolve('/chats/[id]', { id: latest.id })} class="min-w-0 flex-1">
					<div class="truncate text-base font-medium">
						{character?.name ?? m.chat_sidebar_unknown_character()}
					</div>
					{#if latest.name !== character?.name}
						<div class="truncate text-sm opacity-60">{latest.name}</div>
					{/if}
				</a>
				{#if characterChats.length > 1}
					<button
						class="btn btn-xs btn-ghost shrink-0"
						type="button"
						onclick={() => toggle(characterId)}
						aria-label={m.chat_sidebar_show_other_conversations()}
					>
						{characterChats.length} {expanded[characterId] ? '▴' : '▾'}
					</button>
				{/if}
				<div class="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
					{@render chatActions(latest)}
				</div>
			</div>
			{#if expanded[characterId]}
				<ul class="ml-10 flex flex-col gap-0.5 pb-1">
					{#each characterChats as chat (chat.id)}
						<li>
							<div class="group flex items-center gap-1 rounded-box" class:bg-base-200={activeId === chat.id}>
								<a
									class="min-w-0 flex-1 truncate rounded-box px-2 py-1 text-sm hover:bg-base-200"
									href={resolve('/chats/[id]', { id: chat.id })}
								>
									{chat.name}
								</a>
								<div class="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
									{@render chatActions(chat)}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="p-3 text-center text-sm opacity-60">{m.chat_sidebar_no_conversations()}</p>
	{/each}
	</div>
	{#if activeChat && activeCharacter}
		<div class="w-full shrink-0 p-2">
			<ChatCharacterImage chat={activeChat} character={activeCharacter} />
		</div>
	{/if}
</aside>

<ConfirmDialog
	open={deleteTarget !== null}
	title={m.chat_sidebar_delete_title()}
	message={m.chat_sidebar_delete_message({ name: deleteTarget?.name ?? '' })}
	confirmLabel={m.chat_sidebar_delete_confirm()}
	danger
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
/>

<PromptDialog
	open={renameTarget !== null}
	title={m.chat_sidebar_rename_title()}
	initialValue={renameTarget?.name ?? ''}
	confirmLabel={m.chat_sidebar_rename_confirm()}
	onconfirm={confirmRename}
	oncancel={() => (renameTarget = null)}
/>
