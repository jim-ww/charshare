import { pipeline, type TextToAudioPipeline } from '@huggingface/transformers';
import { TTS_MODELS, TTS_VOICES, type TtsModelId, type TtsVoiceId } from './models';

// Keyed by model id, so switching models doesn't discard an already-loaded
// pipeline (mirrors asr/whisperWorker.ts).
const pipelines = new Map<string, Promise<TextToAudioPipeline>>();

function getPipeline(
	modelId: TtsModelId,
	onProgress?: (event: unknown) => void,
): Promise<TextToAudioPipeline> {
	const { id } = TTS_MODELS[modelId];
	let p = pipelines.get(id);
	if (!p) {
		p = pipeline('text-to-speech', id, {
			dtype: 'fp32',
			progress_callback: onProgress,
		});
		pipelines.set(id, p);
	}
	return p;
}

type Request =
	| { type: 'preload'; modelId: TtsModelId }
	| { type: 'synthesize'; text: string; modelId: TtsModelId; voiceId: TtsVoiceId };

self.onmessage = async (event: MessageEvent<Request>) => {
	const msg = event.data;
	try {
		if (msg.type === 'preload') {
			await getPipeline(msg.modelId, (progress) =>
				self.postMessage({ type: 'progress', progress }),
			);
			self.postMessage({ type: 'ready' });
			return;
		}
		const synthesizer = await getPipeline(msg.modelId);
		const output = await synthesizer(msg.text, {
			speaker_embeddings: TTS_VOICES[msg.voiceId].embeddingsUrl,
		});
		const buffer = await output.toBlob().arrayBuffer();
		self.postMessage({ type: 'audio', buffer });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : String(err),
		});
	}
};
