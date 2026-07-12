<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Chat, Character, Message } from '$lib/types';
	import { deleteMessage, getSiblings, switchBranch, updateMessageContent } from '$lib/state/chats.svelte';
	import { continueMessage, editUserMessage, regenerateMessage } from '$lib/ai/chat';
	import { getEditingMessageId, requestStartEdit, stopEditing } from '$lib/state/chatEditing.svelte';
	import { getMyProfile } from '$lib/state/profile.svelte';
	import { getPersona, personaDisplayName } from '$lib/state/personas.svelte';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import {
		TTS_MODELS,
		preloadModel as preloadTtsModel,
		synthesize,
		type TtsVoiceId,
	} from '$lib/tts/ttsClient';
	import { synthesize as synthesizeVoicevox } from '$lib/tts/voicevoxClient';
	import { playWithPitch, type PitchedPlayback } from '$lib/tts/playback';
	import Avatar from './Avatar.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		chat: Chat;
		message: Message;
		character: Character;
		// Set for the read-only shared-chat viewer, where there's no live chat
		// state to edit/regenerate/branch-switch against — hides those controls.
		// The character avatar/name link is unaffected: it still points at
		// character.id like the regular chat view, and behaves the same way
		// whether or not the viewer happens to have that character.
		readonly?: boolean;
		// Bypasses the persona/profile lookup below — the shared-chat viewer
		// has no persona state of its own, just the name baked into the share
		// link at share time.
		userNameOverride?: string;
	}

	let { chat, message, character, readonly = false, userNameOverride }: Props = $props();
	const chatId = $derived(chat.id);

	// The persona the user was playing as when this chat was created — falls
	// back to the real profile username for chats from before personas existed.
	const persona = $derived(chat.persona_id ? getPersona(chat.persona_id) : undefined);
	const userName = $derived(
		userNameOverride ?? (persona ? personaDisplayName(persona) : (getMyProfile()?.username ?? m.chat_bubble_default_user_name()))
	);

	const displayName = $derived(message.role === 'character' ? character.name : userName);

	const displayContent = $derived.by(() => {
		return userName ? message.content.replaceAll(/{{user}}/gi, userName) : message.content;
	});

	function escapeHtml(text: string): string {
		return text
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
	}

	// Renders *actions* dimmed. Only the user's own (asides) are marked in a
	// distinct color — those are OOC instructions to the model (see
	// PARENTHETICAL_INSTRUCTION in ai/chat.ts); the character's parentheses
	// are just prose and aren't treated specially. Escapes first so message
	// content can never inject markup.
	const formattedContent = $derived.by(() => {
		const withActions = escapeHtml(displayContent).replace(
			/\*([^*]+)\*/g,
			'<span class="opacity-60 italic">$1</span>',
		);
		return message.role === 'user'
			? withActions.replace(/\(([^)]+)\)/g, '<span class="text-secondary">($1)</span>')
			: withActions;
	});

	// Messenger-style timestamp: just the time for today, otherwise date + time.
	const formattedTime = $derived.by(() => {
		const date = new Date(message.created_at);
		const isToday = date.toDateString() === new Date().toDateString();
		const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		if (isToday) return time;
		return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
	});

	// Other branches regenerated at this same point in the tree — the "other
	// routes" of the conversation (see regenerateMessage in $lib/ai/chat.ts).
	// Not meaningful in read-only mode, which only ever gets a single linear
	// path (see buildSharedChatData).
	const branches = $derived(readonly ? [] : getSiblings(chat, message.id));
	const branchPos = $derived(branches.findIndex((m) => m.id === message.id));

	function goBranch(delta: number) {
		const target = branches[branchPos + delta];
		if (target) switchBranch(chatId, target.id);
	}

	const editing = $derived(getEditingMessageId() === message.id);
	let draft = $state('');
	let regenerating = $state(false);

	// The edit lock lives in a module-level singleton, not component state —
	// release it on unmount so navigating away mid-edit (e.g. switching
	// chats) doesn't leave a stale lock nothing can ever clear again.
	$effect(() => () => stopEditing(message.id));

	async function startEdit() {
		const switched = await requestStartEdit({
			messageId: message.id,
			hasChanges: () => draft !== message.content,
			save: () => updateMessageContent(chatId, message.id, draft, { persist: true }),
		});
		if (switched) draft = message.content;
	}

	// Grows the textarea to exactly fit its content, so editing a message
	// starts out the same height as the rendered bubble instead of one fixed
	// size for every message. Driven by an $effect (not just an oninput
	// handler) because the action-mount ordering raced bind:value — the
	// element's initial scrollHeight was measured before its value was set,
	// so it opened at min-height regardless of message length.
	let editTextarea: HTMLTextAreaElement | undefined = $state();

	// Measured so the textarea is never narrower than its own Send/Save/Cancel
	// row — otherwise a one-word edit ("hi") shrinks the textarea below the
	// buttons underneath it, and they overflow/wrap past the bubble edge.
	let controlsWidth = $state(0);

	$effect(() => {
		if (!editing) return;
		const node = editTextarea;
		if (!node) return;
		draft;
		// Also re-measure once controlsWidth resolves (it's set async, after
		// mount, via bind:clientWidth) — otherwise this runs once against the
		// narrower pre-measurement layout and never re-fits a long message
		// once the box widens to match the buttons row underneath it.
		controlsWidth;
		node.style.height = 'auto';
		node.style.height = `${node.scrollHeight}px`;
	});

	// Sized to the longest line instead of a flat w-full — otherwise a short
	// "hi" edit stretches across the whole bubble width, and a long message
	// gets clamped too early. Bounds mirror a typical chat-bubble's natural
	// shrink-to-fit range.
	const editWidthCh = $derived(
		Math.min(Math.max(...draft.split('\n').map((line) => line.length), 4) + 2, 60)
	);

	/** Corrects the message content in place — no branching, no completion
	 *  request. Unlike saveAndResend, this must leave whatever came after this
	 *  message (replies, later turns) exactly where it was; branching via
	 *  addMessage would switch the active path onto a new childless sibling
	 *  and hide that history, which is wrong for a plain correction. */
	async function saveEditOnly() {
		await updateMessageContent(chatId, message.id, draft, { persist: true });
		stopEditing(message.id);
	}

	/** Edits the message and resends the conversation so the character
	 *  reacts to the new wording — the common case for a user message edit. */
	async function saveAndResend() {
		stopEditing(message.id);
		regenerating = true;
		try {
			await editUserMessage(chat, character, message.id, draft);
		} finally {
			regenerating = false;
		}
	}

	async function handleRegenerate() {
		if (regenerating) return;
		regenerating = true;
		try {
			await regenerateMessage(chat, character, message.id);
		} finally {
			regenerating = false;
		}
	}

	/** Appends to this message instead of branching a new one — for when a
	 *  reply was good but cut off short, rather than rerolling it entirely. */
	async function handleContinue() {
		if (regenerating) return;
		regenerating = true;
		try {
			await continueMessage(chat, character, message.id);
		} finally {
			regenerating = false;
		}
	}

	// --- Read aloud (local text-to-speech) --------------------------------

	const ttsAvailable = $derived(!readonly && chat.tts_provider !== null);
	const ttsIsLocal = $derived(chat.tts_provider?.provider === 'local');

	let ttsState = $state<'idle' | 'loading' | 'playing'>('idle');
	let ttsPlayback: PitchedPlayback | undefined;
	let showTtsConsent = $state(false);

	// Whatever's playing belongs to this bubble instance — stop it on
	// unmount so a message scrolled out of view or a chat switch doesn't
	// keep talking in the background.
	$effect(() => () => ttsPlayback?.stop());

	/** Local (on-device model) vs VOICEVOX (HTTP call to a server the user
	 *  runs themselves) have nothing in common except both end in a WAV
	 *  blob — this is the one place that branches on which a chat uses. */
	async function synthesizeForChat(): Promise<Blob> {
		if (chat.tts_provider?.provider === 'voicevox') {
			return synthesizeVoicevox(
				getPreferences().voicevoxBaseUrl,
				displayContent,
				Number(chat.tts_voice_id),
			);
		}
		await preloadTtsModel('default', () => {});
		return synthesize(displayContent, 'default', chat.tts_voice_id as TtsVoiceId);
	}

	async function playTts() {
		ttsState = 'loading';
		try {
			const blob = await synthesizeForChat();
			ttsPlayback?.stop();
			ttsState = 'playing';
			ttsPlayback = await playWithPitch(blob, chat.tts_pitch, chat.tts_speed, () => {
				ttsState = 'idle';
			});
		} catch (err) {
			ttsState = 'idle';
			console.error('Read aloud failed:', err);
		}
	}

	async function handleReadAloud() {
		if (ttsState === 'playing') {
			ttsPlayback?.stop();
			ttsState = 'idle';
			return;
		}
		if (ttsState === 'loading') return;
		// VOICEVOX has nothing to download — the consent flow only applies to
		// the local model, which actually pulls something onto the device.
		if (ttsIsLocal && !getPreferences().ttsConsentGiven) {
			showTtsConsent = true;
			return;
		}
		await playTts();
	}

	async function handleTtsConsentConfirm() {
		showTtsConsent = false;
		await updatePreferences({ ttsConsentGiven: true });
		await playTts();
	}

	function handleTtsConsentCancel() {
		showTtsConsent = false;
	}
