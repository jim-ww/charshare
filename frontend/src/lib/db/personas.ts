import { get, set } from 'idb-keyval';
import type { Persona, PersonaId } from '$lib/types';

/** Personas are always local-only — never published or synced to a relay — so
 *  this is the entire store, mirroring db/chats.ts. */
const STORE_KEY = 'charshare:personas';

export async function loadPersonas(): Promise<Record<PersonaId, Persona>> {
	return (await get<Record<PersonaId, Persona>>(STORE_KEY)) ?? {};
}

export function savePersonas(personas: Record<PersonaId, Persona>): Promise<void> {
	return set(STORE_KEY, personas);
}
