/** Minimal PNG chunk reader/writer — just enough to find/insert a `tEXt`
 *  chunk carrying an embedded character card (see characterCard.ts), without
 *  touching the actual image data (IHDR/IDAT/etc. pass through untouched).
 *  Not a general-purpose PNG library — no compression, no chunk validation
 *  beyond what's needed to round-trip safely. */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngChunk {
	type: string;
	data: Uint8Array;
}

/** Standard PNG/zlib CRC-32, table-based — required so a written chunk isn't
 *  silently rejected by strict PNG readers. */
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
	if (bytes.length < 8) return false;
	return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Parses `bytes` into its PNG signature + chunk list. Throws if `bytes`
 *  isn't a well-formed PNG (bad signature, or a chunk running past the end
 *  of the buffer) — callers should catch and treat as "not a PNG". */
export function parsePng(bytes: Uint8Array): PngChunk[] {
	if (!isPng(bytes)) throw new Error('Not a PNG file (bad signature).');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: PngChunk[] = [];
	let offset = 8;
	while (offset < bytes.length) {
		if (offset + 8 > bytes.length) throw new Error('Truncated PNG chunk header.');
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		if (dataEnd + 4 > bytes.length) throw new Error('Truncated PNG chunk data.');
		chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
		offset = dataEnd + 4; // skip the trailing 4-byte CRC, we recompute on write
		if (type === 'IEND') break;
	}
	return chunks;
}

/** Re-serializes `chunks` back into PNG bytes, recomputing each chunk's CRC. */
export function writePng(chunks: PngChunk[]): Uint8Array {
	const parts: Uint8Array[] = [Uint8Array.from(PNG_SIGNATURE)];
	for (const chunk of chunks) {
		const typeBytes = Uint8Array.from([...chunk.type].map((c) => c.charCodeAt(0)));
		const lengthBytes = new Uint8Array(4);
		new DataView(lengthBytes.buffer).setUint32(0, chunk.data.length);
		const crcInput = new Uint8Array(typeBytes.length + chunk.data.length);
		crcInput.set(typeBytes, 0);
		crcInput.set(chunk.data, typeBytes.length);
		const crcBytes = new Uint8Array(4);
		new DataView(crcBytes.buffer).setUint32(0, crc32(crcInput));
		parts.push(lengthBytes, typeBytes, chunk.data, crcBytes);
	}
	const total = parts.reduce((sum, p) => sum + p.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const part of parts) {
		out.set(part, pos);
		pos += part.length;
	}
	return out;
}

const LATIN1_ENCODER = (text: string): Uint8Array => Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff));
const LATIN1_DECODER = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/** Builds a `tEXt` chunk's data payload: `keyword\0text`, both Latin-1 — the
 *  chunk type itself isn't included, see writePng. */
function textChunkData(keyword: string, text: string): Uint8Array {
	const keywordBytes = LATIN1_ENCODER(keyword);
	const textBytes = LATIN1_ENCODER(text);
	const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
	data.set(keywordBytes, 0);
	data[keywordBytes.length] = 0;
	data.set(textBytes, keywordBytes.length + 1);
	return data;
}

/** Reads a `tEXt` chunk's `keyword\0text` payload back apart. */
function parseTextChunk(data: Uint8Array): { keyword: string; text: string } {
	const nullIndex = data.indexOf(0);
	if (nullIndex < 0) throw new Error('Malformed tEXt chunk (no keyword terminator).');
	return {
		keyword: LATIN1_DECODER(data.slice(0, nullIndex)),
		text: LATIN1_DECODER(data.slice(nullIndex + 1))
	};
}

/** Finds a `tEXt` chunk with the given `keyword` and returns its text value,
 *  or null if `bytes` isn't a PNG or has no such chunk. */
export function readTextChunk(bytes: Uint8Array, keyword: string): string | null {
	let chunks: PngChunk[];
	try {
		chunks = parsePng(bytes);
	} catch {
		return null;
	}
	for (const chunk of chunks) {
		if (chunk.type !== 'tEXt') continue;
		try {
			const parsed = parseTextChunk(chunk.data);
			if (parsed.keyword === keyword) return parsed.text;
		} catch {
			continue;
		}
	}
	return null;
}

/** Returns `bytes` with a `tEXt` chunk for `keyword`/`text` inserted just
 *  before `IEND` — replacing any existing chunk with the same keyword, so
 *  re-exporting the same image doesn't pile up duplicate `tEXt` chunks. */
export function writeTextChunk(bytes: Uint8Array, keyword: string, text: string): Uint8Array {
	const chunks = parsePng(bytes).filter((c) => {
		if (c.type !== 'tEXt') return true;
		try {
			return parseTextChunk(c.data).keyword !== keyword;
		} catch {
			return true;
		}
	});
	const iendIndex = chunks.findIndex((c) => c.type === 'IEND');
	const insertAt = iendIndex < 0 ? chunks.length : iendIndex;
	chunks.splice(insertAt, 0, { type: 'tEXt', data: textChunkData(keyword, text) });
	return writePng(chunks);
}
