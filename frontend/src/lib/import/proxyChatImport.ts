import type { CharacterDraft } from "$lib/types/character";
import type { MessageRole } from "$lib/types/chat";

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
 *  up front. Matched in two plain-string steps rather than one regex with a
 *  `\1` backreference: backreferences force V8's regex engine into
 *  backtracking mode instead of its linear automaton, and this system
 *  message keeps growing every turn of a JanitorAI chat (it resends the
 *  whole conversation so far) — on a long enough chat that backtracking
 *  regex blew the call stack (`RangeError: Maximum call stack size
 *  exceeded`) trying to import it. */
function extractPersona(text: string): { name: string; personality: string } {
	const openMatch = text.match(/<(.+?)'s Persona>/i);
	if (!openMatch) return { name: "", personality: "" };
	const name = openMatch[1].trim();
	const contentStart = (openMatch.index ?? 0) + openMatch[0].length;
	const closeTag = `</${name}'s Persona>`;
	const closeIndex = text.indexOf(closeTag, contentStart);
	const personality =
		closeIndex === -1
			? text.slice(contentStart)
			: text.slice(contentStart, closeIndex);
	return { name, personality: personality.trim() };
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

/** Strips the `"Name: "` prefix the proxy prepends to the user's own chat
 *  lines (see findUserName) — Charshare messages don't carry a name prefix,
 *  so it'd otherwise show up literally as `"{{user}}: hi"`. */
function stripUserPrefix(text: string, userName: string | null): string {
	if (!userName) return text;
	return text.replace(new RegExp(`^${escapeRegExp(userName)}:\\s*`), "");
}

/** Recovers the actual back-and-forth conversation (everything but the
 *  system message) so it can be imported as chat history alongside the
 *  character itself, instead of only the greeting mapProxyChatRequestToDraft
 *  keeps. Order and role are preserved as sent. */
export function mapProxyChatRequestToHistory(
	body: ProxyChatRequest,
): { role: MessageRole; content: string }[] {
	const userName = findUserName(body.messages);
	return body.messages
		// Case-sensitive `=== "user"`/`=== "assistant"` used to silently drop
		// any turn tagged with a different casing or label (e.g. "Assistant",
		// "AI") — those aren't part of the OpenAI chat-completions spec, but
		// sites don't always stick to it consistently across every turn, and
		// the effect was a long real conversation collapsing down to just
		// whichever turns happened to match exactly. Only genuine system
		// messages (the character definition) are excluded now; everything
		// else is history.
		.filter((m) => m.role.toLowerCase() !== "system")
		.map((m) => {
			const isUser = m.role.toLowerCase() === "user";
			return {
				role: (isUser ? "user" : "character") as MessageRole,
				content: substituteUserPlaceholder(
					isUser ? stripUserPrefix(m.content.trim(), userName) : m.content.trim(),
					userName,
				),
			};
		});
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
