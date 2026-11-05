/**
 * Scoring for 一本正经 · Straight Face. Our own rules, written to make every non-judge WANT to be
 * picked as "the honest one" (so everyone performs), and to give the judge one risky tool (the tag).
 *
 *   Accused player           +L   (L = card level 1..3): whoever the judge believes, honest or not
 *   Judge, if accused=honest +L
 *   Tag on a bluffer         judge +1, that bluffer −1
 *   Tag on the honest        judge −2
 *   Side bet on the honest   +1 each (the honest player's own bet is ignored)
 *
 * The tagged player can never be the accused one (the engine refuses it), so the tag is a real bet.
 *
 * Penalties (optional, the site's drinking-game layer): a fooled judge drinks; a tagged bluffer
 * drinks; the bluffer who fooled the judge hands out a drink. `reason` is the drinking line; a
 * table with a penalty of its own words them from `why` instead (no line may say drink then).
 *
 * Reveal order on screen: definition → fun fact → preLines (who accused whom, the tag, the bets) →
 * the honest player → lines (points) → penalties. preLines never say who was honest.
 */
import type { T } from "../../i18n";
import type { GameOptions, Player, RoundResult, RoundState } from "./types";

const t = (zh: string, en: string): T => ({ zh, en });

export function scoreRound(round: RoundState, players: Player[], options: GameOptions): RoundResult {
  if (!round.accusedId) throw new Error("scoreRound before accusation");
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const L = round.level;
  const deltas: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const preLines: T[] = [];
  const lines: T[] = [];
  const penalties: RoundResult["penalties"] = [];
  const bump = (id: string, n: number) => {
    deltas[id] = (deltas[id] ?? 0) + n;
  };

  const judge = name(round.judgeId);
  const accused = name(round.accusedId);
  const right = round.accusedId === round.honestId;

  // Before the reveal: what everyone did. Nothing here depends on who was honest.
  preLines.push(t(`${judge} 指认了 ${accused}`, `${judge} accused ${accused}`));
  if (round.suspectId) {
    preLines.push(t(`疑点贴在了 ${name(round.suspectId)} 身上`, `The tag was on ${name(round.suspectId)}`));
  }
  const betEntries = Object.entries(round.bets).filter(([bettor]) => bettor !== round.judgeId);
  if (betEntries.length > 0) {
    const byTarget = new Map<string, string[]>();
    for (const [bettor, target] of betEntries) byTarget.set(target, [...(byTarget.get(target) ?? []), name(bettor)]);
    const zh = [...byTarget].map(([target, who]) => `押 ${name(target)} 的：${who.join("、")}`).join("；");
    const en = [...byTarget].map(([target, who]) => `${who.join(", ")} on ${name(target)}`).join("; ");
    preLines.push(t(zh, en));
  }

  // After the reveal: points and penalties.
  bump(round.accusedId, L);
  if (right) {
    bump(round.judgeId, L);
    lines.push(t(`${judge} 看穿了，${judge} 和 ${accused} 各 +${L}`, `${judge} saw through it: ${judge} and ${accused} both +${L}`));
  } else {
    lines.push(t(`${accused} 一本正经地骗过了 ${judge}，${accused} +${L}，${judge} 0 分`, `${accused} kept a straight face and fooled ${judge}: ${accused} +${L}, ${judge} 0`));
    if (options.penalties) {
      penalties.push({ playerId: round.judgeId, why: "fooled", reason: t("看走眼，喝一口", "Fooled. Drink.") });
      penalties.push({ playerId: round.accusedId, why: "master", reason: t("大忽悠，指定一个人喝", "Master bluffer: pick someone to drink") });
    }
  }

  if (round.suspectId) {
    const suspect = name(round.suspectId);
    if (round.suspectId === round.honestId) {
      bump(round.judgeId, -2);
      lines.push(t(`疑点打在了老实人 ${suspect} 身上，${judge} −2`, `The tag landed on the honest ${suspect}: ${judge} −2`));
    } else {
      bump(round.judgeId, 1);
      bump(round.suspectId, -1);
      lines.push(t(`疑点命中：${suspect} 在瞎编，${judge} +1，${suspect} −1`, `Tag hit: ${suspect} was bluffing. ${judge} +1, ${suspect} −1`));
      if (options.penalties) penalties.push({ playerId: round.suspectId, why: "caught", reason: t("被当场抓包，喝一口", "Caught bluffing. Drink.") });
    }
  }

  const winners = betEntries.filter(([bettor, target]) => bettor !== round.honestId && target === round.honestId).map(([bettor]) => bettor);
  for (const w of winners) bump(w, 1);
  if (betEntries.length > 0) {
    lines.push(winners.length ? t(`押对老实人的：${winners.map(name).join("、")}，各 +1`, `Bet on the honest one: ${winners.map(name).join(", ")}, +1 each`) : t("没人押对老实人", "Nobody bet on the honest one"));
  }

  return { outcome: right ? "judge_right" : "judge_wrong", deltas, preLines, lines, penalties };
}
