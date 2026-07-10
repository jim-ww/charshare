export const WHISPER_MODELS = {
	tiny: { id: "Xenova/whisper-tiny", approxSizeMB: 90 },
	base: { id: "Xenova/whisper-base", approxSizeMB: 180 },
} as const;

export type WhisperModelSize = keyof typeof WHISPER_MODELS;
