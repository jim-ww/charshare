import { describe, expect, it } from "vitest";
import { matchesQuery, queryWords } from "./search.svelte";
import type { Character } from "$lib/types";

function char(name: string, tags: string[]): Character {
	return { name, tags } as Character;
}

describe("queryWords", () => {
	it("splits and lowercases on whitespace", () => {
		expect(queryWords("Fantasy  Female")).toEqual(["fantasy", "female"]);
	});

	it("returns an empty array for blank input", () => {
		expect(queryWords("   ")).toEqual([]);
	});
});

describe("matchesQuery", () => {
	it("requires every tag word to be present, not just one (AND, not OR)", () => {
		const c = char("Aria", ["fantasy"]);
		expect(matchesQuery(c, "fantasy female")).toBe(false);
		expect(matchesQuery(c, "fantasy")).toBe(true);
	});

	it("matches when a character carries all listed tags", () => {
		const c = char("Aria", ["fantasy", "female"]);
		expect(matchesQuery(c, "fantasy female")).toBe(true);
	});

	it("falls back to a name-text match for words that aren't tags", () => {
		const c = char("Aria the Fantasy Queen", ["female"]);
		expect(matchesQuery(c, "fantasy female")).toBe(true);
	});

	it("fails when a non-tag word is absent from both tags and name", () => {
		const c = char("Aria", ["female"]);
		expect(matchesQuery(c, "fantasy female")).toBe(false);
	});

	it("is exact-match, not substring, against tags", () => {
		const c = char("Aria", ["female-lead"]);
		expect(matchesQuery(c, "female")).toBe(false);
	});
});
