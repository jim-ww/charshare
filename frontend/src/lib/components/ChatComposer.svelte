<script lang="ts">
	import { tick, untrack } from "svelte";
	import type { Chat, Character } from "$lib/types";
	import {
		sendMessage,
		continueChat,
		generateUserDraft,
	} from "$lib/ai/chat";
	import { setChatDraft, getActivePath } from "$lib/state/chats.svelte";
	import { m } from '$lib/paraglide/messages.js';
	import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
	import { startMicRecording, type MicRecording } from "$lib/audio/recordMic";
	import { transcribe, preloadModel } from "$lib/asr/whisperClient";
	import { getPreferences, updatePreferences } from "$lib/state/preferences.svelte";
	import { isWailsDesktop } from "$lib/wails";

	interface Props {
		chat: Chat;
		character: Character;
	}

	let { chat, character }: Props = $props();

	let content = $state("");
	let sending = $state(false);
	let generating = $state(false);
	let error = $state<string | null>(null);
	let abortController: AbortController | null = null;
	let loadedDraftFor: string | null = null;

	// Mic transcription is disabled in the Wails desktop app for now — it
	// triggers an unresolved native memory leak specific to WebKitGTK (not
	// reproducible in Firefox with identical code, and not explained by any
	// fix attempted so far: audio-graph node reuse, GPU-process disabling,
	// worker recycling). Browser usage is unaffected.
	const micSupported =
		typeof navigator !== "undefined" &&
		!!navigator.mediaDevices?.getUserMedia &&
		!isWailsDesktop();
	let micRecording: MicRecording | null = null;
	let listening = $state(false);
	let transcribing = $state(false);
	let showMicConsent = $state(false);
	// null = not downloading; a number = download in progress, percent complete
	let downloadProgress = $state<number | null>(null);

	// Up/down arrow history navigation over the user's own past messages
	// (oldest to newest). -1 means "showing the draft"; 0 is the most recent
	// past message, counting back from there. Reset whenever the chat
	// changes or the user types, so navigation always starts from "newest".
	let historyIndex = $state(-1);
	let draftBackup = "";
	const userHistory = $derived(
		getActivePath(chat)
			.filter((m) => m.role === "user")
			.map((m) => m.content),
	);

	// The composer stays mounted while navigating between chats (same route,
	// different :id param), so `content` needs re-syncing to the new chat's
	// saved draft rather than carrying over the previous chat's text.
	$effect(() => {
		if (chat.id !== loadedDraftFor) {
			untrack(() => {
				content = chat.draft;
				loadedDraftFor = chat.id;
				historyIndex = -1;
				draftBackup = "";
			});
		}
	});

	$effect(() => {
		const text = content;
		untrack(() => setChatDraft(chat.id, text));
	});

	async function handleSend(event: SubmitEvent) {
		event.preventDefault();
		if (sending) {
			abortController?.abort();
			return;
		}
		const trimmed = content.trim();
		// Clear the box the moment the send goes out, so it doesn't sit there
		// while the AI replies — restored below if the send doesn't pan out.
		const backup = content;
		if (trimmed) content = "";
		const controller = new AbortController();
		abortController = controller;
		sending = true;
		error = null;
		try {
			if (trimmed) {
				await sendMessage(chat, character, trimmed, {
					signal: controller.signal,
				});
			} else {
				await continueChat(chat, character, {
					signal: controller.signal,
				});
			}
			historyIndex = -1;
			draftBackup = "";
		} catch (err) {
			content = backup;
			if (
				!(
					err instanceof DOMException &&
					err.name === "AbortError"
				)
			) {
				error = m.error_generic({
					message: err instanceof Error ? err.message : String(err),
				});
			}
		} finally {
			sending = false;
			abortController = null;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend(
				new SubmitEvent("submit", { cancelable: true }),
			);
			return;
		}
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			const textarea =
				event.currentTarget as HTMLTextAreaElement;
			// Only hijack the arrow keys at the very start/end of the text (no
			// selection), so navigating within a multi-line draft still works.
			const atStart =
				textarea.selectionStart === 0 &&
				textarea.selectionEnd === 0;
			const atEnd =
				textarea.selectionStart === content.length &&
				textarea.selectionEnd === content.length;
			if (event.key === "ArrowUp" && atStart) {
				event.preventDefault();
				navigateHistory("up", textarea);
			} else if (event.key === "ArrowDown" && atEnd) {
				event.preventDefault();
				navigateHistory("down", textarea);
			}
		}
	}

	function navigateHistory(
		direction: "up" | "down",
		textarea: HTMLTextAreaElement,
	) {
		const history = userHistory;
		if (direction === "up") {
			if (historyIndex + 1 >= history.length) return;
			if (historyIndex === -1) draftBackup = content;
			historyIndex += 1;
			content = history[history.length - 1 - historyIndex];
		} else {
			if (historyIndex === -1) return;
			historyIndex -= 1;
			content =
				historyIndex === -1
					? draftBackup
					: history[
							history.length -
								1 -
								historyIndex
						];
		}
		void tick().then(() => {
			const pos = content.length;
			textarea.setSelectionRange(pos, pos);
		});
	}

	function handleInput() {
		// Manual typing means the box no longer reflects a history entry —
		// treat whatever's there now as the draft going forward.
		historyIndex = -1;
	}

	async function handleMicClick() {
		if (listening) {
			await stopRecording();
			return;
		}
		if (!getPreferences().whisperConsentGiven) {
			showMicConsent = true;
			return;
		}
		// Already consented: preloadModel resolves quickly (and reports 100%
		// almost immediately) when the model is already cached, so this is a
		// no-op download bar in the common case, not a repeat prompt.
		await downloadModelThenRecord();
	}

	async function startRecording() {
		error = null;
		try {
			micRecording = await startMicRecording(
				getPreferences().micSilenceTimeoutMs,
				() => {
					// Only auto-stop if this is still the active recording — a
					// stale silence callback can fire after the user already
					// pressed stop manually.
					if (listening) void stopRecording();
				},
			);
			listening = true;
		} catch (err) {
			// Log the real DOMException (name + message) rather than
			// collapsing everything into one generic string — getUserMedia
			// failures span permission denial, no device found, GStreamer
			// backend issues, etc., and only the real error tells them apart.
			console.error("getUserMedia failed:", err);
			error = m.chat_composer_mic_error_permission();
		}
	}

	async function stopRecording() {
		const recording = micRecording;
		micRecording = null;
		listening = false;
		if (!recording) return;
		transcribing = true;
		try {
			const audio = await recording.stop();
			const text = await transcribe(audio);
			if (text) {
				content = content ? content.trimEnd() + " " + text : text;
				historyIndex = -1;
			}
		} catch (err) {
			error = m.chat_composer_mic_error_transcribe({
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			transcribing = false;
		}
	}

	async function handleMicConsentConfirm() {
		showMicConsent = false;
		await updatePreferences({ whisperConsentGiven: true });
		await downloadModelThenRecord();
	}

	function handleMicConsentCancel() {
		showMicConsent = false;
	}

	async function downloadModelThenRecord() {
		error = null;
		downloadProgress = 0;
		try {
			await preloadModel((percent) => {
				downloadProgress = percent;
			});
		} catch (err) {
			downloadProgress = null;
			error = m.chat_composer_mic_error_transcribe({
				message: err instanceof Error ? err.message : String(err),
			});
			return;
		}
		downloadProgress = null;
		await startRecording();
	}

	async function handleGenerateForMe() {
		generating = true;
		error = null;
		try {
			content = await generateUserDraft(chat, character);
			historyIndex = -1;
			draftBackup = "";
		} catch (err) {
			error = m.error_generic({
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			generating = false;
		}
	}
</script>

<form
	class="flex flex-col gap-2 p-3"
	onsubmit={handleSend}
>
	<div class="relative">
		<textarea
			class="textarea textarea-bordered w-full pb-10"
			rows="4"
			placeholder={m.chat_composer_placeholder()}
			bind:value={content}
			onkeydown={handleKeydown}
			oninput={handleInput}
		></textarea>
		<button
			class="btn btn-sm btn-circle btn-ghost absolute bottom-2 left-2"
			type="button"
			disabled={generating}
			aria-label={generating
				? m.chat_composer_generating()
				: m.chat_composer_generate_for_me()}
			title={generating ? m.chat_composer_generating() : m.chat_composer_generate_for_me()}
			onclick={handleGenerateForMe}
		>
			{#if generating}
				<span class="loading loading-spinner loading-xs"
				></span>
			{:else}
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
					/>
				</svg>
			{/if}
		</button>
		{#if micSupported}
			<button
				class="btn btn-sm btn-circle btn-ghost absolute bottom-2 left-12"
				class:text-error={listening}
				type="button"
				disabled={transcribing || downloadProgress !== null}
				aria-label={listening
					? m.chat_composer_mic_stop()
					: m.chat_composer_mic_start()}
				title={downloadProgress !== null
					? m.chat_composer_mic_downloading({ percent: downloadProgress })
					: transcribing
						? m.chat_composer_mic_transcribing()
						: listening
							? m.chat_composer_mic_recording()
							: m.chat_composer_mic_start()}
				onclick={handleMicClick}
			>
				{#if downloadProgress !== null}
					<div
						class="radial-progress text-xs"
						style="--value:{downloadProgress}; --size:1.1rem; --thickness: 2px;"
						role="progressbar"
						aria-valuenow={downloadProgress}
					></div>
				{:else if transcribing}
					<span class="loading loading-spinner loading-xs"
					></span>
				{:else if listening}
					<span class="loading loading-ring loading-xs text-error"
					></span>
				{:else}
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect
							x="9"
							y="2"
							width="6"
							height="11"
							rx="3"
						/>
						<path d="M5 10v1a7 7 0 0 0 14 0v-1" />
						<path d="M12 18v3M9 21h6" />
					</svg>
				{/if}
			</button>
		{/if}
		<button
			class="btn btn-sm btn-primary btn-soft btn-circle absolute right-2 bottom-2"
			type="submit"
			aria-label={sending ? m.chat_composer_stop() : m.chat_composer_send()}
		>
			{#if sending}
				<svg
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="currentColor"
					aria-hidden="true"
				>
					<rect
						x="6"
						y="6"
						width="12"
						height="12"
						rx="1.5"
					/>
				</svg>
			{:else}
				<svg
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M12 19V5" />
					<path d="M5 12l7-7 7 7" />
				</svg>
			{/if}
		</button>
	</div>
	{#if error}
		<p class="text-error text-sm">{error}</p>
	{/if}
</form>

<ConfirmDialog
	open={showMicConsent}
	title={m.chat_composer_mic_consent_title()}
	message={m.chat_composer_mic_consent_message()}
	confirmLabel={m.chat_composer_mic_consent_confirm()}
	onconfirm={handleMicConsentConfirm}
	oncancel={handleMicConsentCancel}
/>
