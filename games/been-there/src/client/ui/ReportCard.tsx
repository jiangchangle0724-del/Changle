// The finale's report card (战报): the awards the game earned (the top landlord, the priciest night,
// the quiz champ…), and how the dice fell, a bar for each total against the long run, with the
// numbers, so nobody has to wonder whether they were loaded. On a phone it can be saved or sent as a
// picture (reportPicture.ts): press and hold to save it, share it where the phone can, or download it.
import { useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { money, spaceName, t, type Key } from "../i18n";
import { Btn, SeatChip, Sheet } from "./common";
import { drawReport } from "./reportPicture";
import { LONG_RUN, awards, diceOf, type Award } from "./tripReport";

/** What an award was for, in a few words. */
export function awardText(a: Award): string {
  switch (a.kind) {
    case "landlord":
      return t("awardText_landlord", { amount: money(a.value) });
    case "dearest":
      return t("awardText_dearest", { amount: money(a.value), space: spaceName(a.at ?? 0) });
    case "hotDice":
      return t("awardText_hotDice", { avg: a.value.toFixed(1) });
    default:
      return t(`awardText_${a.kind}` as Key, { n: a.value });
  }
}

/** A bar for each total of two dice, and a dot where the long run would have it. */
function DiceChart({ totals, throws }: { totals: number[]; throws: number }) {
  if (!throws) return null;
  const expected = LONG_RUN.map((p) => p * throws);
  const top = Math.max(1, ...totals, ...expected);
  const H = 72;
  const bw = 20;
  const gap = 8;
  const W = 11 * bw + 10 * gap;
  return (
    <figure class="dice-chart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={t("reportDiceChart")}>
        {totals.map((n, i) => {
          const x = i * (bw + gap);
          const h = Math.max(1.5, (n / top) * H);
          return (
            <g key={i}>
              <rect class="bar" x={x} y={H - h} width={bw} height={h} rx="3" />
              <circle class="dot" cx={x + bw / 2} cy={H - (expected[i] / top) * H} r="3" />
              <text class="lbl" x={x + bw / 2} y={H + 15}>
                {i + 2}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption class="hint">{t("reportDiceChart")}</figcaption>
    </figure>
  );
}

export function ReportCard({ v, big }: { v: RoomView; big?: boolean }) {
  const tally = v.game?.tally;
  const [pic, setPic] = useState<{ url: string; file: File | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!tally) return null;
  const list = awards(tally);
  const dice = diceOf(tally);
  const save = async () => {
    setBusy(true);
    try {
      const c = await drawReport(v, awardText);
      if (!c) return;
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
      // (a data address, not a blob one: WeChat's browser saves it on a long press too)
      setPic({ url: c.toDataURL("image/png"), file: blob ? new File([blob], "trip-report.png", { type: "image/png" }) : null });
    } finally {
      setBusy(false);
    }
  };
  const file = pic?.file ?? null;
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  return (
    // (on the big screen, two awards a row: a fifth takes a third, `many`)
    <section class={`report${big ? " big" : ""}${big && list.length > 4 ? " many" : ""}`} aria-label={t("reportTitle")}>
      <h2>{t("reportTitle")}</h2>
      {list.length > 0 && (
        // (not a <ul>: on the big screen the card sits in the standings' list, whose rows are its <li>s)
        <div class="awards" role="list">
          {list.map((a) => (
            <div key={a.kind} class="award-row" role="listitem">
              <b class="award">{t(`award_${a.kind}` as Key)}</b>
              <span class="who">
                {a.seats.map((seat) => (
                  <SeatChip key={seat} v={v} seat={seat} small />
                ))}
              </span>
              <small class="muted">{awardText(a)}</small>
            </div>
          ))}
        </div>
      )}
      <DiceChart totals={dice.totals} throws={dice.throws} />
      {/* (the big screen has room for the short line) */}
      <p class="hint dice-line">{t(big ? "reportDiceShort" : "reportDice", { n: dice.throws, avg: dice.avg.toFixed(1), d: dice.doubles })}</p>
      {!big && (
        <Btn wide disabled={busy} onClick={() => void save()}>
          {t("reportSave")}
        </Btn>
      )}
      {pic && (
        <Sheet title={t("reportSaveTitle")} onClose={() => setPic(null)}>
          <img class="report-pic" src={pic.url} alt={t("reportPicAlt")} width={1080} height={1350} />
          <p class="hint">{t("reportSaveHint")}</p>
          <div class="choices">
            {canShare && (
              <Btn kind="primary" onClick={() => void navigator.share({ files: [file!], title: t("title") }).catch(() => {})}>
                {t("reportShare")}
              </Btn>
            )}
            <a class="btn quiet" href={pic.url} download="trip-report.png">
              {t("reportDownload")}
            </a>
          </div>
        </Sheet>
      )}
    </section>
  );
}
