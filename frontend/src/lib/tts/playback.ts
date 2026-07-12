import { PitchShifter } from 'soundtouchjs';

// One AudioContext per tab, created lazily on first use — browsers require
// it to start from a user gesture (a click), so this can't be constructed
// eagerly at module load.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx) {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

export interface PitchedPlayback {
	stop: () => void;
}

/** Plays a synthesized WAV blob with independent pitch and speed controls —
 *  unlike HTMLAudioElement.playbackRate, which changes both together, this
 *  uses SoundTouchJS's WSOLA implementation so either can move on its own.
 *  Both `pitch` and `speed` are ratios (1 = unchanged, >1 = higher/faster,
 *  <1 = lower/slower). Calls `onEnd` once when playback finishes naturally;
 *  does not fire it if `stop()` is called first. Browser-only — see
 *  ChatBubble.svelte, which hides the read-aloud button entirely in the
 *  Wails desktop app (its WebKitGTK webview's audio playback is broken at
 *  the native/GStreamer level and crashes the whole WebProcess, the same
 *  class of desktop-webview audio unreliability that already keeps the mic
 *  button off there — see wails.ts/ChatComposer.svelte). */
export async function playWithPitch(
	blob: Blob,
	pitch: number,
	speed: number,
	onEnd: () => void,
): Promise<PitchedPlayback> {
	const ctx = getAudioContext();
	const arrayBuffer = await blob.arrayBuffer();
	const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

	let ended = false;
	const shifter = new PitchShifter(ctx, audioBuffer, 4096, () => {
		if (!ended) {
			ended = true;
			onEnd();
		}
	});
	shifter.tempo = speed;
	shifter.pitch = pitch;
	shifter.connect(ctx.destination);

	return {
		stop: () => {
			if (ended) return;
			ended = true;
			shifter.disconnect();
		},
	};
}
