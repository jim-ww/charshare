<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { isWailsDesktop } from '$lib/wails';
	import {
		WHISPER_MODELS,
		isModelCached,
		deleteModel,
		preloadModel,
		type WhisperModelSize,
	} from '$lib/asr/whisperClient';
	import {
		TTS_MODELS,
		TTS_VOICES,
		isModelCached as isTtsModelCached,
		deleteModel as deleteTtsModel,
		preloadModel as preloadTtsModel,
		synthesize,
		type TtsModelId,
	} from '$lib/tts/ttsClient';

	// Mic transcription (and thus its silence-timeout/model settings) isn't
	// offered in the Wails desktop app — see ChatComposer.svelte.
	const showMicSettings = !isWailsDesktop();

	const preferences = $derived(getPreferences());

	// Cached-state and download-progress per model size, so both rows can
	// show their own status independently.
	let cachedState = $state<Record<WhisperModelSize, boolean>>({
		tiny: false,
		base: false,
	});
	let downloadProgress = $state<Record<WhisperModelSize, number | null>>({
		tiny: null,
		base: null,
	});

	async function refreshCachedState() {
		for (const size of Object.keys(WHISPER_MODELS) as WhisperModelSize[]) {
			cachedState[size] = await isModelCached(size);
		}
	}

	if (showMicSettings) {
		void refreshCachedState();
	}

	function selectWhisperModel(size: WhisperModelSize) {
		updatePreferences({ whisperModelSize: size });
	}

	async function handleWhisperModelDownload(size: WhisperModelSize) {
		downloadProgress[size] = 0;
		try {
			await preloadModel(size, (percent) => {
				downloadProgress[size] = percent;
			});
			cachedState[size] = true;
		} finally {
			downloadProgress[size] = null;
		}
	}

	async function handleWhisperModelDelete(size: WhisperModelSize) {
		await deleteModel(size);
		cachedState[size] = false;
	}

	const whisperModelSizes = Object.keys(WHISPER_MODELS) as WhisperModelSize[];

	const micSilenceEnabled = $derived(preferences.micSilenceTimeoutMs !== null);

	function handleMicSilenceToggle(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		updatePreferences({ micSilenceTimeoutMs: enabled ? 1500 : null });
	}

	function handleMicSilenceTimeoutChange(event: Event) {
		updatePreferences({
			micSilenceTimeoutMs: Number((event.currentTarget as HTMLInputElement).value),
		});
	}

	// --- Text-to-speech -----------------------------------------------------
	// Model downloads/caching are managed here (device-wide), but provider,
	// voice, and pitch *selection* are per-chat — see ChatSettingsSidebar.
	// This tab's job is just making sure the capability is available.

	let ttsCachedState = $state<Record<TtsModelId, boolean>>({ default: false });
	let ttsDownloadProgress = $state<Record<TtsModelId, number | null>>({ default: null });

	async function refreshTtsCachedState() {
		for (const id of Object.keys(TTS_MODELS) as TtsModelId[]) {
			ttsCachedState[id] = await isTtsModelCached(id);
		}
	}

	void refreshTtsCachedState();

	const ttsModelIds = Object.keys(TTS_MODELS) as TtsModelId[];

	async function handleTtsModelDownload(id: TtsModelId) {
		ttsDownloadProgress[id] = 0;
		try {
			await preloadTtsModel(id, (percent) => {
				ttsDownloadProgress[id] = percent;
			});
			ttsCachedState[id] = true;
		} finally {
			ttsDownloadProgress[id] = null;
		}
	}

	async function handleTtsModelDelete(id: TtsModelId) {
		await deleteTtsModel(id);
		ttsCachedState[id] = false;
	}

	const ttsVoiceIds = Object.keys(TTS_VOICES) as (keyof typeof TTS_VOICES)[];

	// Just for testing the downloaded model works — not persisted anywhere;
	// the voice actually used for a chat is picked in its own settings.
	let previewVoiceId = $state<keyof typeof TTS_VOICES>('f1');
	let previewing = $state(false);
	let previewAudio: HTMLAudioElement | undefined;

	async function handlePreviewVoice() {
		if (previewing) return;
		previewing = true;
		try {
			const blob = await synthesize(m.sound_tab_tts_preview_text(), 'default', previewVoiceId);
			previewAudio?.pause();
			previewAudio = new Audio(URL.createObjectURL(blob));
			await previewAudio.play();
		} finally {
			previewing = false;
		}
	}

	// --- VOICEVOX (remote/local-HTTP engine) ---------------------------------
	// No download to manage here — this is a server the user runs themselves,
	// same as the Ollama chat provider. Only the address is configured here;
	// which character/voice to use is picked per chat.

	function handleVoicevoxUrlChange(event: Event) {
		updatePreferences({ voicevoxBaseUrl: (event.currentTarget as HTMLInputElement).value });
	}
</script>

