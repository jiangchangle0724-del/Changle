// The words the rules speak: places, people's limits, votes. Shared by server, room and phones.

export type Lang = "zh" | "en";
export type Text = Record<Lang, string>;

export type CuisineId =
  | "cantonese"
  | "hk_cafe"
  | "sichuan"
  | "hotpot"
  | "taiwanese"
  | "chinese"
  | "japanese"
  | "ramen"
  | "korean"
  | "vietnamese"
  | "thai"
  | "sea"
  | "indian"
  | "middle_eastern"
  | "italian"
  | "mexican"
  | "western"
  | "seafood"
  | "vegetarian"
  | "brunch"
  | "other";

export type AllergenId = "peanut" | "treenut" | "shellfish" | "fish" | "sesame" | "soy" | "chili" | "egg" | "dairy" | "gluten";

/**
 * "avoid": I don't eat it. "severe": a real allergy. Neither rules a place out (the owner's call,
 * 2026-11-11): places where it is common move down the list, severe ones to the very bottom, each
 * with a note on what can still be ordered.
 */
export type AllergyLevel = "avoid" | "severe";

/** Per-person budget ceiling in CAD; 0 means no limit. */
export type Budget = 0 | 20 | 35 | 60;

/** Something not on the list, typed by the person (香菜, pork, mushrooms…). */
export interface CustomItem {
  name: string;
  level: AllergyLevel;
}

/** One person's limits. Never shown to others with their name on it. Only the budget rules a place out. */
export interface Limits {
  allergies: Partial<Record<AllergenId, AllergyLevel>>;
  /** Can't be matched to cuisines, so these only warn. */
  custom: CustomItem[];
  halal: boolean;
  vegetarian: boolean;
  budget: Budget;
}

export const NO_LIMITS: Limits = { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 };

/** A restaurant as the rules see it, made from Google Places (or demo data) plus our own numbers. */
export interface Place {
  /** Google place_id (the only Google field we may keep). Demo places start with "demo-". */
  id: string;
  name: string;
  cuisine: CuisineId;
  lat: number;
  lng: number;
  /** Google rating 1–5 and how many people rated. */
  rating?: number;
  ratings?: number;
  /** Rough lowest price per person in CAD, from Google's price range or level. */
  price?: number;
  /** Highest price per person in CAD, when Google gives a range. */
  priceTo?: number;
  /** "$" to "$$$$". */
  priceLabel?: string;
  /** Up to three dishes it's known for, guessed from its name and Google type (keys of DISHES). */
  dishes?: string[];
  /** Google's AI summary of the place (English only in Canada), shown with its disclosure and a flag link. */
  summary?: { text: string; disclosure: string; flag?: string };
  openNow?: boolean;
  /** When it next closes (ms since epoch). */
  closesAt?: number;
  reservable?: boolean;
  /** Google's servesVegetarianFood; undefined when Google doesn't say. */
  veg?: boolean;
  /** "yes": says halal in its name or description. */
  halal?: "yes" | "maybe";
  phone?: string;
  mapsUrl?: string;
  photo?: string;
  /** Who took the photo; Google requires showing this with it. */
  photoBy?: { name: string; uri?: string };
  /** A Google review that mentions queueing, with its author (shown with attribution). */
  waitQuote?: { text: string; author: string };
  /** Google's one-line description of the place (its editorial summary), when it has one. */
  about?: string;
  /** Google's short address, used to tell branches of the same name apart. */
  address?: string;
  /** Greater Vancouver lists it is on (Michelin, Vancouver Magazine…), from src/data/lists.json. */
  badges?: Badge[];
  /** Steve's own pick for it: a line of why, and food-blogger posts about it (src/data/picks.json). */
  recommend?: Recommend;
  /** Our own post-meal numbers for this place. */
  ours?: PlaceStats;
  demo?: boolean;
}

export interface PlaceStats {
  up: number;
  mid: number;
  down: number;
  /** Reported waits in minutes (most recent last, at most 20). */
  waits: number[];
}

export type RangeId =
  | "walk5"
  | "walk10"
  | "walk15"
  | "walk20"
  | "walk30"
  | "drive5"
  | "drive10"
  | "drive15"
  | "drive25"
  | "drive40"
  | "any";

/** How the range is measured: on foot, by car, or not at all (all of Greater Vancouver). */
export type RangeMode = "walk" | "drive" | "any";

/** A list a restaurant is on, e.g. "Michelin Bib Gourmand 2025". Facts only, with where it says so. */
export interface Badge {
  /** Which list (an id in lists.json's sources). */
  source: string;
  label: Text;
  year?: number;
  url?: string;
}

/** A post about a place on a food-blogger platform (小红书, 抖音, TikTok, Instagram, YouTube, a blog). */
export interface RecommendLink {
  platform: string;
  url: string;
  title?: string;
}

/** Someone's own recommendation of a place, written for this app. */
export interface Recommend {
  note: Text;
  by?: string;
  links: RecommendLink[];
}

export interface Center {
  lat: number;
  lng: number;
  /** Neighbourhood name when picked from the list instead of GPS. */
  label?: string;
}

export type MoodPick = "like" | "ban";

export interface Ballot {
  approve: string[];
  veto: string | null;
}

export interface Rating {
  overall: "up" | "mid" | "down";
  liked: boolean;
  /** Minutes waited: 0, 15, 30 or 45 (45 or more). */
  wait: 0 | 15 | 30 | 45;
}
