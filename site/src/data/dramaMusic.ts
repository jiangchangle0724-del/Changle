import type { DramaKind } from "./drama";
import type { ReadKind } from "./dramaReadings";

/**
 * 戏精大赏's music: what each act sounds like while it's played. Every scene, famous scene and
 * kind of reading has a mood; the music itself is composed in code from the mood and the scene's
 * own id (`site/src/party/drama/score.ts`), so no two scenes play the same tune and nothing is
 * downloaded or licensed. Off stage (choosing, reading the cards, voting, the reveal) the game plays
 * its own theme instead.
 */

export type Mood =
  /** a murder-mystery manor, a museum at night: brushed drums, walking bass, minor piano */
  | "noir"
  /** a heist against the clock: pulsing bass, a held breath */
  | "suspense"
  /** the palace: plucked strings in the pentatonic scale, a gong */
  | "palace"
  /** a family at home: warm, easy, a music box */
  | "homey"
  /** a festival or a party at home: bells, claps, bright */
  | "festive"
  /** love: a slow piano ballad */
  | "romance"
  /** a goodbye: slow, minor, no drums */
  | "heartbreak"
  /** the office: easy jazz, swung */
  | "office"
  /** a TV studio, a contest, a livestream: brass and claps */
  | "gameshow"
  /** a sneaky little mystery: tiptoeing pizzicato */
  | "sneaky"
  /** outdoors: a lake, a cabin, a picnic, strummed strings */
  | "outdoors"
  /** KTV, a dance floor: four on the floor */
  | "party"
  /** Halloween, magic: a music box in the dark */
  | "spooky"
  /** a big film moment: strings, horns, timpani */
  | "cinema"
  /** a soap-opera scandal: dramatic chords, timpani hits */
  | "soap"
  /** the news: a ticking theme */
  | "news"
  /** waiting-room music, for a straight face */
  | "elevator"
  /** an apology at a press conference: slow organ chords */
  | "solemn"
  /** a duel or a meltdown: a heartbeat */
  | "tension";

export const MOODS: Mood[] = [
  "noir", "suspense", "palace", "homey", "festive", "romance", "heartbreak", "office", "gameshow", "sneaky",
  "outdoors", "party", "spooky", "cinema", "soap", "news", "elevator", "solemn", "tension",
];

/** A scene of a kind with no mood of its own sounds like its kind. */
export const KIND_MOOD: Record<DramaKind, Mood> = {
  crime: "noir",
  palace: "palace",
  family: "homey",
  love: "romance",
  office: "office",
  show: "gameshow",
};

