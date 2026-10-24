import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { BOARD, CITY_AT, ROUTES, SERVICES, groupAt, priceOf, rentAt } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { colon, groupName, money, spaceName, t, tx } from "../i18n";
import { GroupIcon, Money, SeatChip, Sheet, TEAM_COLORS, TEAM_LETTERS, seatName, teamOf } from "./common";

/** Airport city codes as compact board labels (they read the same in both languages). */
export const CODES: Record<string, string> = {
  cairo: "CAI",
  capetown: "CPT",
  buenosaires: "BUE",
  mexicocity: "MEX",
  rio: "RIO",
  istanbul: "IST",
  mumbai: "BOM",
  dubai: "DXB",
  lasvegas: "LAS",
  vancouver: "YVR",
  newyork: "NYC",
  tokyo: "TYO",
  beijing: "BJS",
  shanghai: "SHA",
  bangkok: "BKK",
  sydney: "SYD",
  singapore: "SIN",
  venice: "VCE",
  paris: "PAR",
  london: "LON",
  seoul: "SEL",
  hongkong: "HKG",
};

/** Grid cell (row, column) of each space on an 11 × 11 board, Departure bottom-right, moving clockwise. */
export function cellOf(at: number): [number, number] {
  if (at <= 10) return [11, 11 - at];
  if (at <= 20) return [11 - (at - 10), 1];
  if (at <= 30) return [1, 1 + (at - 20)];
  return [1 + (at - 30), 11];
}

const SPACE_GLYPH: Record<string, string> = {
  go: "✈︎",
  route: "✈︎",
  service: "◎",
  journey: "?",
  postcard: "✉︎",
  tax: "$",
  immigration: "▣",
  lounge: "☕︎",
  expired: "⛔︎",
};

export function Board({ v, big, center }: { v: RoomView; big?: boolean; center?: ComponentChildren }) {
  const g = v.game!;
  const s = g.s;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div class={`board${big ? " big" : ""}`}>
      {BOARD.map((sp, at) => {
        const [r, c] = cellOf(at);
        const deed = s.deeds[at];
        const city = CITY_AT[at];
        const here = s.ps.map((p, seat) => (!p.out && p.pos === at ? seat : -1)).filter((x) => x >= 0);
        const owner = deed && deed.owner >= 0 ? teamOf(v, deed.owner) : undefined;
        const label = city ? (big ? tx(city.name) : CODES[city.id]) : big ? spaceName(at) : "";
        return (
          <button
            type="button"
            key={at}
            class={`cell k-${sp.k}${deed?.mort ? " mort" : ""}${at === s.ps[s.turn]?.pos ? " active" : ""}`}
            style={{ gridRow: r, gridColumn: c }}
            onClick={() => setOpen(at)}
            aria-label={spaceName(at)}
          >
            {city ? (
              <span class="band" style={{ background: groupColor(city.group) }}>
                <GroupIcon group={city.group} size={big ? 14 : 9} />
              </span>
            ) : (
              <span class="glyph" aria-hidden="true">
                {SPACE_GLYPH[sp.k] ?? ""}
              </span>
            )}
            <span class="label">{label}</span>
            {owner ? (
              <span class="owner" style={{ background: TEAM_COLORS[owner.color] }} title={seatName(v, deed!.owner)}>
                {TEAM_LETTERS[owner.color]}
                {deed!.houses > 0 && <i>{deed!.houses === 5 ? "H" : "•".repeat(deed!.houses)}</i>}
              </span>
            ) : deed ? (
              <span class="price num">{money(priceOf(s, at))}</span>
            ) : null}
            {here.length > 0 && (
              <span class="tokens">
                {here.map((seat) => {
                  const team = teamOf(v, seat);
                  return (
                    <span key={seat} class="token" style={{ background: TEAM_COLORS[team?.color ?? 0] }}>
                      {TEAM_LETTERS[team?.color ?? 0]}
                    </span>
                  );
                })}
              </span>
            )}
          </button>
        );
      })}
      <div class="center">{center}</div>
      {open !== null && <SpaceSheet v={v} at={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export const groupColor = (group: number) =>
  ({ 1: "#9c6b3c", 2: "#56b4e9", 3: "#cc79a7", 4: "#e69f00", 5: "#d55e00", 6: "#e8d33f", 7: "#009e73", 8: "#0072b2" })[group] ?? "#999";

/** Everything about one space: the city card (rule, the real fact behind it, greeting, currency, rents). */
export function SpaceSheet({ v, at, onClose }: { v: RoomView; at: number; onClose: () => void }) {
  const s = v.game!.s;
  const sp = BOARD[at];
  const city = CITY_AT[at];
  const deed = s.deeds[at];
  return (
    <Sheet title={spaceName(at)} onClose={onClose}>
      {city && (
        <div class="citycard">
          <p class="group">
            <GroupIcon group={city.group} size={14} /> {groupName(city.group)}
          </p>
          <p>
            <b>{tx(city.rule.title)}</b>{colon()}{tx(city.rule.text)}
          </p>
          <p class="muted">
            {t("realBasis")}{colon()}{tx(city.basis)}{" "}
            <a href={city.source} target="_blank" rel="noopener noreferrer">
              {t("source")}
            </a>
          </p>
          <p>
            {t("greeting")}{colon()}<span lang="und">{city.greeting.text}</span>
            {city.greeting.roman ? ` (${city.greeting.roman})` : ""} · {t("currency")}{colon()}{tx(city.currency)}
          </p>
          <p class="num">
            {t("emptyRent", {
              a: money(s.cfg.rents[city.id][0]),
              b: money(s.cfg.rents[city.id][1]),
              c: s.cfg.rents[city.id].slice(2, 6).map(money).join(" / "),
              d: money(s.cfg.rents[city.id][6]),
            })}
          </p>
        </div>
      )}
      {sp.k === "route" && (
        <p>
          {tx(ROUTES.find((r) => r.id === sp.id)!.name)} · {t("routeRent", { list: s.cfg.routeRent.map(money).join(" / ") })}
        </p>
      )}
      {sp.k === "service" && (
        <p>
          {tx(SERVICES.find((r) => r.id === sp.id)!.name)} · {t("serviceRent", { a: s.cfg.serviceTimes[0], b: s.cfg.serviceTimes[1] })}
        </p>
      )}
      {deed && (
        <p>
          {t("price")} <Money n={priceOf(s, at)} /> · {t("owner")}{colon()}
          {deed.owner >= 0 ? <SeatChip v={v} seat={deed.owner} /> : t("unowned")}
          {deed.owner >= 0 && !deed.mort && (
            <>
              {" "}
              · {t("rentNow", { rent: money(rentAt(s, at, 7)) })}
            </>
          )}
          {deed.mort && ` · ${t("mortgaged")}`}
          {groupAt(at) === null && null}
        </p>
      )}
    </Sheet>
  );
}
