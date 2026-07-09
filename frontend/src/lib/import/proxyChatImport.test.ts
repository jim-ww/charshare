import { describe, expect, it } from "vitest";
import {
	mapProxyChatRequestToDraft,
	parseProxyChatRequestBody,
	type ProxyChatRequest
} from "./proxyChatImport";

// Shape mirrors what JanitorAI's custom-endpoint proxy sends: a system
// message packing the whole character definition as XML-ish tags, plus a
// first assistant message used as the greeting. Content here is placeholder
// text only, not from any real character.
const sampleRequest: ProxyChatRequest = {
	messages: [
		{
			role: "system",
			content: `
<Aria's Persona>Name=("Aria")
Personality=("curious" + "guarded")
</Aria's Persona>
<Scenario>Two strangers meet at a quiet train station at dusk.</Scenario>
<UserPersona>he/him</UserPersona>
<example_dialogs>
User: Hello there.
Aria: nods "Hello."


User: Nice weather today.
Aria: "It is."
</example_dialogs>
`
		},
		{ role: "assistant", content: "Aria looks up and gives a small nod." },
		{ role: "user", content: "Sam: hi" }
	]
};

// Same shape, but the user's name ("Sam") shows up inline in the prose and
// as a chat-line prefix, the way the proxy request actually substitutes it in.
const requestMentioningUserByName: ProxyChatRequest = {
	messages: [
		{
			role: "system",
			content: `<Aria's Persona>Aria remembers Sam fondly.</Aria's Persona>
<Scenario>Sam and Aria meet again after a long time apart.</Scenario>
<example_dialogs>
Sam: Long time no see.
Aria: "Sam! I missed you."
</example_dialogs>`
		},
		{ role: "assistant", content: "Aria waves at Sam from across the room." },
		{ role: "user", content: "Sam: hey" }
	]
};

describe("mapProxyChatRequestToDraft", () => {
	it("extracts name and personality from the persona tag", () => {
		const draft = mapProxyChatRequestToDraft(sampleRequest);
		expect(draft.name).toBe("Aria");
		expect(draft.personality).toContain('Personality=("curious" + "guarded")');
		expect(draft.personality).not.toContain("<Aria's Persona>");
	});

	it("extracts the scenario tag", () => {
		const draft = mapProxyChatRequestToDraft(sampleRequest);
		expect(draft.scenario).toBe(
			"Two strangers meet at a quiet train station at dusk."
		);
	});

	it("uses the first assistant message as first_message", () => {
		const draft = mapProxyChatRequestToDraft(sampleRequest);
		expect(draft.first_message).toBe("Aria looks up and gives a small nod.");
	});

	it("splits example dialogs into separate entries", () => {
		const draft = mapProxyChatRequestToDraft(sampleRequest);
		expect(draft.example_dialogues).toHaveLength(2);
		expect(draft.example_dialogues[0]).toContain("Hello there");
		expect(draft.example_dialogues[1]).toContain("Nice weather today");
	});

	it("defaults fields the proxy request doesn't expose", () => {
		const draft = mapProxyChatRequestToDraft(sampleRequest);
		expect(draft.tags).toEqual([]);
		expect(draft.nsfw).toBe(false);
		expect(draft.language).toBe("");
		expect(draft.system_prompt).toBe("");
		expect(draft.image_urls).toEqual([]);
	});

	it("returns null for bodies that don't look like a chat completion request", () => {
		expect(parseProxyChatRequestBody("not json")).toBeNull();
		expect(parseProxyChatRequestBody('{"foo":"bar"}')).toBeNull();
	});

	it("parses a well-formed request body", () => {
		const parsed = parseProxyChatRequestBody(JSON.stringify(sampleRequest));
		expect(parsed).toEqual(sampleRequest);
	});

	it("replaces the detected user name with {{user}} everywhere", () => {
		const draft = mapProxyChatRequestToDraft(requestMentioningUserByName);
		expect(draft.personality).toBe("Aria remembers {{user}} fondly.");
		expect(draft.scenario).toBe(
			"{{user}} and Aria meet again after a long time apart."
		);
		expect(draft.first_message).toBe(
			"Aria waves at {{user}} from across the room."
		);
		expect(draft.example_dialogues[0]).toBe(
			'{{user}}: Long time no see.\nAria: "{{user}}! I missed you."'
		);
		expect(draft.personality).not.toContain("Sam");
	});
});
