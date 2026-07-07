<script lang="ts">
	import { page } from '$app/state';
	import type { Chat, CharacterId } from '$lib/types';
	import { getChats } from '$lib/state/chats.svelte';
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
</script>

<aside class="flex w-64 shrink-0 flex-col gap-1 border-r border-base-300 p-2">
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
			</div>
			{#if expanded[characterId]}
				<ul class="ml-2 flex flex-col gap-1">
					{#each characterChats as chat (chat.id)}
						<li>
							<a
								class="btn btn-xs btn-ghost w-full justify-start"
								class:btn-active={activeId === chat.id}
								href={`/chats/${chat.id}`}
							>
								{chat.name}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="p-2 text-sm opacity-70">No conversations yet.</p>
	{/each}
</aside>
