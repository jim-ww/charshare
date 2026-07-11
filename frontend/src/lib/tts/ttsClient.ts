import { browser } from '$app/environment';
import { TTS_MODELS, TTS_VOICES, type TtsModelId, type TtsVoiceId } from './models';

export { TTS_MODELS, TTS_VOICES, type TtsModelId, type TtsVoiceId };

// Same Cache Storage bucket transformers.js uses for every model it manages
// (see asr/whisperClient.ts) — read directly here to report/delete cached
// TTS models without round-tripping through the worker.
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
	| { type: 'audio'; buffer: ArrayBuffer }
	| { type: 'error'; error: string };

let worker: Worker | null = null;

function getWorker(): Worker {
	if (!browser) {
		throw new Error('ttsClient is only available in the browser');
	}
	if (!worker) {
		worker = new Worker(new URL('./ttsWorker.ts', import.meta.url), {
			type: 'module',
		});
	}
	return worker;
}

/** Downloads (or loads from cache) the TTS model, reporting overall progress
 *  0-100 across every file the model is split into. Resolves once the model
 *  is ready to synthesize speech. */
export function preloadModel(
	modelId: TtsModelId,
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
		w.postMessage({ type: 'preload', modelId });
	});
}

/** Synthesizes speech from text locally via a TTS model running in a Web
 *  Worker, returning a playable WAV Blob. Call `preloadModel` first so the
 *  model is already cached and this resolves quickly instead of triggering a
 *  fresh download. */
export function synthesize(
	text: string,
	modelId: TtsModelId,
	voiceId: TtsVoiceId,
): Promise<Blob> {
	const w = getWorker();
	return new Promise((resolve, reject) => {
		const handleMessage = (event: MessageEvent<WorkerMessage>) => {
			if (event.data.type === 'audio') {
				w.removeEventListener('message', handleMessage);
				resolve(new Blob([event.data.buffer], { type: 'audio/wav' }));
			} else if (event.data.type === 'error') {
				w.removeEventListener('message', handleMessage);
				reject(new Error(event.data.error));
			}
		};
		w.addEventListener('message', handleMessage);
		w.postMessage({ type: 'synthesize', text, modelId, voiceId });
	});
}

/** Whether a TTS model's files are already in the browser's model cache
 *  (Cache Storage), i.e. usable offline without a fresh download. */
export async function isModelCached(modelId: TtsModelId): Promise<boolean> {
	if (!browser || !('caches' in globalThis)) return false;
	const cache = await caches.open(CACHE_NAME);
	const keys = await cache.keys();
	const id = TTS_MODELS[modelId].id;
	return keys.some((request) => request.url.includes(id));
}

/** Removes a TTS model's files from the browser's model cache, freeing the
 *  disk space it used. Also tears down the worker so a copy of the model
 *  already loaded in its memory can't keep serving synthesis requests after
 *  its cache is gone — the next use starts a fresh worker/download. */
export async function deleteModel(modelId: TtsModelId): Promise<void> {
	if (!browser || !('caches' in globalThis)) return;
	const cache = await caches.open(CACHE_NAME);
	const id = TTS_MODELS[modelId].id;
	const keys = await cache.keys();
	await Promise.all(
		keys.filter((request) => request.url.includes(id)).map((request) => cache.delete(request)),
	);
	if (worker) {
		worker.terminate();
		worker = null;
	}
}
