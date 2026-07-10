const WHISPER_SAMPLE_RATE = 16000;

// RMS thresholds are on a 0-1 scale (normalized time-domain samples).
// SPEECH must be crossed at least once before silence is allowed to
// auto-stop, so a quiet room at the start of recording doesn't trigger it.
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_RMS_THRESHOLD = 0.012;

export interface MicRecording {
	stop(): Promise<Float32Array>;
}

/** Starts recording from the microphone. Returns a handle whose `stop()`
 *  ends the recording and resolves to mono 16kHz PCM, the format Whisper
 *  expects. Browser-only (see ChatComposer.svelte, which hides the mic
 *  button entirely in the Wails desktop app).
 *
 *  `silenceTimeoutMs` — how long the user must stay quiet after having
 *  spoken before `onSilence` fires (the caller decides what to do,
 *  typically call `stop()` — this module never stops recording on its
 *  own). Pass `null` to disable auto-stop entirely (user preference —
 *  see Preferences' micSilenceTimeoutMs). */
export async function startMicRecording(
	silenceTimeoutMs: number | null,
	onSilence?: () => void,
): Promise<MicRecording> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	recorder.start();

	const silenceWatcher =
		onSilence && silenceTimeoutMs !== null
			? watchForSilence(stream, silenceTimeoutMs, onSilence)
			: null;

	return {
		stop(): Promise<Float32Array> {
			silenceWatcher?.cancel();
			return new Promise((resolve, reject) => {
				recorder.onstop = async () => {
					for (const track of stream.getTracks()) track.stop();
					try {
						resolve(await decodeToWhisperRate(new Blob(chunks)));
					} catch (err) {
						reject(err instanceof Error ? err : new Error(String(err)));
					}
				};
				recorder.stop();
			});
		},
	};
}

async function decodeToWhisperRate(blob: Blob): Promise<Float32Array> {
	const audioCtx = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
	try {
		const buffer = await audioCtx.decodeAudioData(await blob.arrayBuffer());
		return buffer.getChannelData(0);
	} finally {
		await audioCtx.close();
	}
}

/** Opens a short-lived AudioContext/AnalyserNode just to watch for
 *  post-speech silence, independent of the MediaRecorder capturing the
 *  actual audio. */
function watchForSilence(stream: MediaStream, silenceTimeoutMs: number, onSilence: () => void) {
	const audioCtx = new AudioContext();
	const source = audioCtx.createMediaStreamSource(stream);
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 1024;
	source.connect(analyser);

	const samples = new Float32Array(analyser.fftSize);
	let hasSpoken = false;
	let silenceStartedAt: number | null = null;
	let cancelled = false;
	let frameId: number;

	function tick() {
		if (cancelled) return;
		analyser.getFloatTimeDomainData(samples);
		let sumSquares = 0;
		for (const sample of samples) sumSquares += sample * sample;
		const rms = Math.sqrt(sumSquares / samples.length);

		if (rms >= SPEECH_RMS_THRESHOLD) {
			hasSpoken = true;
			silenceStartedAt = null;
		} else if (hasSpoken && rms < SILENCE_RMS_THRESHOLD) {
			if (silenceStartedAt === null) silenceStartedAt = performance.now();
			else if (performance.now() - silenceStartedAt >= silenceTimeoutMs) {
				cleanup();
				onSilence();
				return;
			}
		} else {
			silenceStartedAt = null;
		}
		frameId = requestAnimationFrame(tick);
	}
	frameId = requestAnimationFrame(tick);

	function cleanup() {
		cancelled = true;
		cancelAnimationFrame(frameId);
		source.disconnect();
		void audioCtx.close();
	}

	return {
		cancel() {
			if (cancelled) return;
			cleanup();
		},
	};
}
