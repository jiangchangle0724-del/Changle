// A full set, made: the moment the original game makes of it, a team owning a whole group (rent there
// doubles, and it can build). Its spaces light up on the board one after another in the team's colour
// (art/RoundBoard.tsx LitSet, art.css .set-lit) and a call comes up over the board with a brass call:
// on the big screen and on every phone, the phone's own team's with a buzz. Only sets made while the
// screen is up: the ones it finds when it first draws are old news. Decoration: the city sheets and
// the rent tables say the same; with reduced motion the call simply shows and the board stays still.
import { useEffect, useRef, useState } from "preact/hooks";
import { CITY_AT, EUROPE, GROUPS, GROUP_SPACES, ISTANBUL, canBuild, ownsSet, type GameState } from "../../engine";
import type { RoomView } from "../../room/protocol";
import type { LitSet } from "../art/RoundBoard";
import { BUZZ, buzz } from "../controls";
import { t, tx } from "../i18n";
import { sfx } from "../sound";
import { GroupIcon, TEAM_COLORS, seatName, teamOf } from "./common";

/** How long a set just made shows (ms): its spaces light up from 0.5 s and go out by 3.2 s. */
const SHOW_MS = 3400;

/** Each whole group a team owns, as "seat:group". */
function setsOf(s: GameState): Set<string> {
  const out = new Set<string>();
  s.ps.forEach((pl, p) => {
    if (pl.out) return;
    for (const g of GROUPS) if (ownsSet(s, p, g.id)) out.add(`${p}:${g.id}`);
  });
  return out;
}

export interface NewSet {
  key: string;
  seat: number;
  group: number;
}

/** The full sets made since this screen started watching the game, each for SHOW_MS. */
export function useNewSets(v: RoomView): NewSet[] {
  const s = v.game?.s;
  const game = v.game?.startedAt ?? 0;
  const now = s ? setsOf(s) : new Set<string>();
  const sig = `${game}|${[...now].sort().join(",")}`;
  const seen = useRef<{ game: number; sets: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<NewSet[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const was = seen.current;
    seen.current = { game, sets: now };
    if (!was || was.game !== game) return;
    const made = [...now].filter((k) => !was.sets.has(k));
    if (!made.length) return;
    const stamp = Date.now();
    const list = made.map((k) => {
      const [seat, group] = k.split(":").map(Number);
      return { key: `${k}@${stamp}`, seat, group };
    });
    setFresh((x) => [...x, ...list]);
    timers.current.push(window.setTimeout(() => setFresh((x) => x.filter((f) => !list.includes(f))), SHOW_MS));
  }, [sig]);
  return fresh;
}

/** The board's light for sets just made: the team's spaces of the group in the order round the ring
 * (Istanbul with them when it stands in for a Europe city the team hasn't got). */
export function litSets(v: RoomView, fresh: NewSet[]): LitSet[] {
  const s = v.game?.s;
  if (!s) return [];
  return fresh.map((f) => {
    const group = GROUP_SPACES[f.group] ?? [];
    const own = group.filter((at) => s.deeds[at]?.owner === f.seat);
    const stands = f.group === EUROPE && own.length < group.length && s.deeds[ISTANBUL]?.owner === f.seat;
    const team = teamOf(v, f.seat);
    return {
      key: f.key,
      color: team ? TEAM_COLORS[team.color] : (GROUPS.find((g) => g.id === f.group)?.color ?? "#fff"),
      spaces: (stands ? [...own, ISTANBUL] : own).sort((a, b) => a - b),
    };
  });
}

/** The call over the board for the newest set just made (`big`: the big screen's), with its sound. Its
 * cities light up in it one after another as their spaces do on the board, which a phone's play
 * window may be covering. */
export function SetCall({ v, big }: { v: RoomView; big?: boolean }) {
  const fresh = useNewSets(v);
  const s = v.game?.s;
  const played = useRef(new Set<string>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    for (const f of fresh) {
      if (played.current.has(f.key)) continue;
      played.current.add(f.key);
      const mine = v.you.seats.includes(f.seat);
      // (as the spaces start to light up, once the owner's stamp is down)
      timers.current.push(
        window.setTimeout(() => {
          sfx.set(big || mine);
          if (mine && !big) buzz(BUZZ.set);
        }, 550),
      );
    }
  }, [fresh.map((f) => f.key).join(",")]);
  if (!fresh.length || !s) return null;
  const f = fresh[fresh.length - 1];
  const group = GROUPS.find((g) => g.id === f.group);
  if (!group) return null;
  const mine = v.you.seats.includes(f.seat);
  const team = teamOf(v, f.seat);
  const name = tx(group.name);
  const build = mine && (GROUP_SPACES[f.group] ?? []).some((at) => canBuild(s, f.seat, at));
  const cities = litSets(v, [f])[0]?.spaces ?? [];
  return (
    <div
      class={`set-call${big ? " big" : ""}${mine ? " mine" : ""}`}
      key={f.key}
      style={{ "--group": group.color, "--team": team ? TEAM_COLORS[team.color] : group.color }}
      aria-hidden="true"
    >
      <span class="set-shape">
        <GroupIcon group={group.id} size={big ? 40 : 26} />
      </span>
      <b>{mine ? t("setMine", { group: name }) : t("setTheirs", { team: seatName(v, f.seat), group: name })}</b>
      <span class="set-cities">
        {cities.map((at, i) => {
          const city = CITY_AT[at];
          return city ? (
            <i key={at} style={{ "--i": i }}>
              {tx(city.name)}
            </i>
          ) : null;
        })}
      </span>
      <small>{t(build ? "setBuild" : "setRent")}</small>
    </div>
  );
}
