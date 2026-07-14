import { describe, it, expect, vi } from 'vitest';

const { completeWithContinuation } = vi.hoisted(() => ({ completeWithContinuation: vi.fn() }));
vi.mock('./chat', () => ({
	completeWithContinuation,
	ensurePreferencesReady: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/state/preferences.svelte', () => ({
	getPreferences: () => ({ provider: { provider: 'ollama', model: 'test' } })
}));

import { generateCharacterField, parseGeneratedTags, type CharacterFieldContext } from './characterFieldGenerate';

const blankContext: CharacterFieldContext = {
	name: '',
	tags: [],
	description: '',
	personality: '',
	scenario: '',
	first_message: '',
	alternate_greetings: [],
	example_dialogues: []
};

describe('parseGeneratedTags', () => {
	it('normalizes case and spacing for tags that exist in the predefined list', () => {
		expect(parseGeneratedTags('Monster Girl, tsundere\nSlice of Life')).toEqual([
			'monster-girl',
			'tsundere',
			'slice-of-life'
		]);
	});

	it('drops empty entries from trailing separators', () => {
		expect(parseGeneratedTags('fantasy, , romantic,')).toEqual(['fantasy', 'romantic']);
	});

	it('drops anything the model invents that is not on the predefined list', () => {
		expect(parseGeneratedTags('fantasy, totally-made-up-tag, tsundere')).toEqual(['fantasy', 'tsundere']);
	});
});

describe('generateCharacterField', () => {
	it('sends a system+user message pair and returns the trimmed result', async () => {
		completeWithContinuation.mockResolvedValueOnce('  A curious wanderer.  ');
		const result = await generateCharacterField('description', blankContext);
		expect(result).toBe('A curious wanderer.');
		expect(completeWithContinuation).toHaveBeenCalledTimes(1);
		const [config, messages] = completeWithContinuation.mock.calls[0];
		expect(config.provider).toBe('ollama');
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe('system');
		expect(messages[1].role).toBe('user');
	});

	it('includes the predefined tag list only when generating tags', async () => {
		completeWithContinuation.mockResolvedValueOnce('tsundere');
		await generateCharacterField('tags', blankContext);
		const tagsPrompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(tagsPrompt).toContain('The only tags you may pick from');

		completeWithContinuation.mockResolvedValueOnce('A quiet room.');
		await generateCharacterField('scenario', blankContext);
		const scenarioPrompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(scenarioPrompt).not.toContain('The only tags you may pick from');
	});

	it('includes other already-filled fields as context', async () => {
		completeWithContinuation.mockResolvedValueOnce('generated');
		await generateCharacterField('personality', {
			...blankContext,
			name: 'Aria',
			description: 'A wandering scholar.'
		});
		const prompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(prompt).toContain('Aria');
		expect(prompt).toContain('A wandering scholar.');
	});

	it("still tells the model about the field's own current value, so regenerating doesn't ignore what's already there", async () => {
		completeWithContinuation.mockResolvedValueOnce('generated');
		await generateCharacterField('personality', {
			...blankContext,
			personality: 'quiet, watchful, dry sense of humor'
		});
		const prompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(prompt).toContain('quiet, watchful, dry sense of humor');
	});

	it('tells the model about already-chosen tags and asks it to add rather than repeat them', async () => {
		completeWithContinuation.mockResolvedValueOnce('tsundere');
		await generateCharacterField('tags', { ...blankContext, tags: ['fantasy', 'romantic'] });
		const prompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(prompt).toContain('fantasy, romantic');
		expect(prompt.toLowerCase()).toContain("don't repeat");
	});

	it('tells the model about existing alternate greetings so a new one is distinct, not a duplicate', async () => {
		completeWithContinuation.mockResolvedValueOnce('generated');
		await generateCharacterField('alternate_greetings', {
			...blankContext,
			alternate_greetings: ['*waves* Hey there.']
		});
		const prompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(prompt).toContain('*waves* Hey there.');
	});

	it('folds in optional user instructions', async () => {
		completeWithContinuation.mockResolvedValueOnce('generated');
		await generateCharacterField('first_message', blankContext, 'Make it playful and short.');
		const prompt = completeWithContinuation.mock.calls.at(-1)![1][0].content;
		expect(prompt).toContain('Make it playful and short.');
	});
});
