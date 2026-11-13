import {
  BOARD,
  CITIES,
  CITY_AT,
  GROUPS,
  buildCost,
  canBuild,
  canMortgage,
  canSell,
  groupAt,
  houseCostAt,
  ownsSet,
  priceOf,
  rentAt,
  unmortgageCost,
} from "../../engine";
import { useRef } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { PassportBook } from "../art/Passport";
import { Lot, tint, type Gone } from "../art/RoundBoard";
import { CityPoster } from "../art/posters";
import { cardById, getLang, money, spaceName, t, tx } from "../i18n";
import { reducedMotion } from "../motion";
import { send } from "../store";
import { Btn, GroupIcon } from "./common";

export function Assets({ v, seat, compact }: { v: RoomView; seat: number; compact?: boolean }) {
  const g = v.game!;
  const s = g.s;
  const me = s.ps[seat];
  const pd = s.pending;
  const myTurn = !!pd && "who" in pd && pd.who === seat && (pd.k === "roll" || pd.k === "end" || pd.k === "debt");
  const inDebt = pd?.k === "debt";
  const mine = s.deeds.map((d, at) => ({ d, at })).filter((x) => x.d && x.d.owner === seat);
  const manage = (k: "build" | "sell" | "mortgage" | "unmortgage", at: number) => send({ t: "manage", k, at, seat });
  const order = (at: number) => (groupAt(at) ?? 9) * 100 + at;
  mine.sort((a, b) => order(a.at) - order(b.at));
  // What stands on each city as this list last drew it: one built since comes up out of the ground in
  // its row (where a phone builds, the board under the sheet), one sold sinks (art/RoundBoard.tsx Lot).
  const lots = useRef<{ map: Map<number, { n: number; from: number; gone?: Gone }>; k: number } | null>(null);
  lots.current ??= { map: new Map(mine.map(({ d, at }) => [at, { n: d!.houses, from: d!.houses }])), k: 0 };
  const lot = lots.current;
  // (with reduced motion a new building is simply there, and one sold simply gone)
  const still = reducedMotion();
  for (const { d, at } of mine) {
    const was = lot.map.get(at) ?? { n: 0, from: 0 };
    const n = d!.houses;
    if (n === was.n) continue;
    lot.map.set(at, {
      n,
      from: still ? n : n > was.n ? was.n : was.n >= 5 && n > 0 ? 0 : n,
      gone: n < was.n && !still ? { was: was.n, n, key: ++lot.k } : undefined,
    });
  }
  return (
    <div class={`assets${compact ? " compact" : ""}`}>
      {!compact && <h3>{t("mine")}</h3>}
      {!myTurn && !compact && <p class="hint">{t("onlyYourTurn")}</p>}
      {mine.length === 0 && <p class="muted">{t("noneYet")}</p>}
      <ul>
        {mine.map(({ d, at }) => {
          const grp = groupAt(at);
          const set = grp !== null && ownsSet(s, seat, grp);
          const buttons = [
            !inDebt && canBuild(s, seat, at) && (
              <Btn key="b" onClick={() => manage("build", at)}>
                {t("build", { cost: money(buildCost(s, at)) })}
              </Btn>
            ),
            canSell(s, seat, at) && (
              <Btn key="s" onClick={() => manage("sell", at)}>
                {t("sell", { cost: money(Math.round(houseCostAt(s, at) / 2)) })}
              </Btn>
            ),
            canMortgage(s, seat, at) && (
              <Btn key="m" onClick={() => manage("mortgage", at)}>
                {t("mortgage", { amount: money(priceOf(s, at) / 2) })}
              </Btn>
            ),
            !inDebt && d!.mort && (
              <Btn key="u" disabled={me.cash < unmortgageCost(s, at)} onClick={() => manage("unmortgage", at)}>
                {t("unmortgage", { amount: money(unmortgageCost(s, at)) })}
              </Btn>
            ),
          ].filter(Boolean);
          if (compact && !buttons.length) return null;
          return (
            <li key={at} class={d!.mort ? "mort" : ""} style={grp !== null ? { "--g": GROUPS.find((x) => x.id === grp)!.color } : undefined}>
              <div class="row">
                {CITY_AT[at] && !compact && (
                  <div class="poster thumb">
                    <CityPoster id={CITY_AT[at].id} />
                  </div>
                )}
                {grp !== null ? <GroupIcon group={grp} size={14} /> : <span class="glyph">{BOARD[at].k === "route" ? "✈︎" : "◎"}</span>}
                <b>{spaceName(at)}</b>
                <span class="muted">
                  {d!.mort
                    ? t("mortgaged")
                    : [
                        d!.houses === 5 ? t("hotel") : d!.houses > 0 ? t("houses", { n: d!.houses }) : "",
                        set && d!.houses === 0 ? t("set") : "",
                        t("rentNow", { rent: money(rentAt(s, at, 7)) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                {grp !== null && (set || d!.houses > 0 || lot.map.get(at)?.gone) && (
                  <Lot
                    at={at}
                    n={d!.houses}
                    from={lot.map.get(at)?.from ?? d!.houses}
                    gone={lot.map.get(at)?.gone}
                    color={tint(GROUPS.find((x) => x.id === grp)!.color, 0.45)}
                  />
                )}
              </div>
              {myTurn && buttons.length > 0 && <div class="choices">{buttons}</div>}
            </li>
          );
        })}
      </ul>
      {!compact && (
        <>
          {me.keep.length > 0 && (
            <>
              <h3>{t("cards")}</h3>
              <ul>
                {me.keep.map((id, i) => {
                  const c = cardById(id);
                  return (
                    <li key={i}>
                      <b>{c ? tx(c.title) : id}</b> <span class="muted">{c ? tx(c.text) : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <h3>{t("passport")}</h3>
          <PassportBook ids={me.stamps} lang={getLang()} empty={t("passportEmpty")} />
          <p class="stamps">
            {GROUPS.map((grp) => {
              const got = me.stamps.some((id) => CITIES.find((c) => c.id === id)?.group === grp.id);
              return (
                <span key={grp.id} class={got ? "got" : ""} title={tx(grp.name)}>
                  <GroupIcon group={grp.id} size={16} />
                </span>
              );
            })}{" "}
            {t("stampsOf", { n: GROUPS.filter((grp) => me.stamps.some((id) => CITIES.find((c) => c.id === id)?.group === grp.id)).length })}
          </p>
          {me.permits > 0 && <p>{t("permits", { n: me.permits })}</p>}
          {me.policy && <p>{t("policyHeld")}</p>}
          {me.jetlag && <p>{t("jetlag")}</p>}
        </>
      )}
    </div>
  );
}
