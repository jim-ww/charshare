import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { WHISPER_MODELS, type WhisperModelSize } from './models';

// A single 'q8' dtype for the whole model breaks Whisper's decoder — the
// exported decoder_model_merged graph has a DequantizeLinear node
// (model.decoder.embed_tokens.weight_transposed) that q8 quantization
// doesn't ship a matching scale for, so ONNX Runtime throws
// "Missing required scale" at session creation. Per-submodule dtypes (as
// used by the official Xenova/whisper-web example) avoid that broken path,
// and applies equally across the whisper-tiny/base/... family.
const DTYPE = {
	encoder_model: 'fp32',
	decoder_model_merged: 'q4',
} as const;

// Keyed by model id, so switching sizes doesn't discard an already-loaded
// pipeline — the user can flip back and forth without re-downloading.
const pipelines = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();

function getPipeline(
	modelSize: WhisperModelSize,
	onProgress?: (event: unknown) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
	const modelId = WHISPER_MODELS[modelSize].id;
	let p = pipelines.get(modelId);
	if (!p) {
		p = pipeline('automatic-speech-recognition', modelId, {
			dtype: DTYPE,
			progress_callback: onProgress,
		});
		pipelines.set(modelId, p);
	}
	return p;
}

type Request =
	| { type: 'preload'; modelSize: WhisperModelSize }
	| { type: 'transcribe'; audio: Float32Array; modelSize: WhisperModelSize };

self.onmessage = async (event: MessageEvent<Request>) => {
	const msg = event.data;
	try {
		if (msg.type === 'preload') {
			await getPipeline(msg.modelSize, (progress) =>
				self.postMessage({ type: 'progress', progress }),
			);
			self.postMessage({ type: 'ready' });
			return;
		}
		const transcriber = await getPipeline(msg.modelSize);
		const output = await transcriber(msg.audio);
		const text = Array.isArray(output) ? output[0]?.text : output.text;
		self.postMessage({ type: 'result', text: (text ?? '').trim() });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : String(err),
		});
	}
};