/** Each built-in scene's own mood (one not listed: its kind's). */
export const SCENE_MOOD: Record<string, Mood> = {
  // family
  "family-new-year-dumplings": "festive",
  "family-cake-floor": "sneaky",
  "family-heirloom-receipt": "sneaky",
  "family-group-vote": "sneaky",
  "family-downpayment-envelope": "sneaky",
  "family-ex-seating": "soap",
  "family-will-parking": "soap",
  "family-lipstick-collar": "soap",
  "family-surprise-heir": "soap",
  "family-red-envelope-double": "festive",
  "family-mom-phone-locked": "sneaky",
  "family-new-car-scratch": "sneaky",
  "family-designer-bag": "soap",
  "family-mahjong-red-dragon": "sneaky",
  "family-banquet-lobster": "festive",
  "family-envelope-old-flame": "soap",
  "solo-birthday-call": "heartbreak",
  "family-camp-snacks": "outdoors",
  "family-parents-chat": "sneaky",
  "family-building-blackout": "suspense",
  "cn-family-chat-photo": "homey",
  "cn-singles-day-parcels": "sneaky",
  "ca-cottage-canoe": "outdoors",
  "sa-diwali-sweets-box": "festive",
  "sa-cricket-final-password": "tension",
  "ph-noche-buena-flan": "festive",
  "ph-balikbayan-box": "homey",
  "ph-debut-eighteen-roses": "romance",
  "kr-chuseok-jeon": "homey",
  "jp-otoshidama-envelopes": "festive",
  "ir-nowruz-haft-sin": "festive",
  "ir-yalda-watermelon": "homey",
  "eu-nonna-sauce": "homey",
  // love
  "love-anniversary-gift": "soap",
  "love-proposal-subtitles": "romance",
  "love-rainy-umbrella": "romance",
  "love-noodle-review": "sneaky",
  "love-wedding-plus-one": "soap",
  "love-key-under-pot": "soap",
  "love-honeymoon-refund": "soap",
  "love-wedding-eve-photo": "soap",
  "love-whistler-toothbrush": "soap",
  "love-library-letter": "romance",
  "love-valentine-lunch": "soap",
  "love-secret-santa-letter": "romance",
  "love-three-blind-dates": "sneaky",
  "love-ktv-dedication": "soap",
  "love-time-capsule-letter": "romance",
  "solo-best-man-speech": "festive",
  "solo-ex-wedding-toast": "soap",
  "love-wedding-rings": "suspense",
  "love-reunion-letter": "romance",
  "ir-khastegari-tea": "romance",
  // office
  "office-missing-bonus": "suspense",
  "office-boardroom-earring": "soap",
  "office-money-tree": "sneaky",
  "office-skytrain-laptop": "suspense",
  "office-hot-pot-both-spicy": "sneaky",
  "office-printer-cats": "sneaky",
  "office-secret-santa-mugs": "soap",
  "office-salary-sheet-leak": "suspense",
  "solo-ceo-press": "solemn",
  "office-potluck-chili": "sneaky",
  "office-raffle-rigged": "gameshow",
  "ca-hockey-pool": "gameshow",
  "jp-hanami-bento": "outdoors",
  "jp-omiyage-box": "sneaky",
  // crime
  "crime-open-house-cookie": "sneaky",
  "crime-museum-squeak": "sneaky",
  "crime-chalet-ransom": "suspense",
  "crime-costco-massage-chair": "sneaky",
  "crime-porch-package": "sneaky",
  "crime-halloween-ballot-box": "spooky",
  "crime-night-market-recipe": "sneaky",
  "solo-museum-guide": "suspense",
  "crime-escape-room-key": "suspense",
  "ca-snow-day-driveway": "sneaky",
  "eu-christmas-market-cashbox": "festive",
  // show
  "show-reunion-cue": "soap",
  "show-secret-sponsor": "soap",
  "show-final-night-texts": "soap",
  "show-charity-stream": "suspense",
  "show-ktv-perfect-score": "party",
  "show-magic-rabbit": "spooky",
  "show-couple-account-single": "soap",
  "solo-weather-report": "news",
  "solo-live-workout": "party",
  "show-karaoke-skip": "party",
  "show-wrap-party-leak": "suspense",
  "cn-square-dance-speaker": "party",
  "sa-sangeet-song": "party",
  "kr-drama-finale-spoiler": "soap",
  "eu-eurovision-scores": "party",
};

/** Each famous scene's mood (none listed: a film score). */
export const CLASSIC_MOOD: Record<string, Mood> = {
  "zh-dahua-ten-thousand-years": "cinema",
  "zh-king-of-comedy-seaside": "heartbreak",
  "zh-infernal-affairs-rooftop": "suspense",
  "zh-wulin-landlady-regrets": "sneaky",
  "zh-gala-selling-crutches": "sneaky",
  "zh-gala-white-cloud-black-earth": "homey",
  "zh-let-the-bullets-fly": "cinema",
  "zh-journey-west-queen": "palace",
  "zh-white-snake-umbrella": "palace",
  "zh-drawing-sword-cannon": "cinema",
  "zh-flirting-scholar-couplets": "palace",
  "zh-empresses-plum-garden": "palace",
  "zh-romance-rain-open-the-door": "soap",
  "zh-wandering-earth-safety-first": "cinema",
  "en-titanic-flying": "romance",
  "en-empire-your-father": "cinema",
  "en-friends-pivot": "sneaky",
  "en-few-good-men-truth": "suspense",
  "en-jerry-maguire-money": "party",
  "en-forrest-gump-run": "outdoors",
  "en-home-alone-disappear": "festive",
  "en-lion-king-pride-rock": "cinema",
  "en-mean-girls-pink": "party",
  "en-harry-potter-wizard": "spooky",
  "en-love-actually-cards": "romance",
  "en-back-to-the-future-gigawatts": "suspense",
  "en-et-phone-home": "cinema",
  "en-schitts-creek-cheese": "sneaky",
  "en-princess-bride-inigo": "cinema",
};

/** Each kind of reading's mood. */
export const READ_MOOD: Record<ReadKind, Mood> = {
  cry: "heartbreak",
  breakup: "heartbreak",
  melodrama: "soap",
  court: "palace",
  anchor: "news",
  sell: "gameshow",
  sorry: "solemn",
  rant: "tension",
  voice: "cinema",
  deadpan: "elevator",
  deep: "romance",
};

/** A scene's mood: its own, else its kind's (a written scene of an unknown kind: home). */
export function sceneMood(id: string, kind: string): Mood {
  return SCENE_MOOD[id] ?? KIND_MOOD[kind as DramaKind] ?? "homey";
}
