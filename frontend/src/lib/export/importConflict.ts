/** Mutable, shared by every restore call across one whole `importDataFile`
 *  run (every category, every item) — a "Replace All" choice on the first
 *  same-version conflict flips this so every later conflict in the same
 *  import silently resolves as "replace" too, instead of prompting per item.
 *  A plain object rather than Svelte state: it's local bookkeeping scoped to
 *  a single function call chain, never rendered directly. */
export interface ImportConflictState {
	replaceAll: boolean;
}

export function createImportConflictState(): ImportConflictState {
	return { replaceAll: false };
}
