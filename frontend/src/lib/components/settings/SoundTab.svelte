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
</script>

<div class="flex flex-col gap-4">
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
</div>
