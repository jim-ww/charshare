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
	import { getPreferences } from '$lib/state/preferences.svelte';
	import { TTS_VOICES, type TtsVoiceId } from '$lib/tts/ttsClient';
	import { fetchSpeakers, type VoicevoxSpeaker } from '$lib/tts/voicevoxClient';
	import { isWailsDesktop } from '$lib/wails';
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

	const supertonicVoiceIds = Object.keys(TTS_VOICES) as TtsVoiceId[];

	const ttsEnabled = $derived(chat.tts_provider !== null);
	const ttsProviderKind = $derived(chat.tts_provider?.provider ?? 'local');

	function handleTtsToggle(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		void setChatTtsProvider(chat.id, enabled ? { provider: 'local' } : null);
	}

	// Zundamon's "Normal" style — id 3 in VOICEVOX's stable speaker ordering,
	// well-established across the ecosystem (most sample code/tutorials use
	// it as the default) — a reasonable default rather than an empty pick.
	const VOICEVOX_DEFAULT_STYLE_ID = '3';

	// Switching provider resets the voice — Supertonic's "f1" and a VOICEVOX
	// style id are different namespaces entirely, so keeping the old value
	// around would silently point at nothing.
	function setTtsProviderKind(provider: 'local' | 'voicevox') {
		void setChatTtsProvider(chat.id, { provider });
		void setChatTtsVoice(chat.id, provider === 'local' ? 'f1' : VOICEVOX_DEFAULT_STYLE_ID);
	}

	// VOICEVOX has no fixed voice list — it depends on whichever characters
	// are loaded in the server the user is running, so it's fetched live
	// rather than baked in like the local model's voices.
	let voicevoxSpeakers = $state<VoicevoxSpeaker[] | null>(null);
	let voicevoxError = $state<string | null>(null);
	let voicevoxLoading = $state(false);

	async function loadVoicevoxSpeakers() {
		voicevoxLoading = true;
		voicevoxError = null;
		try {
			voicevoxSpeakers = await fetchSpeakers(getPreferences().voicevoxBaseUrl);
		} catch (err) {
			voicevoxError = err instanceof Error ? err.message : String(err);
		} finally {
			voicevoxLoading = false;
		}
	}

	$effect(() => {
		if (ttsProviderKind === 'voicevox' && voicevoxSpeakers === null && !voicevoxLoading) {
			void loadVoicevoxSpeakers();
		}
	});

	// Character and tone/style are two different axes of the same voice id —
	// VOICEVOX addresses a specific (character, style) pair as one style id,
	// but picking "who" and "how they're speaking" (normal/whispering/etc.)
	// separately is clearer than one long flattened list.
	const currentVoicevoxSpeaker = $derived(
		voicevoxSpeakers?.find((speaker) =>
			speaker.styles.some((style) => String(style.id) === chat.tts_voice_id),
		) ?? null,
	);

	function setVoicevoxCharacter(speakerName: string) {
		const speaker = voicevoxSpeakers?.find((s) => s.name === speakerName);
		const firstStyle = speaker?.styles[0];
		if (firstStyle) void setChatTtsVoice(chat.id, String(firstStyle.id));
	}

	function handlePitchInput(event: Event) {
		void setChatTtsPitch(chat.id, Number((event.currentTarget as HTMLInputElement).value));
	}

	function handleSpeedInput(event: Event) {
		void setChatTtsSpeed(chat.id, Number((event.currentTarget as HTMLInputElement).value));
	}

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

	{#if !isWailsDesktop()}
	<div class="divider my-0"></div>

	<div class="flex flex-col gap-2">
		<label class="label w-fit cursor-pointer gap-2 p-0">
			<input type="checkbox" class="toggle toggle-sm" checked={ttsEnabled} onchange={handleTtsToggle} />
			<span class="label-text">{m.chat_settings_tts_toggle_label()}</span>
		</label>

		{#if ttsEnabled}
			<div class="mt-1 flex flex-col gap-1">
				<span class="label-text text-xs">{m.chat_settings_tts_provider_label()}</span>
				<select
					class="select select-bordered select-sm w-full"
					bind:value={() => ttsProviderKind, setTtsProviderKind}
				>
					<option value="local">{m.chat_settings_tts_provider_local()}</option>
					<option value="voicevox">{m.chat_settings_tts_provider_voicevox()}</option>
				</select>
			</div>

			{#if ttsProviderKind === 'voicevox'}
				{#if voicevoxLoading}
					<span class="text-xs opacity-70">{m.chat_settings_tts_voicevox_loading()}</span>
				{:else if voicevoxError}
					<span class="text-error text-xs">
						{m.chat_settings_tts_voicevox_error({ error: voicevoxError })}
					</span>
					<button type="button" class="btn btn-outline btn-xs mt-1 w-fit" onclick={loadVoicevoxSpeakers}>
						{m.chat_settings_tts_voicevox_retry()}
					</button>
				{:else if voicevoxSpeakers}
					<div class="mt-1 flex flex-col gap-1">
						<span class="label-text text-xs">{m.chat_settings_tts_voicevox_character_label()}</span>
						<select
							class="select select-bordered select-sm w-full"
							bind:value={() => currentVoicevoxSpeaker?.name ?? '', setVoicevoxCharacter}
						>
							{#each voicevoxSpeakers as speaker (speaker.name)}
								<option value={speaker.name}>{speaker.name}</option>
							{/each}
						</select>
					</div>

					{#if currentVoicevoxSpeaker}
						<div class="mt-1 flex flex-col gap-1">
							<span class="label-text text-xs">{m.chat_settings_tts_voicevox_tone_label()}</span>
							<select
								class="select select-bordered select-sm w-full"
								bind:value={
									() => chat.tts_voice_id, (v) => setChatTtsVoice(chat.id, v)
								}
							>
								{#each currentVoicevoxSpeaker.styles as style (style.id)}
									<option value={String(style.id)}>{style.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				{/if}
			{:else}
				<div class="mt-1 flex flex-col gap-1">
					<span class="label-text text-xs">{m.chat_settings_tts_voice_label()}</span>
					<select
						class="select select-bordered select-sm w-full"
						bind:value={() => chat.tts_voice_id, (v) => setChatTtsVoice(chat.id, v)}
					>
						{#each supertonicVoiceIds as voiceId (voiceId)}
							<option value={voiceId}>{TTS_VOICES[voiceId].label}</option>
						{/each}
					</select>
				</div>
			{/if}

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
			</div>
		{/if}
	</div>
	{/if}
</div>
