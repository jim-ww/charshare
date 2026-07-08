// ISO 639-1 codes, most-common-first for roleplay chat audiences.
export const LANGUAGES: [code: string, name: string][] = [
	["en", "English"],
	["es", "Spanish"],
	["pt", "Portuguese"],
	["fr", "French"],
	["de", "German"],
	["it", "Italian"],
	["ru", "Russian"],
	["ja", "Japanese"],
	["ko", "Korean"],
	["zh", "Chinese"],
	["ar", "Arabic"],
	["hi", "Hindi"],
	["id", "Indonesian"],
	["tr", "Turkish"],
	["pl", "Polish"],
	["nl", "Dutch"],
	["sv", "Swedish"],
	["vi", "Vietnamese"],
	["th", "Thai"],
	["uk", "Ukrainian"],
];

export function languageName(code: string): string {
	return LANGUAGES.find(([c]) => c === code)?.[1] ?? code;
}
