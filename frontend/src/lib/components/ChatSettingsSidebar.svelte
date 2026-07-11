<script lang="ts">
	import type { Chat } from '$lib/types';
	import {
		addChatBackground,
		removeChatBackground,
		setChatActiveBackground,
		setChatTtsProvider,
		setChatTtsVoice,
		setChatTtsPitch,
		setChatTtsSpeed
	} from '$lib/state/chats.svelte';
	import { TTS_VOICES, type TtsVoiceId } from '$lib/tts/ttsClient';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		chat: Chat;
		onclose: () => void;
	}

	let { chat, onclose }: Props = $props();

	let newUrl = $state('');

	function handleAdd() {
		if (!newUrl.trim()) return;
		void addChatBackground(chat.id, newUrl);
		newUrl = '';
	}

	const ttsVoiceIds = Object.keys(TTS_VOICES) as TtsVoiceId[];

	const ttsEnabled = $derived(chat.tts_provider !== null);

	function handleTtsToggle(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		void setChatTtsProvider(chat.id, enabled ? { provider: 'local' } : null);
	}

	function handlePitchInput(event: Event) {
		void setChatTtsPitch(chat.id, Number((event.currentTarget as HTMLInputElement).value));
	}

	function handleSpeedInput(event: Event) {
		void setChatTtsSpeed(chat.id, Number((event.currentTarget as HTMLInputElement).value));
	}

	// Labeled anchor points on the pitch slider — the numbers alone don't
	// tell you "this sounds like a young kid" vs "this sounds like an old
	// man", so name the effect instead of just the multiplier.
	const PITCH_PRESETS: { label: () => string; value: number }[] = [
		{ label: () => m.chat_settings_tts_pitch_deep(), value: 0.75 },
		{ label: () => m.chat_settings_tts_pitch_low(), value: 0.9 },
		{ label: () => m.chat_settings_tts_pitch_normal(), value: 1 },
		{ label: () => m.chat_settings_tts_pitch_high(), value: 1.2 },
		{ label: () => m.chat_settings_tts_pitch_very_high(), value: 1.4 }
	];

	const SPEED_PRESETS: { label: () => string; value: number }[] = [
		{ label: () => m.chat_settings_tts_speed_slow(), value: 0.75 },
		{ label: () => m.chat_settings_tts_speed_normal(), value: 1 },
		{ label: () => m.chat_settings_tts_speed_fast(), value: 1.25 },
		{ label: () => m.chat_settings_tts_speed_very_fast(), value: 1.5 }
	];
</script>

<div class="flex h-full w-72 shrink-0 flex-col gap-4 border-l border-base-300 bg-base-100 p-4">
	<div class="flex items-center justify-between">
		<h3 class="font-semibold">{m.chat_settings_heading()}</h3>
		<button class="btn btn-xs btn-ghost" type="button" onclick={onclose} aria-label={m.chat_settings_close()}>
			✕
		</button>
	</div>

	<div class="flex flex-col gap-2">
		<span class="label-text">{m.chat_settings_background_label()}</span>

		<div class="grid grid-cols-3 gap-2">
			<button
				class="btn btn-xs h-12"
				class:btn-primary={chat.active_background === null}
				type="button"
				onclick={() => setChatActiveBackground(chat.id, null)}
			>
				{m.chat_settings_background_none()}
			</button>
			{#each chat.backgrounds as url (url)}
				<div class="group relative">
					<button
						class="h-12 w-full rounded border-2 bg-cover bg-center"
						class:border-primary={chat.active_background === url}
						class:border-transparent={chat.active_background !== url}
						style="background-image: url('{url}')"
						type="button"
						title={url}
						onclick={() => setChatActiveBackground(chat.id, url)}
						aria-label={m.chat_settings_background_use()}
					></button>
					<button
						class="btn btn-xs btn-circle btn-error absolute -top-2 -right-2 hidden group-hover:flex"
						type="button"
						aria-label={m.chat_settings_background_delete()}
						onclick={() => removeChatBackground(chat.id, url)}
					>
						✕
					</button>
				</div>
			{/each}
		</div>

		<div class="mt-2 flex gap-2">
			<input
				class="input input-bordered input-sm flex-1"
				type="url"
				placeholder={m.chat_settings_background_placeholder()}
				bind:value={newUrl}
				onkeydown={(e) => e.key === 'Enter' && handleAdd()}
			/>
			<button class="btn btn-sm" type="button" onclick={handleAdd}>{m.chat_settings_background_add()}</button>
		</div>
	</div>

	<div class="divider my-0"></div>

	<div class="flex flex-col gap-2">
		<label class="label w-fit cursor-pointer gap-2 p-0">
			<input type="checkbox" class="toggle toggle-sm" checked={ttsEnabled} onchange={handleTtsToggle} />
			<span class="label-text">{m.chat_settings_tts_toggle_label()}</span>
		</label>

		{#if ttsEnabled}
			<div class="mt-1 flex flex-col gap-1">
				<span class="label-text text-xs">{m.chat_settings_tts_voice_label()}</span>
				<select
					class="select select-bordered select-sm w-full"
					value={chat.tts_voice_id}
					onchange={(e) => setChatTtsVoice(chat.id, e.currentTarget.value as TtsVoiceId)}
				>
					{#each ttsVoiceIds as voiceId (voiceId)}
						<option value={voiceId}>{TTS_VOICES[voiceId].label}</option>
					{/each}
				</select>
			</div>

			<div class="mt-2 flex flex-col gap-1">
				<span class="label-text text-xs">
					{m.chat_settings_tts_pitch_label({ value: chat.tts_pitch.toFixed(2) })}
				</span>
				<input
					class="range range-sm"
					type="range"
					min="0.6"
					max="1.6"
					step="0.05"
					value={chat.tts_pitch}
					oninput={handlePitchInput}
				/>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each PITCH_PRESETS as preset (preset.value)}
						<button
							type="button"
							class="btn btn-xs"
							class:btn-primary={chat.tts_pitch === preset.value}
							class:btn-outline={chat.tts_pitch !== preset.value}
							onclick={() => setChatTtsPitch(chat.id, preset.value)}
						>
							{preset.label()}
						</button>
					{/each}
				</div>
				<span class="mt-1 text-xs opacity-70">{m.chat_settings_tts_pitch_hint()}</span>
			</div>

			<div class="mt-2 flex flex-col gap-1">
				<span class="label-text text-xs">
					{m.chat_settings_tts_speed_label({ value: chat.tts_speed.toFixed(2) })}
				</span>
				<input
					class="range range-sm"
					type="range"
					min="0.6"
					max="1.6"
					step="0.05"
					value={chat.tts_speed}
					oninput={handleSpeedInput}
				/>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each SPEED_PRESETS as preset (preset.value)}
						<button
							type="button"
							class="btn btn-xs"
							class:btn-primary={chat.tts_speed === preset.value}
							class:btn-outline={chat.tts_speed !== preset.value}
							onclick={() => setChatTtsSpeed(chat.id, preset.value)}
						>
							{preset.label()}
						</button>
					{/each}
				</div>
				<span class="mt-1 text-xs opacity-70">{m.chat_settings_tts_speed_hint()}</span>
			</div>
		{/if}
	</div>
</div>
