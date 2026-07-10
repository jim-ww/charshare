const WHISPER_SAMPLE_RATE = 16000;

// RMS thresholds are on a 0-1 scale (normalized time-domain samples).
// SPEECH must be crossed at least once before silence is allowed to
// auto-stop, so a quiet room at the start of recording doesn't trigger it.
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_RMS_THRESHOLD = 0.012;
const SILENCE_DURATION_MS = 1500;

export interface MicRecording {
	stop(): Promise<Float32Array>;
}

/** Starts recording from the microphone. Returns a handle whose `stop()`
 *  ends the recording and resolves to mono 16kHz PCM, the format Whisper
 *  expects. Recording via MediaRecorder (rather than reading the live
 *  AudioContext stream) sidesteps browsers that reject an explicit
 *  sampleRate on a live mic AudioContext — decode-then-resample the
 *  finished Blob instead, which works the same everywhere.
 *
 *  If `onSilence` is given, it's called once after the user has spoken and
 *  then gone quiet for `SILENCE_DURATION_MS` — the caller decides what to
 *  do (typically call `stop()`), this module never stops recording on its
 *  own. */
export async function startMicRecording(onSilence?: () => void): Promise<MicRecording> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};

	const stopped = new Promise<void>((resolve) => {
		recorder.onstop = () => resolve();
	});
	recorder.start();

	const silenceWatcher = onSilence
		? watchForSilence(stream, onSilence)
		: null;

	return {
		async stop() {
			silenceWatcher?.cancel();
			recorder.stop();
			await stopped;
			for (const track of stream.getTracks()) track.stop();
			const blob = new Blob(chunks, { type: recorder.mimeType });
			return decodeToWhisperPcm(blob);
		},
	};
}

function watchForSilence(stream: MediaStream, onSilence: () => void) {
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
			else if (performance.now() - silenceStartedAt >= SILENCE_DURATION_MS) {
				cancelled = true;
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
		cancelAnimationFrame(frameId);
		source.disconnect();
		void audioCtx.close();
	}

	return {
		cancel() {
			if (cancelled) return;
			cancelled = true;
			cleanup();
		},
	};
}

async function decodeToWhisperPcm(blob: Blob): Promise<Float32Array> {
	const arrayBuffer = await blob.arrayBuffer();
	const audioCtx = new AudioContext();
	const decoded = await audioCtx.decodeAudioData(arrayBuffer);
	await audioCtx.close();

	const offlineCtx = new OfflineAudioContext(
		1,
		Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE),
		WHISPER_SAMPLE_RATE,
	);
	const source = offlineCtx.createBufferSource();
	source.buffer = decoded;
	source.connect(offlineCtx.destination);
	source.start();
	const resampled = await offlineCtx.startRendering();
	return resampled.getChannelData(0);
}
