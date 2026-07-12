/** Talks to a VOICEVOX Engine (https://voicevox.hiroshiba.jp/) instance the
 *  user runs themselves — same shape as our Ollama chat provider: a plain
 *  HTTP client against a local server, nothing bundled, downloaded, or
 *  cached by us. No Web Worker needed either, unlike the local models —
 *  this is just a couple of fetch() calls, not on-device inference. */

export interface VoicevoxSpeakerStyle {
	id: number;
	name: string;
}

export interface VoicevoxSpeaker {
	name: string;
	styles: VoicevoxSpeakerStyle[];
}

/** Lists every character/style combination the engine has loaded, so chat
 *  settings can offer a real picker instead of asking the user to know
 *  numeric speaker ids. Throws if the engine isn't reachable — callers
 *  should surface that as "couldn't reach VOICEVOX at <url>", not a silent
 *  empty list. */
export async function fetchSpeakers(baseUrl: string): Promise<VoicevoxSpeaker[]> {
	const res = await fetch(`${baseUrl.replace(/\/$/, '')}/speakers`);
	if (!res.ok) throw new Error(`VOICEVOX returned ${res.status}`);
	const data = (await res.json()) as {
		name: string;
		styles: { id: number; name: string }[];
	}[];
	return data.map((speaker) => ({
		name: speaker.name,
		styles: speaker.styles.map((style) => ({ id: style.id, name: style.name })),
	}));
}

/** Synthesizes speech via VOICEVOX's two-step HTTP API: build an audio
 *  query from the text, then render it to WAV with that query. `speakerId`
 *  is a style id from fetchSpeakers, not a top-level speaker id — VOICEVOX
 *  addresses styles (e.g. "Zundamon — Normal"), not just characters. */
export async function synthesize(
	baseUrl: string,
	text: string,
	speakerId: number,
): Promise<Blob> {
	const base = baseUrl.replace(/\/$/, '');
	const queryRes = await fetch(
		`${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
		{ method: 'POST' },
	);
	if (!queryRes.ok) throw new Error(`VOICEVOX audio_query failed: ${queryRes.status}`);
	const query = await queryRes.json();

	const synthRes = await fetch(`${base}/synthesis?speaker=${speakerId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(query),
	});
	if (!synthRes.ok) throw new Error(`VOICEVOX synthesis failed: ${synthRes.status}`);
	return synthRes.blob();
}
