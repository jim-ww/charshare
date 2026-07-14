import { browser } from '$app/environment';
import type { CharacterId, Persona, PersonaId } from '$lib/types';
import { loadPersonas, savePersonas } from '$lib/db/personas';
import { confirmDialogWithExtra } from '$lib/state/confirmDialog.svelte';
import type { ImportConflictState } from '$lib/export/importConflict';
import { m } from '$lib/paraglide/messages.js';
import { getMyProfile } from './profile.svelte';
import { getPreferences, updatePreferences } from './preferences.svelte';

let personas = $state<Record<PersonaId, Persona>>({});
let ready = $state(false);
let initPromise: Promise<void> | null = null;
let persistenceEnabled = true;

export function getPersonas(): Persona[] {
	return Object.values(personas);
}

export function getPersona(id: PersonaId): Persona | undefined {
	return personas[id];
}

export function isPersonasReady(): boolean {
	return ready;
}

/** The name to actually show for a persona — while `auto_name` is true (the
 *  always-present initial persona, untouched by the user) this tracks the
 *  profile username live instead of the stored `name`. Falls back to "User"
 *  if that would otherwise be blank, same as the profile username. */
export function personaDisplayName(persona: Persona): string {
	if (persona.auto_name) {
		return getMyProfile()?.username?.trim() || 'User';
	}
	return persona.name.trim() || 'User';
}

async function persist(): Promise<void> {
	if (!persistenceEnabled) return;
	await savePersonas($state.snapshot(personas));
}

export function initPersonas(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			const loaded = await loadPersonas();
			personas = loaded;
			// First run (or personas somehow all deleted) — there must always be
			// at least one persona to play as.
			if (Object.keys(personas).length === 0) {
				const initial: Persona = {
					id: crypto.randomUUID(),
					name: '',
					description: '',
					auto_name: true,
					created_at: Date.now()
				};
				personas = { [initial.id]: initial };
				await persist();
			}
			ready = true;
		})();
	}
	return initPromise;
}

export async function createPersona(fields: { name: string; description?: string }): Promise<Persona> {
	const persona: Persona = {
		id: crypto.randomUUID(),
		name: fields.name,
		description: fields.description ?? '',
		auto_name: false,
		created_at: Date.now()
	};
	personas = { ...personas, [persona.id]: persona };
	await persist();
	return persona;
}

export async function updatePersona(
	id: PersonaId,
	fields: { name: string; description?: string }
): Promise<void> {
	const existing = personas[id];
	if (!existing) throw new Error('Persona not found.');
	// Only opts out of live profile-username tracking if the name was actually
	// changed away from what was being auto-displayed — otherwise saving the
	// edit form untouched (or before the profile has even loaded, when the
	// live-tracked value is momentarily the "User" placeholder) would silently
	// freeze the persona on a stale name forever.
	const nameChanged = fields.name.trim() !== personaDisplayName(existing);
	personas = {
		...personas,
		[id]: {
			...existing,
			name: fields.name,
			description: fields.description ?? existing.description,
			auto_name: existing.auto_name && !nameChanged
		}
	};
	await persist();
}

/** There must always be at least one persona to play as — refuses to delete
 *  the last remaining one. */
export async function deletePersona(id: PersonaId): Promise<void> {
	if (Object.keys(personas).length <= 1) {
		throw new Error("Can't delete your only persona.");
	}
	const { [id]: _removed, ...rest } = personas;
	personas = rest;
	await persist();
}

/** Restores a persona from a full data backup, preserving its original id
 *  (unlike importPersonaDraft, which is for importing someone else's shared
 *  persona and deliberately mints a new id). Used by dataExport.ts's bulk
 *  "personas" category import, so re-restoring the same backup merges
 *  instead of piling up duplicate copies every time.
 *
 *  Personas have no version field, so an id collision with different content
 *  is resolved by asking the user which to keep. */
export async function restorePersona(
	persona: Persona,
	options: { conflict?: ImportConflictState } = {}
): Promise<'added' | 'updated' | 'skipped'> {
	const existing = personas[persona.id];
	if (!existing) {
		personas = { ...personas, [persona.id]: persona };
		await persist();
		return 'added';
	}
	if (JSON.stringify(existing) === JSON.stringify(persona)) return 'skipped';

	if (!options.conflict?.replaceAll) {
		const result = await confirmDialogWithExtra({
			title: m.import_conflict_title(),
			message: m.personas_restore_conflict_message({ name: personaDisplayName(existing) }),
			confirmLabel: m.import_conflict_replace(),
			extraLabel: m.import_conflict_replace_all()
		});
		if (result === 'cancel') return 'skipped';
		if (result === 'extra' && options.conflict) options.conflict.replaceAll = true;
	}

	personas = { ...personas, [persona.id]: persona };
	await persist();
	return 'updated';
}

/** Serializes a persona for the "Export" action — plain JSON so it
 *  round-trips through importPersonaDraft (see below). Resolves the display
 *  name so an auto-named persona exports something meaningful. */
export function exportPersona(id: PersonaId): string {
	const persona = personas[id];
	if (!persona) throw new Error('Persona not found.');
	return JSON.stringify({ ...persona, name: personaDisplayName(persona) }, null, 2);
}

/** Parses a previously-exported persona JSON into a fresh draft — the caller
 *  is expected to pass this to createPersona, which assigns a new id. */
export function importPersonaDraft(json: string): { name: string; description: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not valid JSON.');
	}
	if (typeof parsed !== 'object' || parsed === null || typeof (parsed as Persona).name !== 'string') {
		throw new Error('Not a valid persona export.');
	}
	const source = parsed as Persona;
	return { name: source.name, description: source.description ?? '' };
}

/** Which persona is currently selected for `characterId`, falling back to
 *  whichever persona happens to be first if none was ever picked (or the
 *  previously-picked one was deleted). */
export function getSelectedPersonaId(characterId: CharacterId): PersonaId | undefined {
	const selected = getPreferences().personaSelections[characterId];
	if (selected && personas[selected]) return selected;
	return Object.keys(personas)[0];
}

export async function selectPersonaForCharacter(characterId: CharacterId, personaId: PersonaId): Promise<void> {
	await updatePreferences({
		personaSelections: { ...getPreferences().personaSelections, [characterId]: personaId }
	});
}

/** Test-only escape hatch: bypasses IndexedDB persistence (unavailable under
 *  plain Node/vitest), mirroring __setChatsForTests. */
export function __setPersonasForTests(next: Record<PersonaId, Persona>): void {
	personas = next;
	ready = true;
	persistenceEnabled = false;
}
