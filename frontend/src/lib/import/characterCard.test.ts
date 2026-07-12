import { describe, it, expect } from 'vitest';
import type { Character } from '$lib/types';
import {
	parseTavernCardJson,
	parseTavernCardPng,
	characterToTavernCardV2Json,
	embedTavernCardInPng
} from './characterCard';

const MINIMAL_PNG = Uint8Array.from([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12,
	2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69,
	78, 68, 174, 66, 96, 130
]);

function makeCharacter(overrides: Partial<Character> = {}): Character {
	return {
		id: 'author-1:char-1',
		version: 1,
		name: 'Aria',
		image_urls: [],
		description: 'A test character',
		personality: 'Bubbly',
		scenario: 'A cafe',
		tags: ['test', 'cheerful'],
		nsfw: false,
		language: 'en',
		system_prompt: 'Stay in character.',
		first_message: 'Hi there!',
		alternate_greetings: ['Hey!', 'Yo!'],
		example_dialogues: ['{{user}}: Hi\n{{char}}: Hello!', '{{user}}: Bye\n{{char}}: See ya!'],
		comments_enabled: true,
		forked_from: null,
		author: 'author-1',
		signature: 'sig',
		created_at: 0,
		updated_at: 0,
		deleted: false,
		deleted_at: null,
		...overrides
	};
}

describe('parseTavernCardJson', () => {
	it('parses a flat V1-shape card', () => {
		const json = JSON.stringify({
			name: 'Nova',
			description: 'desc',
			personality: 'kind',
			scenario: 'space',
			first_mes: 'Hello!',
			mes_example: '<START>\n{{user}}: hi\n{{char}}: hey\n<START>\n{{user}}: bye\n{{char}}: bye'
		});

		const draft = parseTavernCardJson(json);

		expect(draft.name).toBe('Nova');
		expect(draft.description).toBe('desc');
		expect(draft.personality).toBe('kind');
		expect(draft.scenario).toBe('space');
		expect(draft.first_message).toBe('Hello!');
		expect(draft.example_dialogues).toEqual(['{{user}}: hi\n{{char}}: hey', '{{user}}: bye\n{{char}}: bye']);
		expect(draft.tags).toEqual([]);
		expect(draft.system_prompt).toBe('');
		expect(draft.alternate_greetings).toEqual([]);
	});

	it('parses a wrapped V2 chara_card_v2 card', () => {
		const json = JSON.stringify({
			spec: 'chara_card_v2',
			spec_version: '2.0',
			data: {
				name: 'Nova V2',
				description: 'desc',
				personality: 'kind',
				scenario: 'space',
				first_mes: 'Hello!',
				mes_example: '',
				system_prompt: 'be nova',
				alternate_greetings: ['Hiya'],
				tags: ['scifi']
			}
		});

		const draft = parseTavernCardJson(json);

		expect(draft.name).toBe('Nova V2');
		expect(draft.system_prompt).toBe('be nova');
		expect(draft.alternate_greetings).toEqual(['Hiya']);
		expect(draft.tags).toEqual(['scifi']);
	});

	it('throws on invalid JSON', () => {
		expect(() => parseTavernCardJson('not json')).toThrow();
	});

	it('throws when there is no name', () => {
		expect(() => parseTavernCardJson(JSON.stringify({ description: 'no name here' }))).toThrow();
	});
});

describe('characterToTavernCardV2Json / embedTavernCardInPng / parseTavernCardPng', () => {
	it('round-trips a character through export-to-PNG and back', () => {
		const character = makeCharacter();

		const withCard = embedTavernCardInPng(MINIMAL_PNG, character);
		const draft = parseTavernCardPng(withCard);

		expect(draft.name).toBe(character.name);
		expect(draft.description).toBe(character.description);
		expect(draft.personality).toBe(character.personality);
		expect(draft.scenario).toBe(character.scenario);
		expect(draft.first_message).toBe(character.first_message);
		expect(draft.system_prompt).toBe(character.system_prompt);
		expect(draft.alternate_greetings).toEqual(character.alternate_greetings);
		expect(draft.tags).toEqual(character.tags);
		expect(draft.example_dialogues).toEqual(character.example_dialogues);
	});

	it('produces valid chara_card_v2 JSON', () => {
		const character = makeCharacter();
		const json = JSON.parse(characterToTavernCardV2Json(character));
		expect(json.spec).toBe('chara_card_v2');
		expect(json.data.name).toBe(character.name);
	});

	it('parseTavernCardPng throws on a PNG with no embedded card', () => {
		expect(() => parseTavernCardPng(MINIMAL_PNG)).toThrow();
	});
});
