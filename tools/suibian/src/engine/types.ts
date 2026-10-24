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

/** "avoid": I don't eat it (warn when ordering). "severe": rule out places where it is everywhere. */
export type AllergyLevel = "avoid" | "severe";

/** Per-person budget ceiling in CAD; 0 means no limit. */
export type Budget = 0 | 20 | 35 | 60;

/** Something not on the list, typed by the person (香菜, pork, mushrooms…). */
export interface CustomItem {
  name: string;
  level: AllergyLevel;
}

/** One person's hard limits. Never shown to others with their name on it. */
export interface Limits {
  allergies: Partial<Record<AllergenId, AllergyLevel>>;
  /** Can't be matched to cuisines, so these only warn, never rule a place out. */
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
  /** "$" to "$$$$". */
  priceLabel?: string;
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

export type RangeId = "walk10" | "walk20" | "drive15" | "drive25";

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
