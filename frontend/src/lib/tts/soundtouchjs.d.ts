// soundtouchjs ships no types — minimal ambient declaration covering only
// the PitchShifter API this app actually uses (see lib/tts/playback.ts).
declare module 'soundtouchjs' {
	export class PitchShifter {
		constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);
		tempo: number;
		pitch: number;
		pitchSemitones: number;
		rate: number;
		readonly node: AudioNode;
		connect(toNode: AudioNode): void;
		disconnect(): void;
	}
}