<div class="flex flex-col gap-4">
	<h3 class="text-sm font-semibold opacity-70">{m.sound_tab_stt_heading()}</h3>

	{#if showMicSettings}
		<div class="form-control w-full max-w-md">
			<label class="label w-fit cursor-pointer gap-2">
				<input
					type="checkbox"
					class="toggle"
					checked={micSilenceEnabled}
					onchange={handleMicSilenceToggle}
				/>
				<span class="label-text">{m.general_tab_mic_silence_toggle_label()}</span>
			</label>
			{#if micSilenceEnabled}
				<label class="mt-2 block">
					<span class="label-text">
						{m.general_tab_mic_silence_timeout_label({
							seconds: (preferences.micSilenceTimeoutMs! / 1000).toFixed(1),
						})}
					</span>
					<input
						class="range"
						type="range"
						min="500"
						max="5000"
						step="250"
						value={preferences.micSilenceTimeoutMs}
						oninput={handleMicSilenceTimeoutChange}
					/>
				</label>
			{/if}
			<span class="mt-1 text-sm opacity-70">{m.general_tab_mic_silence_hint()}</span>
		</div>

		<div class="form-control w-full max-w-md">
			<span class="label-text mb-1 block">{m.general_tab_whisper_model_label()}</span>
			<div class="flex flex-col gap-2">
				{#each whisperModelSizes as size (size)}
					<div class="border-base-300 flex items-center gap-2 rounded-lg border p-2">
						<label class="flex flex-1 cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="whisper-model-size"
								class="radio radio-sm"
								checked={preferences.whisperModelSize === size}
								onchange={() => selectWhisperModel(size)}
							/>
							<span class="text-sm">
								{size === 'tiny'
									? m.general_tab_whisper_model_tiny_label()
									: m.general_tab_whisper_model_base_label()}
							</span>
						</label>
						{#if downloadProgress[size] !== null}
							<span class="text-xs opacity-70">
								{m.general_tab_whisper_model_downloading({ percent: downloadProgress[size] })}
							</span>
						{:else if cachedState[size]}
							<span class="badge badge-success badge-sm">
								{m.general_tab_whisper_model_cached()}
							</span>
							<button
								type="button"
								class="btn btn-outline btn-xs"
								onclick={() => handleWhisperModelDelete(size)}
							>
								{m.general_tab_whisper_model_delete()}
							</button>
						{:else}
							<span class="badge badge-ghost badge-sm">
								{m.general_tab_whisper_model_not_cached()}
							</span>
							<button
								type="button"
								class="btn btn-outline btn-xs"
								onclick={() => handleWhisperModelDownload(size)}
							>
								{m.general_tab_whisper_model_download()}
							</button>
						{/if}
					</div>
				{/each}
			</div>
			<span class="mt-1 text-sm opacity-70">{m.general_tab_whisper_model_hint()}</span>
		</div>
	{/if}

	<div class="divider"></div>

	<h3 class="text-sm font-semibold opacity-70">{m.sound_tab_tts_heading()}</h3>
	<p class="-mt-2 text-sm opacity-70">{m.sound_tab_tts_intro()}</p>

	<h4 class="text-sm font-semibold opacity-60">{m.sound_tab_tts_engine_supertonic()}</h4>
	<div class="form-control w-full max-w-md">
		<span class="label-text mb-1 block">{m.sound_tab_tts_model_label()}</span>
		<div class="flex flex-col gap-2">
			{#each ttsModelIds as id (id)}
				<div class="border-base-300 flex items-center gap-2 rounded-lg border p-2">
					<span class="flex-1 text-sm">{m.sound_tab_tts_model_default_label()}</span>
					{#if ttsDownloadProgress[id] !== null}
						<span class="text-xs opacity-70">
							{m.general_tab_whisper_model_downloading({ percent: ttsDownloadProgress[id] })}
						</span>
					{:else if ttsCachedState[id]}
						<span class="badge badge-success badge-sm">
							{m.general_tab_whisper_model_cached()}
						</span>
						<button
							type="button"
							class="btn btn-outline btn-xs"
							onclick={() => handleTtsModelDelete(id)}
						>
							{m.general_tab_whisper_model_delete()}
						</button>
					{:else}
						<span class="badge badge-ghost badge-sm">
							{m.general_tab_whisper_model_not_cached()}
						</span>
						<button
							type="button"
							class="btn btn-outline btn-xs"
							onclick={() => handleTtsModelDownload(id)}
						>
							{m.general_tab_whisper_model_download()}
						</button>
					{/if}
				</div>
			{/each}
		</div>
		<span class="mt-1 text-sm opacity-70">{m.sound_tab_tts_model_hint()}</span>
	</div>

	<div class="form-control w-full max-w-md">
		<span class="label-text mb-1 block">{m.sound_tab_tts_preview_label()}</span>
		<select class="select select-bordered select-sm w-40" bind:value={previewVoiceId}>
			{#each ttsVoiceIds as voiceId (voiceId)}
				<option value={voiceId}>{TTS_VOICES[voiceId].label}</option>
			{/each}
		</select>
		<button
			type="button"
			class="btn btn-outline btn-sm mt-2 w-fit"
			disabled={previewing}
			onclick={handlePreviewVoice}
		>
			{previewing ? m.sound_tab_tts_preview_playing() : m.sound_tab_tts_preview_button()}
		</button>
	</div>

	<div class="divider my-0"></div>

	<h4 class="text-sm font-semibold opacity-60">{m.sound_tab_tts_engine_voicevox()}</h4>
	<label class="form-control w-full max-w-md">
		<span class="label-text mb-1 block">{m.sound_tab_tts_voicevox_url_label()}</span>
		<input
			class="input input-bordered w-full"
			type="url"
			value={preferences.voicevoxBaseUrl}
			onchange={handleVoicevoxUrlChange}
		/>
		<span class="mt-1 text-sm opacity-70">{m.sound_tab_tts_voicevox_url_hint()}</span>
	</label>
</div>
