import { PitchShifter } from 'soundtouchjs';
import { isWailsDesktop } from '$lib/wails';

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
 *  does not fire it if `stop()` is called first.
 *
 *  Wails' Linux webview (WebKitGTK) hangs indefinitely on
 *  `ScriptProcessorNode`-based playback — no error, no sound, pegged CPU
 *  (the same class of desktop-webview audio unreliability that already
 *  keeps the mic button off there, see wails.ts/ChatComposer.svelte) — so
 *  the desktop build skips SoundTouch entirely and plays through a plain
 *  `<audio>` element instead, via `playbackRate` for speed only; pitch
 *  can't move independently of speed that way, so it's ignored there. */
export async function playWithPitch(
	blob: Blob,
	pitch: number,
	speed: number,
	onEnd: () => void,
): Promise<PitchedPlayback> {
	if (isWailsDesktop()) {
		return playWithAudioElement(blob, speed, onEnd);
	}

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

function playWithAudioElement(blob: Blob, speed: number, onEnd: () => void): PitchedPlayback {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	audio.playbackRate = speed;

	let ended = false;
	function finish() {
		if (ended) return;
		ended = true;
		URL.revokeObjectURL(url);
		onEnd();
	}
	audio.addEventListener('ended', finish);
	audio.addEventListener('error', finish);
	void audio.play();

	return {
		stop: () => {
			if (ended) return;
			ended = true;
			audio.pause();
			URL.revokeObjectURL(url);
		},
	};
}