</script>

<div
	class="chat group"
	class:chat-end={message.role === 'user'}
	class:chat-start={message.role === 'character'}
>
	<div class="chat-image">
		{#if message.role === 'character'}
			<a href={resolve('/characters/[id]', { id: character.id })}>
				<Avatar name={character.name} imageUrl={character.image_urls[0]} />
			</a>
		{:else}
			<Avatar name={displayName} imageUrl={getMyProfile()?.image_url} />
		{/if}
	</div>
	<div
		class="chat-header flex items-center gap-2 text-sm font-semibold opacity-100 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]"
		class:flex-row-reverse={message.role === 'user'}
	>
		<span class="flex items-baseline gap-2">
			{#if message.role === 'character'}
				<a class="link link-hover" href={resolve('/characters/[id]', { id: character.id })}>{displayName}</a>
			{:else}
				<span>{displayName}</span>
			{/if}
			<span class="text-xs font-normal italic opacity-60">{formattedTime}</span>
		</span>
		{#if !editing && !readonly}
			<div
				class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<button
					class="btn btn-sm btn-ghost btn-circle text-error"
					type="button"
					aria-label={m.chat_bubble_delete_message()}
					title={m.chat_bubble_delete_message()}
					onclick={() => deleteMessage(chatId, message.id)}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M3 6h18" />
						<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
						<path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
						<path d="M10 11v6" />
						<path d="M14 11v6" />
					</svg>
				</button>
				<button
					class="btn btn-sm btn-ghost btn-circle"
					type="button"
					aria-label={m.chat_bubble_edit_message()}
					title={m.chat_bubble_edit_message()}
					onclick={startEdit}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M12 20h9" />
						<path
							d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
						/>
					</svg>
				</button>
			</div>
		{/if}
	</div>
	<div class="chat-bubble">
		{#if editing}
			<textarea
				bind:this={editTextarea}
				class="textarea textarea-bordered text-base-content"
				style="width: {editWidthCh}ch; min-width: {controlsWidth}px; max-width: 100%; max-height: 60vh; min-height: 2.5rem; resize: vertical; overflow-y: auto;"
				bind:value={draft}
			></textarea>
			<div class="mt-1 flex items-center gap-1" bind:clientWidth={controlsWidth}>
				{#if message.role === 'user'}
					<button class="btn btn-xs btn-primary" type="button" onclick={saveAndResend}>
						{m.chat_bubble_send()}
					</button>
					<button class="btn btn-xs btn-ghost" type="button" onclick={saveEditOnly}>
						{m.chat_bubble_save_only()}
					</button>
				{:else}
					<button class="btn btn-xs" type="button" onclick={saveEditOnly}>{m.chat_bubble_save()}</button>
				{/if}
				<button class="btn btn-xs" type="button" onclick={() => stopEditing(message.id)}>{m.chat_bubble_cancel()}</button>
			</div>
		{:else if message.role === 'character' && message.content === ''}
			<p class="italic opacity-60">{m.chat_bubble_replying()}</p>
		{:else}
			<p class="whitespace-pre-wrap">{@html formattedContent}</p>
		{/if}
	</div>
	<div class="chat-footer flex items-center gap-2 text-xs opacity-70">
		{#if branches.length > 1}
			<button class="btn btn-xs btn-ghost" type="button" disabled={branchPos <= 0} onclick={() => goBranch(-1)}>
				‹
			</button>
			<span>{branchPos + 1}/{branches.length}</span>
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={branchPos >= branches.length - 1}
				onclick={() => goBranch(1)}
			>
				›
			</button>
		{/if}
		{#if !editing && !readonly && message.role === 'character'}
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={regenerating}
				aria-label={m.chat_bubble_regenerate_response()}
				title={m.chat_bubble_regenerate_response()}
				onclick={handleRegenerate}
			>
				<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 11-3-6.7" />
					<path d="M21 3v6h-6" />
				</svg>
			</button>
			<button
				class="btn btn-xs btn-ghost"
				type="button"
				disabled={regenerating || message.content === ''}
				aria-label={m.chat_bubble_continue_message()}
				title={m.chat_bubble_continue_message()}
				onclick={handleContinue}
			>
				»
			</button>
			{#if ttsAvailable}
				<button
					class="btn btn-xs btn-ghost"
					type="button"
					disabled={message.content === '' || ttsState === 'loading'}
					aria-label={ttsState === 'playing'
						? m.chat_bubble_read_aloud_stop()
						: m.chat_bubble_read_aloud()}
					title={ttsState === 'playing'
						? m.chat_bubble_read_aloud_stop()
						: m.chat_bubble_read_aloud()}
					onclick={handleReadAloud}
				>
					{#if ttsState === 'loading'}
						<span class="loading loading-spinner loading-xs"></span>
					{:else if ttsState === 'playing'}
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill="currentColor"
							aria-hidden="true"
						>
							<rect x="6" y="6" width="12" height="12" rx="1" />
						</svg>
					{:else}
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M11 5 6 9H3v6h3l5 4V5Z" />
							<path d="M15.5 8.5a5 5 0 0 1 0 7" />
							<path d="M18.5 6a9 9 0 0 1 0 12" />
						</svg>
					{/if}
				</button>
			{/if}
		{/if}
	</div>
</div>

<ConfirmDialog
	open={showTtsConsent}
	title={m.chat_bubble_tts_consent_title()}
	message={m.chat_bubble_tts_consent_message({ sizeMB: TTS_MODELS.default.approxSizeMB })}
	confirmLabel={m.chat_bubble_tts_consent_confirm()}
	onconfirm={handleTtsConsentConfirm}
	oncancel={handleTtsConsentCancel}
/>
