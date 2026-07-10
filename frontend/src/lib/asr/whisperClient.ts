import { browser } from '$app/environment';

interface ProgressEvent {
	status: string;
	file?: string;
	loaded?: number;
	total?: number;
}

type WorkerMessage =
	| { type: 'progress'; progress: ProgressEvent }
	| { type: 'ready' }
	| { type: 'result'; text: string }
	| { type: 'error'; error: string };

let worker: Worker | null = null;

function getWorker(): Worker {
	if (!browser) {
		throw new Error('whisperClient is only available in the browser');
	}
	if (!worker) {
		worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
			type: 'module',
		});
	}
	return worker;
}

/** Downloads (or loads from cache) the Whisper model, reporting overall
 *  progress 0-100 across every file the model is split into. Resolves once
 *  the model is ready to transcribe. */
export function preloadModel(onProgress: (percent: number) => void): Promise<void> {
	const w = getWorker();
	const fileTotals = new Map<string, { loaded: number; total: number }>();

	function reportOverall() {
		let loaded = 0;
		let total = 0;
		for (const entry of fileTotals.values()) {
			loaded += entry.loaded;
			total += entry.total;
		}
		onProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
	}

	return new Promise((resolve, reject) => {
		const handleMessage = (event: MessageEvent<WorkerMessage>) => {
			const msg = event.data;
			if (msg.type === 'progress') {
				const { file, loaded, total } = msg.progress;
				if (file && typeof loaded === 'number' && typeof total === 'number') {
					fileTotals.set(file, { loaded, total });
					reportOverall();
				}
			} else if (msg.type === 'ready') {
				w.removeEventListener('message', handleMessage);
				onProgress(100);
				resolve();
			} else if (msg.type === 'error') {
				w.removeEventListener('message', handleMessage);
				reject(new Error(msg.error));
			}
		};
		w.addEventListener('message', handleMessage);
		w.postMessage({ type: 'preload' });
	});
}

/** Transcribes mono 16kHz PCM audio locally via a Whisper model running in a
 *  Web Worker. Call `preloadModel` first so the model is already cached and
 *  this resolves quickly instead of triggering a fresh download. */
export function transcribe(audio: Float32Array): Promise<string> {
	const w = getWorker();
	return new Promise((resolve, reject) => {
		const handleMessage = (event: MessageEvent<WorkerMessage>) => {
			if (event.data.type === 'result') {
				w.removeEventListener('message', handleMessage);
				resolve(event.data.text);
			} else if (event.data.type === 'error') {
				w.removeEventListener('message', handleMessage);
				reject(new Error(event.data.error));
			}
		};
		w.addEventListener('message', handleMessage);
		w.postMessage({ type: 'transcribe', audio }, [audio.buffer]);
	});
}
