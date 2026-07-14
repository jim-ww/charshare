import { PREDEFINED_TAGS } from '$lib/data/tags';
import { getPreferences } from '$lib/state/preferences.svelte';
import { completeWithContinuation, ensurePreferencesReady } from './chat';

/** Every character field the "Generate" button can fill in — deliberately
 *  excludes identity/technical fields (id, version, timestamps, author,
 *  forked_from), display-only fields (media, language), and
 *  system_prompt (already has its own default-prompt reference shown in the
 *  form). */
export type GeneratableField =
	| 'tags'
	| 'description'
	| 'personality'
	| 'scenario'
	| 'first_message'
	| 'alternate_greetings'
	| 'example_dialogues';

/** Whatever's already filled in on the other fields — given to the model as
 *  context so a generated field stays consistent with the rest of the card,
 *  the same way a human writer would reread the sheet before adding to it. */
export interface CharacterFieldContext {
	name: string;
	tags: string[];
	description: string;
	personality: string;
	scenario: string;
	first_message: string;
	alternate_greetings: string[];
	example_dialogues: string[];
}

interface FieldGuideline {
	label: string;
	about: string;
	format: string;
}

// Each field's "about" mirrors the form's own placeholder copy (what the
// field means to a human filling it in); "format" is the AI-facing
// convention that isn't otherwise written down anywhere for a model to see
// (e.g. tags/example_dialogues have a strict machine-readable shape that a
// human never has to think about, but an LLM does).
const FIELD_GUIDELINES: Record<GeneratableField, FieldGuideline> = {
	tags: {
		label: 'Tags',
		about: 'Short genre/kink/setting/archetype labels used to categorize and search for this character.',
		format:
			'Only pick tags from the predefined list given below — never invent a new one, even if nothing fits perfectly. ' +
			'Pick between 3 and 10 tags — accurate to this specific character, not padded with generic or irrelevant ones just to hit a count. ' +
			'Return them comma-separated, exactly as spelled in the list, nothing else.'
	},
	description: {
		label: 'Description',
		about: 'Who this character is — appearance, background, and notable traits.',
		format: 'Plain prose, third person, a short paragraph (roughly 2-5 sentences). No headers, no bullet lists.'
	},
	personality: {
		label: 'Personality',
		about:
			'How they act, speak, and think. Also include physical appearance here, even though that overlaps ' +
			"with the description field — description is never actually sent to the model during chat, so " +
			'appearance details need to live here to actually reach the model in a conversation.',
		format: 'Plain prose, third person, a short paragraph. No headers, no bullet lists.'
	},
	scenario: {
		label: 'Scenario',
		about: 'The setting or situation the chat starts in.',
		format: 'Plain prose, 1-3 sentences, addressed to {{user}} in second person ("you").'
	},
	first_message: {
		label: 'First message',
		about: "The opening message {{char}} sends to start the conversation, in {{char}}'s own voice.",
		format:
			'Written as {{char}} speaking directly, first person. Actions/narration may be wrapped in *asterisks*. ' +
			'No surrounding quotation marks. Return only the message itself.'
	},
	alternate_greetings: {
		label: 'Alternate greeting',
		about:
			"A different possible opening message for {{char}} — an alternative tone or starting point to the " +
			'existing first message/other alternate greetings, not a near-duplicate of them.',
		format:
			'Same format as the first message: first person, *asterisks* for actions, no surrounding quotes. ' +
			'Return only the message itself.'
	},
	example_dialogues: {
		label: 'Example dialogue',
		about:
			"A short sample exchange demonstrating how {{char}} talks and reacts — a style reference for the " +
			'model, never shown to the end user directly.',
		format:
			'Must use exactly this line format, nothing else:\n' +
			'{{user}}: <a short in-character user line>\n' +
			'{{char}}: <{{char}}\'s in-character reply>\n' +
			'Optionally add more turns the same way. Return only those lines.'
	}
};

