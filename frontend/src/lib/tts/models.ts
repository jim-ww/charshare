/** Local text-to-speech models available for the "local" TTS provider — same
 *  shape/pattern as asr/models.ts's WHISPER_MODELS. Supertonic is
 *  transformers.js's own default text-to-audio model: a single ONNX graph
 *  (no separate vocoder step like SpeechT5), driven by a small speaker
 *  embedding file per voice. */
export const TTS_MODELS = {
	// Only fp32 weights are published for this model (no quantized variant),
	// so ~250MB is the real one-time download size — confirmed via the HF
	// API's file listing for the onnx/ directory, not a guess. The voice
	// files below are tiny (~50KB each) on top of that shared download.
	default: {
		id: "onnx-community/Supertonic-TTS-ONNX",
		approxSizeMB: 250,
	},
} as const;

export type TtsModelId = keyof typeof TTS_MODELS;

const VOICES_BASE_URL = "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices";

// All 10 presets shipped in the model repo — confirmed via its file listing,
// not guessed. Labelled by grammatical gender of the voice, not by any
// character trait; pick whichever sounds right for a given character.
export const TTS_VOICES = {
	f1: { label: "Female 1", embeddingsUrl: `${VOICES_BASE_URL}/F1.bin` },
	f2: { label: "Female 2", embeddingsUrl: `${VOICES_BASE_URL}/F2.bin` },
	f3: { label: "Female 3", embeddingsUrl: `${VOICES_BASE_URL}/F3.bin` },
	f4: { label: "Female 4", embeddingsUrl: `${VOICES_BASE_URL}/F4.bin` },
	f5: { label: "Female 5", embeddingsUrl: `${VOICES_BASE_URL}/F5.bin` },
	m1: { label: "Male 1", embeddingsUrl: `${VOICES_BASE_URL}/M1.bin` },
	m2: { label: "Male 2", embeddingsUrl: `${VOICES_BASE_URL}/M2.bin` },
	m3: { label: "Male 3", embeddingsUrl: `${VOICES_BASE_URL}/M3.bin` },
	m4: { label: "Male 4", embeddingsUrl: `${VOICES_BASE_URL}/M4.bin` },
	m5: { label: "Male 5", embeddingsUrl: `${VOICES_BASE_URL}/M5.bin` },
} as const;

export type TtsVoiceId = keyof typeof TTS_VOICES;
