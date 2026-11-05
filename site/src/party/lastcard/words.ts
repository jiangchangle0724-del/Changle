import type { T } from "../../i18n";
import { cardName, COLOR_NAME, faceOf } from "../../shared/lastcard/cards";
import { LC_CALL } from "../../shared/lastcard/name";
import type { LcLog } from "../../shared/protocol";

/**
 * What 最后一张 says, in both languages: the running commentary of the table (the phones' ticker,
 * the big screen's list) and the big word a moment flashes. Nothing here says drink: penalties are
 * the stamp's to name.
 */

const t = (zh: string, en: string): T => ({ zh, en });

/** A person in a line: their name, or "you" on their own phone. */
export type Who = (pid: string) => { name: string; you: boolean };

/** One thing that happened, as a sentence. */
export function logLine(e: LcLog, who: Who): T {
  const p = "p" in e ? who(e.p) : { name: "", you: false };
  // (English verbs follow "you": you draw, Amy draws)
  const s = (you: string, them: string) => (p.you ? you : them);
  const zhName = p.you ? "你" : p.name;
  const enName = p.you ? "You" : p.name;
  switch (e.k) {
    case "deal":
      return t(`第 ${e.n} 轮，每人 7 张`, `Round ${e.n}: seven cards each`);
    case "play": {
      const c = cardName(e.c);
      if (e.col) {
        const col = COLOR_NAME[e.col];
        return t(`${zhName} 出了 ${c.zh}，变成${col.zh}色`, `${enName} ${s("play", "plays")} ${c.en}: now ${col.en}`);
      }
      return t(`${zhName} 出了 ${c.zh}`, `${enName} ${s("play", "plays")} ${c.en}`);
    }
    case "draw":
      return t(`${zhName} 摸了一张`, `${enName} ${s("draw", "draws")} a card`);
    case "keep":
      return t(`${zhName} 留着摸到的那张`, `${enName} ${s("keep", "keeps")} it`);
    case "pass":
      return t(`没牌可摸了，${zhName} 过`, `Nothing left to draw: ${enName} ${s("pass", "passes")}`);
    case "take":
      return t(`${zhName} 吃下 +${e.n}，摸 ${e.n} 张`, `${enName} ${s("take", "takes")} +${e.n}: ${e.n} cards`);
    case "skip":
      return t(`${zhName} 停一轮`, `${enName} ${s("are", "is")} skipped`);
    case "rev":
      return t("方向反过来了", "Play reverses");
    case "call":
      return t(`${zhName} 喊：${LC_CALL.zh}`, `${enName} ${s("call", "calls")}: ${LC_CALL.en}`);
    case "catch": {
      const by = who(e.by);
      return t(`${by.you ? "你" : by.name} 抓到 ${zhName} 没喊，摸 2 张`, `${by.you ? "You" : by.name} caught ${p.you ? "you" : p.name}: 2 cards`);
    }
    case "auto":
      return t(`${zhName} 没动，替 TA 摸了一张`, `${enName} ${s("were", "was")} away: one card drawn`);
    case "win":
      return t(`${zhName} 出完了，赢下这一轮`, `${enName} ${s("are", "is")} out and ${s("win", "wins")} the round`);
    case "shuffle":
      return t("摸牌堆空了，弃牌重新洗", "Draw pile empty: the discards are reshuffled");
  }
}

/** The big word a moment flashes over the table, or null for a quiet one. */
export function momentWord(e: LcLog): { word: T; tone: "gel" | "warn" | "stop" } | null {
  switch (e.k) {
    case "play": {
      // (a skip's word comes with the "skip" entry logged right after it; an unstacked +2 or +4 with its "take")
      const k = faceOf(e.c).k;
      if (k === "wild") return { word: t("变色！", "Wild!"), tone: "gel" };
      if (k === "d2" || k === "d4") return { word: t(k === "d2" ? "+2" : "+4", k === "d2" ? "+2" : "+4"), tone: "warn" };
      return null;
    }
    case "skip":
      return { word: t("跳过！", "Skip!"), tone: "gel" };
    case "rev":
      return { word: t("反转！", "Reverse!"), tone: "gel" };
    case "take":
      return { word: t(`+${e.n}`, `+${e.n}`), tone: "warn" };
    case "call":
      return { word: LC_CALL, tone: "gel" };
    case "catch":
      return { word: t("抓到了！", "Caught!"), tone: "stop" };
    default:
      return null;
  }
}

/** The rules, short. `stack`: as the host set it, or null before there is a table. `custom`: the table plays for its own penalty, not drinks. */
export function rulesOf(stack: boolean | null, custom: boolean): { zh: string[]; en: string[] } {
  const zh = [
    "每人 7 张。轮到你时，出一张和桌上那张同色、同数字或同符号的牌；变色和 +4 随时能出。",
    "出不了（或不想出）就摸一张，摸到能出的可以马上出。",
    "跳过：下一个人停一轮。反转：方向倒过来，两个人时等于跳过。+2：下一个人摸 2 张、停一轮。变色：你选下一个颜色。+4：你选颜色，下一个人摸 4 张、停一轮。",
    stack === null
      ? "叠加：主人发牌前可以打开，+2 接 +2，+4 接 +4，接不上的人把加起来的全摸了。"
      : stack
        ? "叠加开着：+2 可以接 +2，+4 可以接 +4，接不上的人把加起来的全摸了。"
        : "叠加关着：被 +2、+4 的人直接摸牌，不能接。",
    `剩两张、轮到你时就可以先按「${LC_CALL.zh}」，出完以后、下一个人动之前也来得及。没喊被别人先抓到，摸 2 张。`,
    "先出完的赢这一轮。手机不在的人轮到时，15 秒后自动摸一张；主人也可以替一直不动的人摸。",
    custom
      ? "惩罚：吃 +2 受罚一次，吃 +4（或叠到 4 张以上）两次，被抓到没喊一次，每轮结束时手里牌最多的一次。"
      : "惩罚：吃 +2 喝一口，吃 +4（或叠到 4 张以上）喝两口，被抓到没喊喝一口，每轮结束时手里牌最多的喝一口。",
  ];
  const en = [
    "Seven cards each. On your turn, play a card that matches the one on the pile by colour, number or symbol; a wild or a +4 goes on anything.",
    "Can't play (or don't want to)? Draw one. If it fits, you can play it straight away.",
    "Skip: the next player misses a turn. Reverse: play turns the other way; with two players it's a skip. +2: the next player draws 2 and misses a turn. Wild: you pick the next colour. +4: you pick the colour, and the next player draws 4 and misses a turn.",
    stack === null
      ? "Stacking: the host can switch it on before the deal: +2 on +2, +4 on +4, and whoever can't takes the whole stack."
      : stack
        ? "Stacking is on: answer a +2 with a +2, or a +4 with a +4; whoever can't takes the whole stack."
        : "Stacking is off: a +2 or +4 lands straight away, no answering it.",
    `Down to two cards on your turn? You can press ${LC_CALL.en} before you play, or any time before the next player moves. Get caught without calling and you draw 2.`,
    "First to empty their hand wins the round. If someone's phone is away on their turn, they draw one after 15 seconds; the host can do the same for anyone who doesn't move.",
    custom
      ? "Penalties: once for taking a +2, twice for a +4 (or a stack of 4 or more), once for being caught, and once at each round's end for whoever holds the most cards."
      : "Penalties: a sip for taking a +2, two for a +4 (or a stack of 4 or more), a sip for being caught, and at each round's end a sip for whoever holds the most cards.",
  ];
  return { zh, en };
}
