/** Baked-in tag list for the Browse carousel, modeled on JanitorAI's tag
 *  set (help.janitorai.com/en/article/faq-tags-1bo153l). Only tags whose
 *  meaning isn't self-evident carry a description. All lowercase, spaces
 *  written as hyphens, so tags stay consistent regardless of who typed them. */
export interface PredefinedTag {
	name: string;
	description?: string;
}

export const PREDEFINED_TAGS: PredefinedTag[] = [
	{
		name: "smut",
		description: "NSFW is the whole point, little plot otherwise",
	},
	{ name: "fluff", description: "Soft, wholesome, comforting themes" },
	{ name: "angst", description: "Moody themes — fear, anxiety, sadness" },
	{ name: "horror", description: "Disturbing or creepy elements" },
	{ name: "comedy", description: "Silly, meant to make you laugh" },
	{ name: "male" },
	{ name: "female" },
	{ name: "trans" },
	{ name: "non-binary" },
	{ name: "dominant" },
	{ name: "submissive" },
	{
		name: "switch",
		description: "Alternates between dominant and submissive roles",
	},
	{ name: "fictional" },
	{ name: "oc", description: "Original character, not from existing media" },
	{ name: "non-human" },
	{ name: "monster" },
	{ name: "monster-girl" },
	{ name: "demi-human" },
	{ name: "furry" },
	{ name: "giant" },
	{ name: "alien" },
	{ name: "vampire" },
	{ name: "robot" },
	{ name: "elf" },
	{ name: "villain" },
	{ name: "hero" },
	{ name: "game" },
	{ name: "anime" },
	{ name: "books" },
	{ name: "sci-fi" },
	{ name: "any-pov", description: "Works from any reader perspective" },
	{ name: "male-pov", description: "Written for a male reader perspective" },
	{ name: "female-pov", description: "Written for a female reader perspective" },
	{ name: "mlm", description: "Male/male romance" },
	{ name: "wlw", description: "Woman/woman romance" },
	{ name: "enemies-to-lovers" },
	{ name: "historical" },
	{ name: "royalty" },
	{ name: "political" },
	{ name: "religion" },
	{ name: "philosophical" },
	{ name: "magical" },
	{ name: "rpg" },
	{ name: "scenario" },
	{
		name: "dead-dove",
		description: "Darker content — check warnings before diving in",
	},
	{ name: "multiple", description: "More than one character in this bot" },
];
