import type { CharacterDraft } from "$lib/types/character";

/** Shape of the request body a chat site's custom AI/API proxy setting sends
 *  to our local server (see proxyimport.go) when the user chats with a
 *  character. The system message packs the whole character definition as
 *  XML-ish tags; the first assistant message is the character's greeting
 *  (first_message). Currently only matches the tag layout used by
 *  JanitorAI's proxy requests. */
export interface ProxyChatRequest {
	messages: { role: string; content: string }[];
}

function extractTag(text: string, tag: string): string {
	const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
	return match ? match[1].trim() : "";
}

/** The persona tag is named after the character, e.g. `<Aria's
 *  Persona>...</Aria's Persona>`, so it can't be matched by a fixed tag name
 *  up front. */
function extractPersona(text: string): { name: string; personality: string } {
	const match = text.match(/<(.+?)'s Persona>([\s\S]*?)<\/\1's Persona>/i);
	if (!match) return { name: "", personality: "" };
	return { name: match[1].trim(), personality: match[2].trim() };
}

function splitExampleDialogues(block: string): string[] {
	if (!block) return [];
	return block
		.split(/\n{2,}/)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** There's no dedicated "user name" field — it's substituted directly into
 *  the prose (persona/scenario) and prefixes the user's chat lines, e.g.
 *  `"Bob: hi"`. That prefix on the most recent user message is the most
 *  reliable place to recover it from. */
function findUserName(
	messages: { role: string; content: string }[],
): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role !== "user") continue;
		const match = messages[i].content.match(/^([A-Za-z][\w' -]{0,30}):\s/);
		if (match) return match[1].trim();
	}
	return null;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces every whole-word occurrence of the detected user name with the
 *  `{{user}}` placeholder Charshare characters use instead. */
function substituteUserPlaceholder(
	text: string,
	userName: string | null,
): string {
	if (!userName) return text;
	return text.replace(
		new RegExp(`\\b${escapeRegExp(userName)}\\b`, "g"),
		"{{user}}",
	);
}

/** Parses the raw JSON body forwarded from the local import server. Returns
 *  `null` if it doesn't look like a recognized chat-completion request, so
 *  callers can show a "wasn't recognized" message instead of a raw error. */
export function parseProxyChatRequestBody(
	raw: string,
): ProxyChatRequest | null {
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.messages)) return null;
		return parsed as ProxyChatRequest;
	} catch {
		return null;
	}
}

export function mapProxyChatRequestToDraft(
	body: ProxyChatRequest,
): CharacterDraft {
	const systemMessage = body.messages.find((m) => m.role === "system");
	const firstMessage = body.messages.find((m) => m.role === "assistant");

	const systemContent = systemMessage?.content ?? "";
	const { name, personality } = extractPersona(systemContent);
	const userName = findUserName(body.messages);
	const substitute = (text: string) =>
		substituteUserPlaceholder(text, userName);

	return {
		name,
		media: [],
		description: "",
		personality: substitute(personality),
		scenario: substitute(extractTag(systemContent, "Scenario")),
		tags: [],
		nsfw: false,
		language: "",
		system_prompt: "",
		first_message: substitute(firstMessage?.content.trim() ?? ""),
		alternate_greetings: [],
		example_dialogues: splitExampleDialogues(
			extractTag(systemContent, "example_dialogs"),
		).map(substitute),
		comments_enabled: true,
		slideshow_enabled: false,
	};
}
