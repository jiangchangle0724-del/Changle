// What a gathering is made of. Shared by the rules, the room, the server and the phone pages.

export type Lang = "zh" | "en";

/** A Vancouver calendar day: "2026-11-21". */
export type Day = string;
/** A part of a day; "day" is the whole day (a gathering asked about by the day). */
export type Part = "am" | "pm" | "eve" | "day";
/** Asked by the half day (morning, afternoon, evening) or by the day. */
export type Grain = "half" | "day";
/** One thing people answer: a day and a part, "2026-11-21:eve". */
export type SlotKey = string;
/** 2: free (有空). 1: could move things (可以调). A slot not in someone's answers: not free. */
export type Answer = 1 | 2;
export type Answers = Record<SlotKey, Answer>;

export type Person = {
  id: string;
  name: string;
  /** the host marked them as someone the gathering can't happen without */
  must: boolean;
  /** the host filled this row in for someone (代填) */
  proxy: boolean;
  answers: Answers;
  /** when they last saved, in milliseconds */
  at: number;
};

export type Settled = { day: Day; part: Part; at: number };

/** Everything a phone is shown. Nothing here is secret: everyone sees everyone's answers. */
export type EventState = {
  code: string;
  title: string;
  days: Day[];
  grain: Grain;
  createdAt: number;
  /** the gathering and everything in it is deleted then */
  expiresAt: number;
  /** answer by then, or null for no deadline */
  deadline: number | null;
  /** fewer than this many able to come, and a slot isn't offered */
  minPeople: number;
  settled: Settled | null;
  people: Person[];
  /** goes up by one with every change */
  v: number;
};
