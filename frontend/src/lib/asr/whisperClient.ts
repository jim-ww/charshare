import { browser } from '$app/environment';
import { WHISPER_MODELS, type WhisperModelSize } from './models';

export { WHISPER_MODELS, type WhisperModelSize };

// The Cache Storage bucket transformers.js stores model files in (its
// `env.cacheKey` default) — read directly here to report/delete cached
// models without round-tripping through the worker.
const CACHE_NAME = 'transformers-cache';

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
export function preloadModel(
	modelSize: WhisperModelSize,
	onProgress: (percent: number) => void,
): Promise<void> {
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
		w.postMessage({ type: 'preload', modelSize });
	});
}

/** Transcribes mono 16kHz PCM audio locally via a Whisper model running in a
 *  Web Worker. Call `preloadModel` first so the model is already cached and
 *  this resolves quickly instead of triggering a fresh download. */
export function transcribe(audio: Float32Array, modelSize: WhisperModelSize): Promise<string> {
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
		w.postMessage({ type: 'transcribe', audio, modelSize }, [audio.buffer]);
	});
}

/** Whether a Whisper model's files are already in the browser's model cache
 *  (Cache Storage), i.e. usable offline without a fresh download. */
export async function isModelCached(modelSize: WhisperModelSize): Promise<boolean> {
	if (!browser || !('caches' in globalThis)) return false;
	const cache = await caches.open(CACHE_NAME);
	const keys = await cache.keys();
	const modelId = WHISPER_MODELS[modelSize].id;
	return keys.some((request) => request.url.includes(modelId));
}

/** Removes a Whisper model's files from the browser's model cache, freeing
 *  the disk space it used. Also tears down the worker so a copy of the
 *  model already loaded in its memory can't keep serving transcriptions
 *  after its cache is gone — the next use starts a fresh worker/download. */
export async function deleteModel(modelSize: WhisperModelSize): Promise<void> {
	if (!browser || !('caches' in globalThis)) return;
	const cache = await caches.open(CACHE_NAME);
	const modelId = WHISPER_MODELS[modelSize].id;
	const keys = await cache.keys();
	await Promise.all(
		keys.filter((request) => request.url.includes(modelId)).map((request) => cache.delete(request)),
	);
	if (worker) {
		worker.terminate();
		worker = null;
	}
}
