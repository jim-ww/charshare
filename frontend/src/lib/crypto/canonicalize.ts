/** Deterministic JSON serialization: object keys sorted recursively, no whitespace.
 *  Same input always produces the same byte sequence, which is required for
 *  signatures to verify regardless of key insertion order. */
export function canonicalize(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

/** Strips `signature` and re-canonicalizes — the exact bytes that were/should be signed. */
export function canonicalizeForSigning<T extends { signature?: string }>(doc: T): string {
	const { signature: _signature, ...rest } = doc;
	return canonicalize(rest);
}
