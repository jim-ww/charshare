/** Baked-in tag list for the Browse carousel. Only tags whose meaning
 *  isn't self-evident carry a description. All lowercase, spaces written
 *  as hyphens, so tags stay consistent regardless of who typed them.
 *  Ordered by estimated popularity, most-used first, since the app
 *  doesn't track real tag usage stats — dere archetypes and generic/common
 *  tags are grouped and pulled up; explicit kink tags are grouped at the
 *  bottom.
 *
 */
export type PredefinedTagType =
	| "tone"
	| "identity"
	| "dynamic"
	| "origin"
	| "dere"
	| "role"
	| "species"
	| "setting"
	| "relationship"
	| "pov"
	| "kink"
	| "misc";

export interface PredefinedTag {
	name: string;
	description?: string;
	type: PredefinedTagType;
}

export const PREDEFINED_TAGS: PredefinedTag[] = [
	{
		name: "smut",
		description: "NSFW is the whole point, little plot otherwise",
		type: "tone",
	},
	{ name: "female", type: "identity" },
	{ name: "male", type: "identity" },
	{
		name: "fluff",
		description: "Soft, wholesome, comforting themes",
		type: "tone",
	},
	{
		name: "dominant",
		description: "Takes charge, controls the dynamic",
		type: "dynamic",
	},
	{
		name: "submissive",
		description: "Yields control, follows the other's lead",
		type: "dynamic",
	},
	{
		name: "oc",
		description: "Original character, not from existing media",
		type: "origin",
	},
	{
		name: "fictional",
		description: "From an existing show, game, or story",
		type: "origin",
	},
	{
		name: "angst",
		description: "Moody themes — fear, anxiety, sadness",
		type: "tone",
	},
	{
		name: "scenario",
		description: "Predefined setup or plot to roleplay through",
		type: "misc",
	},
	{ name: "anime", type: "setting" },
	{
		name: "tsundere",
		description: "Hostile or cold at first, secretly caring",
		type: "dere",
	},
	{
		name: "yandere",
		description: "Obsessively, dangerously devoted",
		type: "dere",
	},
	{
		name: "kuudere",
		description: "Cool, aloof, emotionally reserved",
		type: "dere",
	},
	{
		name: "dandere",
		description: "Shy and quiet, opens up slowly",
		type: "dere",
	},
	{
		name: "himedere",
		description: "Acts like royalty, expects to be doted on",
		type: "dere",
	},
	{
		name: "mesugaki",
		description: "Bratty, cocky, loves to tease and provoke",
		type: "dere",
	},
	{
		name: "oujidere",
		description: "Acts like a prince — charming, chivalrous",
		type: "dere",
	},
	{
		name: "kamidere",
		description: "God complex, arrogant and self-assured",
		type: "dere",
	},
	{
		name: "bakadere",
		description: "Airheaded, cheerful, oblivious",
		type: "dere",
	},
	{
		name: "emotionless",
		description: "Doesn't feel or express emotion",
		type: "dere",
	},
	{
		name: "deadpan",
		description: "Flat, unreactive delivery, even to absurd or extreme things",
		type: "dere",
	},
	{ name: "villain", type: "role" },
	{ name: "hero", type: "role" },
	{
		name: "comedy",
		description: "Silly, meant to make you laugh",
		type: "tone",
	},
	{ name: "monster-girl", type: "species" },
	{
		name: "non-human",
		description: "Not a human, e.g. animal, spirit, object",
		type: "species",
	},
	{
		name: "game",
		description: "Based on or set in a video game",
		type: "setting",
	},
	{
		name: "switch",
		description: "Alternates between dominant and submissive roles",
		type: "dynamic",
	},
	{
		name: "royalty",
		description: "Kings, queens, princes, princesses, nobility",
		type: "role",
	},
	{
		name: "historical",
		description: "Set in a real past era",
		type: "setting",
	},
	{
		name: "magical",
		description: "Magic or supernatural powers are central",
		type: "tone",
	},
	{
		name: "horror",
		description: "Disturbing or creepy elements",
		type: "tone",
	},
	{
		name: "wholesome",
		description: "Warm, kind, no dark themes",
		type: "tone",
	},
	{
		name: "tragic",
		description: "Sad or sorrowful themes, doesn't end happily",
		type: "tone",
	},
	{
		name: "mystery",
		description: "A puzzle or secret drives the plot",
		type: "tone",
	},
	{ name: "adventure", type: "tone" },
	{
		name: "whimsical",
		description: "Playful, quirky, lighthearted",
		type: "tone",
	},
	{ name: "epic", description: "Grand scale, high stakes", type: "tone" },
	{ name: "romantic", type: "tone" },
	{
		name: "enemies-to-lovers",
		description: "Starts as rivals or foes, becomes romantic",
		type: "relationship",
	},
	{ name: "vampire", type: "species" },
	{ name: "monster", type: "species" },
	{
		name: "multiple",
		description: "More than one character in this bot",
		type: "misc",
	},
	{
		name: "furry",
		description: "Anthropomorphic animal character",
		type: "species",
	},
	{ name: "sci-fi", type: "setting" },
	{
		name: "fantasy",
		description: "Set in an invented world, not necessarily magical",
		type: "setting",
	},
	{ name: "modern", description: "Set in the present day", type: "setting" },
	{ name: "school", type: "setting" },
	{
		name: "cyberpunk",
		description: "High-tech, dystopian near-future setting",
		type: "setting",
	},
	{ name: "post-apocalyptic", type: "setting" },
	{ name: "military", type: "setting" },
	{
		name: "isekai",
		description: "Character transported to another world",
		type: "setting",
	},
	{ name: "office", type: "setting" },
	{ name: "pirate", type: "setting" },
	{ name: "superhero", type: "setting" },
	{
		name: "noir",
		description: "Moody detective/crime setting",
		type: "setting",
	},
	{ name: "western", type: "setting" },
	{
		name: "steampunk",
		description: "Retro-futuristic, steam-powered technology",
		type: "setting",
	},
	{ name: "space", type: "setting" },
	{
		name: "slice-of-life",
		description: "Everyday, low-stakes moments",
		type: "setting",
	},
	{ name: "catgirl", type: "species" },
	{ name: "succubus", type: "species" },
	{ name: "demon", type: "species" },
	{ name: "angel", type: "species" },
	{ name: "werewolf", type: "species" },
	{ name: "dragon", type: "species" },
	{ name: "mermaid", type: "species" },
	{ name: "ghost", type: "species" },
	{ name: "zombie", type: "species" },
	{ name: "dwarf", type: "species" },
	{ name: "childhood-friends", type: "relationship" },
	{ name: "arranged-marriage", type: "relationship" },
	{
		name: "possessive",
		description: "Jealous, controlling attachment to their partner",
		type: "relationship",
	},
	{ name: "age-gap", type: "relationship" },
	{
		name: "slow-burn",
		description: "Romance or tension that builds gradually",
		type: "relationship",
	},
	{ name: "roommates", type: "relationship" },
	{ name: "teacher-student", type: "relationship" },
	{
		name: "family",
		description: "Non-sexual parent or sibling dynamics",
		type: "relationship",
	},
	{ name: "found-family", type: "relationship" },
	{ name: "best-friends", type: "relationship" },
	{ name: "exes", type: "relationship" },
	{ name: "rivals", type: "relationship" },
	{ name: "long-distance", type: "relationship" },
	{ name: "blind-date", type: "relationship" },
	{
		name: "mutual-pining",
		description: "Both like each other, neither says it",
		type: "relationship",
	},
	{ name: "maid", type: "role" },
	{ name: "assassin", type: "role" },
	{ name: "idol", type: "role" },
	{ name: "knight", type: "role" },
	{ name: "priest", type: "role" },
	{ name: "doctor", type: "role" },
	{ name: "soldier", type: "role" },
	{ name: "hacker", type: "role" },
	{ name: "streamer", type: "role" },
	{ name: "chef", type: "role" },
	{ name: "non-binary", type: "identity" },
	{ name: "elf", type: "species" },
	{ name: "robot", type: "species" },
	{
		name: "rpg",
		description: "Stat-driven or turn-based roleplay mechanics",
		type: "misc",
	},
	{
		name: "demi-human",
		description: "Human with non-human traits, e.g. horns or a tail",
		type: "species",
	},
	{ name: "books", type: "setting" },
	{ name: "alien", type: "species" },
	{ name: "giant", type: "species" },
	{
		name: "any-pov",
		description: "Works from any reader perspective",
		type: "pov",
	},
	{
		name: "male-pov",
		description: "Written for a male reader perspective",
		type: "pov",
	},
	{
		name: "female-pov",
		description: "Written for a female reader perspective",
		type: "pov",
	},
	{
		name: "bdsm",
		description: "Bondage, discipline, dominance, submission",
		type: "kink",
	},
	{
		name: "non-con",
		description: "In-story lack of consent",
		type: "kink",
	},
	{
		name: "loli",
		description: "Petite, young-looking female anime archetype",
		type: "kink",
	},
	{
		name: "shota",
		description: "Petite, young-looking male anime archetype",
		type: "kink",
	},
	{ name: "pregnancy", type: "kink" },
	{ name: "breeding", type: "kink" },
	{ name: "bondage", type: "kink" },
	{
		name: "incest",
		description: "Sexual or romantic relationship between characters who are family",
		type: "kink",
	},
	{ name: "size-difference", type: "kink" },
	{ name: "feet", type: "kink" },
	{ name: "watersports", type: "kink" },
	{
		name: "futanari",
		description: "Female character with male genitalia",
		type: "kink",
	},
	{
		name: "ntr",
		description: "Netorare — a partner being cheated on or stolen",
		type: "kink",
	},
	{ name: "tentacle", type: "kink" },
	{
		name: "humiliation",
		description: "Embarrassment or degradation as part of the kink",
		type: "kink",
	},
	{
		name: "exhibitionism",
		description: "Being watched, or the risk of being caught",
		type: "kink",
	},
	{
		name: "guro",
		description:
			"Grotesque themes — blood, mutilation, or body-horror, often eroticized",
		type: "kink",
	},
	{
		name: "dead-dove",
		description: "Darker content — check warnings before diving in",
		type: "kink",
	},
];
