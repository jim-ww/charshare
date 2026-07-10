import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/whisper-tiny';

// A single 'q8' dtype for the whole model breaks Whisper's decoder — the
// exported decoder_model_merged graph has a DequantizeLinear node
// (model.decoder.embed_tokens.weight_transposed) that q8 quantization
// doesn't ship a matching scale for, so ONNX Runtime throws
// "Missing required scale" at session creation. Per-submodule dtypes (as
// used by the official Xenova/whisper-web example) avoid that broken path.
const DTYPE = {
	encoder_model: 'fp32',
	decoder_model_merged: 'q4',
} as const;

// A plain singleton, cached for this worker's lifetime (the reference
// xenova/whisper-web pattern).
let pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getPipeline(
	onProgress?: (event: unknown) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
	if (!pipelinePromise) {
		pipelinePromise = pipeline('automatic-speech-recognition', MODEL_ID, {
			dtype: DTYPE,
			progress_callback: onProgress,
		});
	}
	return pipelinePromise;
}

type Request =
	| { type: 'preload' }
	| { type: 'transcribe'; audio: Float32Array };

self.onmessage = async (event: MessageEvent<Request>) => {
	const msg = event.data;
	try {
		if (msg.type === 'preload') {
			await getPipeline((progress) => self.postMessage({ type: 'progress', progress }));
			self.postMessage({ type: 'ready' });
			return;
		}
		const transcriber = await getPipeline();
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
