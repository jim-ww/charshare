import { describe, it, expect, beforeEach } from 'vitest';
import {
	__setPersonasForTests,
	createPersona,
	deletePersona,
	exportPersona,
	getPersona,
	getPersonas,
	importPersonaDraft,
	personaDisplayName,
	updatePersona
} from './personas.svelte';
import type { Persona } from '$lib/types';

function persona(overrides: Partial<Persona> = {}): Persona {
	return {
		id: crypto.randomUUID(),
		name: '',
		description: '',
		auto_name: true,
		created_at: Date.now(),
		...overrides
	};
}

beforeEach(() => {
	__setPersonasForTests({});
});

describe('createPersona / deletePersona', () => {
	it('creates and lists a persona', async () => {
		const p = await createPersona({ name: 'Alex', description: 'A mask' });
		expect(getPersonas()).toEqual([p]);
		expect(getPersona(p.id)).toEqual(p);
		expect(p.auto_name).toBe(false);
	});

	it('deletes a persona', async () => {
		const a = await createPersona({ name: 'A' });
		const b = await createPersona({ name: 'B' });
		await deletePersona(a.id);
		expect(getPersonas()).toEqual([b]);
	});

	it("refuses to delete the last remaining persona", async () => {
		const only = await createPersona({ name: 'Only' });
		await expect(deletePersona(only.id)).rejects.toThrow("Can't delete your only persona.");
		expect(getPersonas()).toEqual([only]);
	});
});

describe('updatePersona', () => {
	it('updates name/description and clears auto_name', async () => {
		const initial = persona({ auto_name: true });
		__setPersonasForTests({ [initial.id]: initial });

		await updatePersona(initial.id, { name: 'Renamed', description: 'New desc' });

		const updated = getPersona(initial.id)!;
		expect(updated.name).toBe('Renamed');
		expect(updated.description).toBe('New desc');
		expect(updated.auto_name).toBe(false);
	});

	it('throws for an unknown persona', async () => {
		await expect(updatePersona('missing', { name: 'X' })).rejects.toThrow('Persona not found.');
	});
});

describe('personaDisplayName', () => {
	it('falls back to "User" for an auto-named persona with no profile set', () => {
		const p = persona({ auto_name: true, name: '' });
		expect(personaDisplayName(p)).toBe('User');
	});

	it('falls back to "User" for a manually-named persona with a blank name', () => {
		const p = persona({ auto_name: false, name: '   ' });
		expect(personaDisplayName(p)).toBe('User');
	});

	it('uses the stored name for a manually-named persona', () => {
		const p = persona({ auto_name: false, name: 'Detective Mode' });
		expect(personaDisplayName(p)).toBe('Detective Mode');
	});
});

describe('exportPersona / importPersonaDraft', () => {
	it('round-trips through export/import', async () => {
		const original = await createPersona({ name: 'Exported', description: 'Round-trips' });
		const json = exportPersona(original.id);
		const draft = importPersonaDraft(json);
		expect(draft).toEqual({ name: 'Exported', description: 'Round-trips' });
	});

	it('rejects invalid JSON', () => {
		expect(() => importPersonaDraft('not json')).toThrow('Not valid JSON.');
	});

	it('rejects JSON missing a name field', () => {
		expect(() => importPersonaDraft(JSON.stringify({ description: 'no name' }))).toThrow(
			'Not a valid persona export.'
		);
	});
});