function contextBlock(ctx: CharacterFieldContext, exclude: GeneratableField): string {
	const lines: string[] = [];
	if (ctx.name) lines.push(`Name: ${ctx.name}`);
	if (exclude !== 'tags' && ctx.tags.length) lines.push(`Tags: ${ctx.tags.join(', ')}`);
	if (exclude !== 'description' && ctx.description) lines.push(`Description: ${ctx.description}`);
	if (exclude !== 'personality' && ctx.personality) lines.push(`Personality: ${ctx.personality}`);
	if (exclude !== 'scenario' && ctx.scenario) lines.push(`Scenario: ${ctx.scenario}`);
	if (exclude !== 'first_message' && ctx.first_message) lines.push(`First message: ${ctx.first_message}`);
	if (exclude !== 'alternate_greetings' && ctx.alternate_greetings.length) {
		lines.push(`Alternate greetings:\n${ctx.alternate_greetings.map((g) => `- ${g}`).join('\n')}`);
	}
	if (exclude !== 'example_dialogues' && ctx.example_dialogues.length) {
		lines.push(`Example dialogues:\n${ctx.example_dialogues.join('\n---\n')}`);
	}
	return lines.join('\n');
}

/** How the result of generating `field` actually gets applied by the caller
 *  (see GenerateFieldButton's onresult handlers in CharacterForm) — the model
 *  needs to know this to make sense of "what's already there": tags get
 *  merged into the existing set, list fields get one new entry appended
 *  alongside the existing ones, and scalar fields get wholesale replaced. */
function currentValueLine(field: GeneratableField, ctx: CharacterFieldContext): string | null {
	switch (field) {
		case 'tags':
			return ctx.tags.length
				? `Tags already chosen (these will stay; only ADD tags not already in this list, don't repeat them): ${ctx.tags.join(', ')}`
				: null;
		case 'alternate_greetings':
			return ctx.alternate_greetings.length
				? `Alternate greetings that already exist (write a NEW one distinct from all of these, don't repeat them):\n${ctx.alternate_greetings.map((g) => `- ${g}`).join('\n')}`
				: null;
		case 'example_dialogues':
			return ctx.example_dialogues.length
				? `Example dialogues that already exist (write a NEW one distinct from all of these, don't repeat them):\n${ctx.example_dialogues.join('\n---\n')}`
				: null;
		default: {
			const current = ctx[field];
			return current
				? `This field's current content (you're regenerating it — revise/extend it or replace it as the instructions call for, but stay consistent with anything it establishes unless told otherwise): ${current}`
				: null;
		}
	}
}

/** Generates fresh content for one character field via the user's configured
 *  AI provider, using every other already-filled-in field as context (see
 *  contextBlock), the field's own current value if any (see
 *  currentValueLine — a field being generated is never invisible to its own
 *  generation call), plus an optional free-text steer from the user. Returns
 *  the raw trimmed model output — callers decide how to apply it (replace a
 *  scalar field, append to a list field, or merge into the tag set). */
export async function generateCharacterField(
	field: GeneratableField,
	ctx: CharacterFieldContext,
	extraInstructions = ''
): Promise<string> {
	const guideline = FIELD_GUIDELINES[field];
	const parts = [
		`You are helping write a character card for an AI roleplay app. Generate the "${guideline.label}" field.`,
		`What this field is: ${guideline.about}`,
		`Format requirements: ${guideline.format}`
	];
	if (field === 'tags') {
		parts.push(`The only tags you may pick from: ${PREDEFINED_TAGS.map((t) => t.name).join(', ')}`);
	}
	const known = contextBlock(ctx, field);
	if (known) parts.push(`Everything already known about this character (for context/consistency):\n${known}`);
	const currentValue = currentValueLine(field, ctx);
	if (currentValue) parts.push(currentValue);
	if (extraInstructions.trim()) parts.push(`Additional instructions from the user: ${extraInstructions.trim()}`);
	parts.push('Return ONLY the generated field content — no preamble, no explanation, no surrounding quotes or labels.');

	await ensurePreferencesReady();
	const result = await completeWithContinuation(getPreferences().provider, [
		{ role: 'system', content: parts.join('\n\n') },
		{ role: 'user', content: `Write the ${guideline.label}.` }
	]);
	return result.trim();
}

/** Splits a comma/newline-separated model response into normalized tag
 *  names, matching the same lowercase-hyphenated convention enforced
 *  elsewhere (see TagCarousel's addCustomTag) — then drops anything that
 *  isn't actually on the predefined list, since the prompt asks the model
 *  not to invent tags but can't guarantee it'll comply. */
const PREDEFINED_TAG_NAMES = new Set(PREDEFINED_TAGS.map((t) => t.name));

export function parseGeneratedTags(raw: string): string[] {
	return raw
		.split(/[,\n]/)
		.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
		.filter(Boolean)
		.filter((t) => PREDEFINED_TAG_NAMES.has(t));
}
