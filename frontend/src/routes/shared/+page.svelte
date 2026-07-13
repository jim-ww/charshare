<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { decodeSharedChat, type SharedChatData } from '$lib/share/chatShare';
	import type { Chat, Character, Message } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import ChatBubble from '$lib/components/ChatBubble.svelte';
	import { m } from '$lib/paraglide/messages.js';

	// Purely client-derived from the `d` query param — no dependency on
	// IndexedDB/network state, since whoever opens a share link may not have this
	// character (or an account at all).
	const shared = $derived.by((): SharedChatData | null => {
		const encoded = page.url.searchParams.get('d');
		if (!encoded) return null;
		try {
			return decodeSharedChat(encoded);
		} catch {
			return null;
		}
	});

	// ChatBubble expects a real Chat/Character/Message shape (it's the same
	// component used in the live chat view) — reconstruct a linear chain and a
	// stand-in character so the shared view renders identically instead of
	// duplicating bubble markup. `readonly` hides all the editing/regenerate/
	// branch-switch controls and the links into a character page that may not
	// resolve for whoever opened this link.
	const fakeChat = $derived.by((): Chat | null => {
		if (!shared) return null;
		const messages: Message[] = shared.messages.map((sm, i) => ({
			id: `shared-${i}`,
			parent_id: i === 0 ? null : `shared-${i - 1}`,
			role: sm.role,
			content: sm.content,
			created_at: sm.created_at,
			updated_at: sm.created_at
		}));
		const active_child: Record<string, string> = {};
		for (let i = 0; i < messages.length - 1; i++) active_child[messages[i].id] = messages[i + 1].id;
		return {
			id: 'shared',
			character_id: shared.characterId,
			persona_id: null,
			name: shared.chatName,
			messages,
			root_id: messages[0]?.id ?? null,
			active_child,
			created_at: 0,
			draft: '',
			editing_message_id: null,
			editing_draft: '',
			image_index: 0,
			backgrounds: [],
			active_background: null,
			tts_provider: null,
			tts_voice_id: 'f1',
			tts_pitch: 1,
			tts_speed: 1
		};
	});

	const fakeCharacter = $derived.by((): Character | null => {
		if (!shared) return null;
		return {
			id: shared.characterId,
			version: 1,
			name: shared.characterName,
			image_urls: shared.characterImageUrl ? [shared.characterImageUrl] : [],
			description: '',
			personality: '',
			scenario: '',
			tags: [],
			nsfw: false,
			language: 'en',
			system_prompt: '',
			first_message: '',
			alternate_greetings: [],
			example_dialogues: [],
			comments_enabled: false,
			forked_from: null,
			author: '',
			created_at: 0,
			updated_at: 0,
			deleted: false,
			deleted_at: null
		};
	});
</script>

<div class="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col overflow-hidden p-4">
	{#if !shared || !fakeChat || !fakeCharacter}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 text-sm opacity-70">
			<p>{m.shared_chat_not_found()}</p>
			<a class="btn btn-sm" href={resolve('/')}>{m.shared_chat_open_app()}</a>
		</div>
	{:else}
		<div class="mb-2 flex shrink-0 items-center gap-3">
			<a href={resolve('/characters/[id]', { id: fakeCharacter.id })}>
				<Avatar name={shared.characterName} imageUrl={shared.characterImageUrl ?? undefined} class="w-10" />
			</a>
			<div class="min-w-0">
				<div class="truncate font-semibold">{shared.chatName}</div>
				<a class="link link-hover truncate text-xs opacity-60" href={resolve('/characters/[id]', { id: fakeCharacter.id })}>
					{shared.characterName}
				</a>
			</div>
			<a class="btn btn-sm btn-ghost ml-auto" href={resolve('/')}>{m.shared_chat_open_app()}</a>
		</div>
		<div class="flex-1 overflow-y-auto px-4">
			{#each fakeChat.messages as message (message.id)}
				<ChatBubble
					chat={fakeChat}
					{message}
					character={fakeCharacter}
					readonly
					userNameOverride={shared.userName ?? m.shared_chat_you()}
				/>
			{/each}
		</div>
	{/if}
</div>
