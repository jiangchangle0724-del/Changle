// The big screen's departures board, two split-flap rows. The first calls the team on turn to board,
// with its flight number (its letter and which turn this is). The second says where its token is:
// the city it leaves from; on a move, each city it passes as it gets there (in step with the board,
// from the server's moment of the throw); then where it arrives. Under them, what the table is waiting
// for and the time left, once the token has landed.
import { useEffect, useState } from "preact/hooks";
import { BOARD, CITY_AT } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { CODE } from "../art/stamps";
import { getLang, money, spaceName, t } from "../i18n";
import { serverNow } from "../store";
import { Countdown, TEAM_COLORS, TEAM_LETTERS, seatName, teamOf } from "./common";
import { pendingSummary } from "./Decision";
import { rowsOf } from "./Ride";
import type { RidePlan } from "./ridePlan";

/** Three letters for a space that isn't a city. */
const KIND_CODE: Record<string, string> = {
  go: "DEP",
  postcard: "PST",
  tax: "TAX",
  route: "RTE",
  journey: "JNY",
  immigration: "IMM",
  lounge: "VIP",
  expired: "EXP",
  service: "SVC",
};

/** A space's three letters on the board: a city's airport code, or the space's own. */
export const codeAt = (at: number) => {
  const city = CITY_AT[at];
  return city ? CODE[city.id] : (KIND_CODE[BOARD[at]?.k ?? ""] ?? "---");
};

function Tiles({ code }: { code: string }) {
  return (
    <span class="tiles" aria-hidden="true">
      {code
        .padEnd(3, " ")
        .slice(0, 3)
        .split("")
        .map((ch, i) => (
          <span key={i} class="tile" style={{ "--i": i }}>
            {ch}
          </span>
        ))}
    </span>
  );
}

/** Where the token is on a move at server time `now`, and what the board says about it. */
function whereOn(move: RidePlan, now: number): { at: number; status: string } {
  const last = move.legs[move.legs.length - 1];
  if (now >= move.start + move.t.land) return { at: last.to, status: move.jail ? t("sentToImmigration") : t("arrived") };
  let shown: ReturnType<typeof rowsOf>[number] | null = null;
  for (const r of rowsOf(move)) if (move.start + r.at <= now) shown = r;
  if (!shown) return { at: move.legs[0].from, status: t("departing") };
  if (shown.kind === "salary") return { at: 0, status: `+${money(shown.amount ?? 0)}` };
  if (shown.kind === "card") return { at: shown.space, status: t("journey") };
  if (shown.kind === "stay") return { at: shown.space, status: t("rideStay") };
  return { at: shown.space, status: t("rideVia") };
}

/** Whether `seat`'s token has moved since its turn began (it's arrived, rather than about to leave). */
function movedThisTurn(v: RoomView, seat: number): boolean {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t !== "game") continue;
    if (f.e.t === "turn") return false;
    if (f.e.t === "move" && f.e.p === seat) return true;
  }
  return false;
}

export function Departures({ v, move }: { v: RoomView; move: RidePlan | null }) {
  const g = v.game!;
  const s = g.s;
  const [, tick] = useState(0);
  const now = serverNow();
  const seat = move ? move.seat : s.turn;
  const team = teamOf(v, seat);
  const turnNo = (s.ps[seat]?.turns ?? 0) + (s.turn === seat ? 1 : 0);
  const flight = `${team ? TEAM_LETTERS[team.color] : "-"}${String(Math.max(1, turnNo) % 100).padStart(2, "0")}`;
  const here = move ? whereOn(move, now) : { at: s.ps[seat]?.pos ?? 0, status: movedThisTurn(v, seat) ? t("arrived") : t("departing") };
  const city = CITY_AT[here.at];
  const lang = getLang();
  // (what the table waits for is the landing's: it waits for the token too)
  const readyAt = move ? move.start + move.t.ready : 0;
  const ask = now >= readyAt ? pendingSummary(v) : "";
  // Re-drawn when the next row is due, the token lands and the table's question comes up.
  const next = move
    ? [...rowsOf(move).map((r) => move.start + r.at), move.start + move.t.land, readyAt].filter((x) => x > now).sort((a, b) => a - b)[0] ?? 0
    : 0;
  useEffect(() => {
    if (!next) return;
    const id = window.setTimeout(() => tick((n) => n + 1), next - serverNow() + 10);
    return () => clearTimeout(id);
  });
  return (
    <section class="departures-board" style={team ? { "--team": TEAM_COLORS[team.color] } : undefined} aria-live="polite">
      <ol>
        <li class="bb-row boarding" key={`turn-${seat}-${turnNo}`}>
          <Tiles code={flight} />
          <span class="nm">{seatName(v, seat)}</span>
          <span class="stt">{t("nowBoarding")}</span>
        </li>
        <li class={`bb-row where${here.status === t("arrived") ? " landed" : ""}`} key={`at-${here.at}-${here.status}`}>
          <Tiles code={codeAt(here.at)} />
          <span class="nm">
            {city ? (lang === "zh" ? city.name.zh : city.name.en) : spaceName(here.at)}
            {city && <small>{lang === "zh" ? city.name.en : city.name.zh}</small>}
          </span>
          <span class="stt">{here.status}</span>
        </li>
      </ol>
      {ask && (
        <p class="bb-ask">
          {ask}
          {g.deadline && g.deadline > now && (
            <>
              {" "}
              <Countdown until={g.deadline} />
            </>
          )}
        </p>
      )}
    </section>
  );
}
