// Every place's side quest on screen (the rules are one for all: STALLS and taste in src/engine): four
// spots along the back, left to right, each with its icon and name; the words for one done and for
// all four; and the round's title for whoever did the most. The night market tastes its stalls, the
// seawall snaps its views, the transit hall waits at the train's doors, the theatre lights its lanterns.
import type { ArenaId } from "../../engine";
import type { Key } from "../i18n";
import type { IconName } from "./chrome";

export interface QuestLook {
  /** the phone's chip: its title, and its words for screen readers ({n} done) */
  title: Key;
  label: Key;
  /** one spot done ({snack}, {n} to go), all four (+2), and the big screen's line when someone does all four */
  done: Key;
  feast: Key;
  feastTv: Key;
  /** the four spots, left to right */
  spots: readonly { icon: IconName; name: Key }[];
  /** the round's title for whoever did the most */
  award: Key;
  awardWhy: Key;
}

export const QUESTS: Record<ArenaId, QuestLook> = {
  market: {
    title: "questTitle",
    label: "questLabel",
    done: "tasted",
    feast: "feast",
    feastTv: "feastTv",
    spots: [
      { icon: "squid", name: "snack0" },
      { icon: "fishball", name: "snack1" },
      { icon: "tea", name: "snack2" },
      { icon: "potato", name: "snack3" }
    ],
    award: "awardFoodie",
    awardWhy: "awardFoodieWhy"
  },
  plaza: {
    title: "questPlazaTitle",
    label: "questPlazaLabel",
    done: "questPlazaDone",
    feast: "questPlazaFeast",
    feastTv: "questPlazaFeastTv",
    spots: [
      { icon: "bridge", name: "view0" },
      { icon: "mountain", name: "view1" },
      { icon: "seaplane", name: "view2" },
      { icon: "sails", name: "view3" }
    ],
    award: "awardShutterbug",
    awardWhy: "awardShutterbugWhy"
  },
  metro: {
    title: "questMetroTitle",
    label: "questMetroLabel",
    done: "questMetroDone",
    feast: "questMetroFeast",
    feastTv: "questMetroFeastTv",
    spots: [
      { icon: "trainDoor", name: "door0" },
      { icon: "trainDoor", name: "door1" },
      { icon: "trainDoor", name: "door2" },
      { icon: "trainDoor", name: "door3" }
    ],
    award: "awardRegular",
    awardWhy: "awardRegularWhy"
  },
  gallery: {
    title: "questGalleryTitle",
    label: "questGalleryLabel",
    done: "questGalleryDone",
    feast: "questGalleryFeast",
    feastTv: "questGalleryFeastTv",
    spots: [
      { icon: "lantern", name: "lantern0" },
      { icon: "lantern", name: "lantern1" },
      { icon: "lantern", name: "lantern2" },
      { icon: "lantern", name: "lantern3" }
    ],
    award: "awardLamplighter",
    awardWhy: "awardLamplighterWhy"
  }
};
