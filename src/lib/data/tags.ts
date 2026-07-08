/** Baked-in tag list for the Browse carousel, modeled on JanitorAI's tag
 *  set (help.janitorai.com/en/article/faq-tags-1bo153l). Only tags whose
 *  meaning isn't self-evident carry a description. */
export interface PredefinedTag {
	name: string;
	description?: string;
}

export const PREDEFINED_TAGS: PredefinedTag[] = [
	{
		name: "Smut",
		description: "NSFW is the whole point, little plot otherwise",
	},
	{ name: "Fluff", description: "Soft, wholesome, comforting themes" },
	{ name: "Angst", description: "Moody themes — fear, anxiety, sadness" },
	{ name: "Horror", description: "Disturbing or creepy elements" },
	{ name: "Comedy", description: "Silly, meant to make you laugh" },
	{ name: "Male" },
	{ name: "Female" },
	{ name: "Trans" },
	{ name: "Non-Binary" },
	{ name: "Dominant" },
	{ name: "Submissive" },
	{
		name: "Switch",
		description: "Alternates between dominant and submissive roles",
	},
	{ name: "Fictional" },
	{ name: "OC", description: "Original character, not from existing media" },
	{ name: "Non-Human" },
	{ name: "Monster" },
	{ name: "Monster Girl" },
	{ name: "Demi-Human" },
	{ name: "Furry" },
	{ name: "Giant" },
	{ name: "Alien" },
	{ name: "Vampire" },
	{ name: "Robot" },
	{ name: "Elf" },
	{ name: "Villain" },
	{ name: "Hero" },
	{ name: "Game" },
	{ name: "Anime" },
	{ name: "Books" },
	{ name: "Sci-Fi" },
	{ name: "AnyPOV", description: "Works from any reader perspective" },
	{ name: "MalePOV", description: "Written for a male reader perspective" },
	{ name: "FemalePOV", description: "Written for a female reader perspective" },
	{ name: "MLM", description: "Male/male romance" },
	{ name: "WLW", description: "Woman/woman romance" },
	{ name: "Enemies to Lovers" },
	{ name: "Historical" },
	{ name: "Royalty" },
	{ name: "Political" },
	{ name: "Religion" },
	{ name: "Philosophical" },
	{ name: "Magical" },
	{ name: "RPG" },
	{ name: "Scenario" },
	{
		name: "Dead Dove",
		description: "Darker content — check warnings before diving in",
	},
	{ name: "Multiple", description: "More than one character in this bot" },
];
