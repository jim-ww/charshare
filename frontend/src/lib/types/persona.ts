export type PersonaId = string; // uuid

/** A "mask" the user can wear while chatting with characters — local-only,
 *  never published or synced to a relay. See db/personas.ts and
 *  state/personas.svelte.ts. */
export interface Persona {
  id: PersonaId;
  name: string; // ignored (kept for export round-tripping) while auto_name is true
  description: string; // optional, can be empty
  // True only for the always-present initial persona, until the user edits
  // its name directly — while true, its displayed name tracks the profile
  // username live instead of using the stored `name`.
  auto_name: boolean;
  created_at: number;
}
