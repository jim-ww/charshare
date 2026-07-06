/** Small encode/decode helpers instead of relying on the newer
 *  Uint8Array.to/fromBase64 methods, which aren't yet reliable across browsers
 *  (notably Safari) — same rationale as avoiding SubtleCrypto for Ed25519. */
export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
