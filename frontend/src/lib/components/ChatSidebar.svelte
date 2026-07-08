<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import type { Chat, CharacterId } from '$lib/types';
	import { getChats, deleteChat, renameChat, exportChat } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';
	import Avatar from './Avatar.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import PromptDialog from './PromptDialog.svelte';

	const chats = $derived(getChats());

	// Groups chats by character so a character with many conversations shows
	// one entry (most-recent first) with an expander, rather than flooding
	// the list with duplicates — see build-order design discussion.
	const groups = $derived.by(() => {
		const byCharacter = new Map<CharacterId, Chat[]>();
		for (const chat of chats) {
			const list = byCharacter.get(chat.character_id) ?? [];
			list.push(chat);
			byCharacter.set(chat.character_id, list);
		}
		for (const list of byCharacter.values()) {
			list.sort((a, b) => b.created_at - a.created_at);
		}
		return [...byCharacter.entries()];
	});

	$effect(() => {
		for (const [characterId] of groups) {
			ensureCharacterLoaded(characterId);
		}
	});

	let expanded = $state<Record<CharacterId, boolean>>({});

	function toggle(characterId: CharacterId) {
		expanded = { ...expanded, [characterId]: !expanded[characterId] };
	}

	const activeId = $derived(page.params.id);

	let deleteTarget = $state<Chat | null>(null);
	let renameTarget = $state<Chat | null>(null);

	function handleDelete(chat: Chat) {
		deleteTarget = chat;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const chat = deleteTarget;
		deleteTarget = null;
		if (activeId === chat.id) await goto(`${base}/chats`);
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
</script>

{#snippet chatActions(chat: Chat)}
	<div class="dropdown dropdown-end">
		<button
			tabindex="0"
			class="btn btn-ghost btn-xs px-1"
			type="button"
			aria-label="More options"
		>
			⋮
		</button>
		<ul class="menu dropdown-content menu-sm z-10 w-32 rounded-box bg-base-200 p-1 shadow">
			<li><button type="button" onclick={() => handleExport(chat)}>Export</button></li>
			<li><button type="button" onclick={() => handleRename(chat)}>Rename</button></li>
			<li><button type="button" class="text-error" onclick={() => handleDelete(chat)}>Delete</button></li>
		</ul>
	</div>
{/snippet}

<aside class="flex w-80 shrink-0 flex-col gap-1 overflow-y-auto p-2">
	{#each groups as [characterId, characterChats] (characterId)}
		{@const character = resolveCharacter(characterId)}
		{@const latest = characterChats[0]}
		<div class="rounded-box" class:bg-base-200={activeId === latest.id && !expanded[characterId]}>
			<div class="group flex items-center gap-2 rounded-box p-1.5 hover:bg-base-200">
				<a href={`${base}/chats/${latest.id}`} class="shrink-0">
					<Avatar
						name={character?.name ?? '?'}
						imageUrl={character?.image_urls[0]}
						class="w-9"
					/>
				</a>
				<a href={`${base}/chats/${latest.id}`} class="min-w-0 flex-1">
					<div class="truncate text-base font-medium">
						{character?.name ?? 'Unknown character'}
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
						aria-label="Show other conversations"
					>
						{characterChats.length} {expanded[characterId] ? '▴' : '▾'}
					</button>
				{/if}
				<div class="shrink-0 opacity-0 group-hover:opacity-100">
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
									href={`${base}/chats/${chat.id}`}
								>
									{chat.name}
								</a>
								<div class="shrink-0 opacity-0 group-hover:opacity-100">
									{@render chatActions(chat)}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="p-3 text-center text-sm opacity-60">No conversations yet.</p>
	{/each}
</aside>

<ConfirmDialog
	open={deleteTarget !== null}
	title="Delete conversation"
	message={`Delete conversation "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
	confirmLabel="Delete"
	danger
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
/>

<PromptDialog
	open={renameTarget !== null}
	title="Rename conversation"
	initialValue={renameTarget?.name ?? ''}
	confirmLabel="Save"
	onconfirm={confirmRename}
	oncancel={() => (renameTarget = null)}
/>
