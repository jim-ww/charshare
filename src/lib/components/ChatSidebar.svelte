<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Chat, CharacterId } from '$lib/types';
	import { getChats, deleteChat, renameChat, exportChat } from '$lib/state/chats.svelte';
	import { resolveCharacter, ensureCharacterLoaded } from '$lib/state/characterCache.svelte';

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

	async function handleDelete(chat: Chat) {
		if (!confirm(`Delete conversation "${chat.name}"? This cannot be undone.`)) return;
		if (activeId === chat.id) await goto('/chats');
		await deleteChat(chat.id);
	}

	async function handleRename(chat: Chat) {
		const name = prompt('Rename conversation', chat.name)?.trim();
		if (!name || name === chat.name) return;
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
		</ul>
	</div>
	<button
		class="btn btn-ghost btn-xs px-1"
		type="button"
		aria-label="Delete conversation"
		onclick={() => handleDelete(chat)}
	>
		✕
	</button>
{/snippet}

<aside class="flex w-64 shrink-0 flex-col gap-1 p-2">
	{#each groups as [characterId, characterChats] (characterId)}
		{@const character = resolveCharacter(characterId)}
		{@const latest = characterChats[0]}
		<div>
			<div class="flex items-center gap-1">
				<a
					class="btn btn-sm flex-1 justify-start"
					class:btn-active={activeId === latest.id}
					href={`/chats/${latest.id}`}
				>
					{character?.name ?? 'Unknown character'}
				</a>
				{#if characterChats.length > 1}
					<button
						class="btn btn-xs btn-ghost"
						type="button"
						onclick={() => toggle(characterId)}
						aria-label="Show other conversations"
					>
						{characterChats.length} {expanded[characterId] ? '▴' : '▾'}
					</button>
				{/if}
				{@render chatActions(latest)}
			</div>
			{#if expanded[characterId]}
				<ul class="ml-2 flex flex-col gap-1">
					{#each characterChats as chat (chat.id)}
						<li>
							<div class="flex items-center gap-1">
								<a
									class="btn btn-xs btn-ghost min-w-0 flex-1 justify-start truncate"
									class:btn-active={activeId === chat.id}
									href={`/chats/${chat.id}`}
								>
									{chat.name}
								</a>
								{@render chatActions(chat)}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="p-2 text-sm opacity-70">No conversations yet.</p>
	{/each}
</aside>
