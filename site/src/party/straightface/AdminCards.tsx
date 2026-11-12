import { Check, ClipboardCopy, RotateCcw, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { T } from "../../i18n";
import { api } from "../../lib/api";
import type { Card } from "../../shared/straightface/types";
import { useStore } from "../../store";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/Toast";
import { S } from "./text";
import "./admin-cards.css";

type Status = "new" | "fix" | "done" | "no";
type Report = { id: number; card: string; reason: string; note: string; lang: string; status: Status; at: number; decidedAt: number | null };
type Played = { card: string; rounds: number; fooled: number; at: number };
type Size = { players: number; rounds: number; fooled: number };
type Desk = { waiting: Report[]; fixing: Report[]; decided: Report[]; counts: { waiting: number; fixing: number }; cards: Played[]; sizes: Size[] };
type Bank = { cards: Map<string, Card>; packs: Record<string, T>; total: number };

/** The judge's hit rate a table of each size should land in (docs/straight-face.md). */
const TARGETS = [
  { from: 3, to: 3, lo: 55, hi: 70 },
  { from: 4, to: 4, lo: 45, hi: 60 },
  { from: 5, to: 6, lo: 40, hi: 55 },
  { from: 7, to: 9, lo: 30, hi: 45 },
];
/** Rounds a table size needs before its hit rate says anything. */
const ENOUGH = 20;
/** The card rule: out ten times or more and the judge right four times in five means too easy. */
const EASY_ROUNDS = 10;
const EASY_RIGHT = 80;
/** How many cards the numbers table shows before "all". */
const TOP = 20;

const REASONS: Record<string, T> = { wrong: S.reasonWrong, easy: S.reasonEasy, unfit: S.reasonUnfit, other: S.reasonOther };
const LEVELS: Record<number, T> = { 1: S.level1, 2: S.level2, 3: S.level3 };

const right = (p: { rounds: number; fooled: number }) => (p.rounds ? Math.round(((p.rounds - p.fooled) / p.rounds) * 100) : 0);

/** Reports grouped by card, in the order the cards were first flagged: each card is decided once. */
function byCard(list: Report[]): [string, Report[]][] {
  const m = new Map<string, Report[]>();
  for (const r of list) m.set(r.card, [...(m.get(r.card) ?? []), r]);
  return [...m];
}

/**
 * The back office's 一本正经 desk: the cards players flagged (decided once per card: to fix, or
 * nothing wrong; the card bank is code, so the ones to fix are copied as a list for a chat to change),
 * how every card plays, and the judge's hit rate by table size against its target. The server side is
 * worker/straightface.ts; the card bank loads with it, so the rest of the back office stays light.
 */
export function AdminCards() {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [desk, setDesk] = useState<Desk | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [showDecided, setShowDecided] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [d, b] = await Promise.all([
        api<Desk>("/admin/sf"),
        import("../../data/straightface").then((m) => ({ cards: new Map(m.CARDS.map((c) => [c.id, c])), packs: m.PACK_NAMES as Record<string, T>, total: m.CARDS.length })),
      ]);
      setDesk(d);
      setBank(b);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (key: string, ids: number[], status: Status) => {
    setBusy(key);
    try {
      await api("/admin/sf/reports", { body: { ids, status } });
      await load();
    } catch {
      toast(zh ? "没成功，再试一次" : "That didn't go through. Try again");
    } finally {
      setBusy("");
    }
  };

  const tx = (x: T | undefined) => (x ? (zh ? x.zh : x.en) : "");
  const day = (at: number) => new Date(at).toLocaleDateString(zh ? "zh-CN" : "en-CA", { month: "short", day: "numeric" });
  const card = (id: string) => bank?.cards.get(id);
  const term = (id: string) => tx(card(id)?.term) || id;
  const played = useMemo(() => new Map((desk?.cards ?? []).map((p) => [p.card, p])), [desk]);
  const easy = useMemo(() => (desk?.cards ?? []).filter((p) => p.rounds >= EASY_ROUNDS && right(p) >= EASY_RIGHT), [desk]);
  const rounds = useMemo(() => (desk?.sizes ?? []).reduce((n, s) => n + s.rounds, 0), [desk]);

  const numbers = (id: string) => {
    const p = played.get(id);
    return p ? (zh ? `打过 ${p.rounds} 局，裁判猜中 ${right(p)}%` : `${p.rounds} rounds, judge right ${right(p)}%`) : zh ? "还没打过" : "Not played yet";
  };
  const where = (id: string) => {
    const c = card(id);
    return c ? `${tx(bank?.packs[c.pack])} · ${tx(LEVELS[c.level])}` : zh ? "词库里没有这张了" : "No longer in the bank";
  };
  const langName = (l: string) => (l === "en" ? (zh ? "英文" : "English") : zh ? "中文" : "Chinese");

  /** The cards to fix and the cards too easy, as text to paste into the game's chat. */
  const copyList = async () => {
    const fix = byCard(desk?.fixing ?? []);
    const lines: string[] = [zh ? `一本正经 要改的卡（后台，${day(Date.now())}）：` : `In All Seriousness cards to fix (back office, ${day(Date.now())}):`];
    fix.forEach(([id, rs], i) => {
      const why = [...new Set(rs.map((r) => tx(REASONS[r.reason])))].join(zh ? "；" : "; ");
      const notes = rs.filter((r) => r.note).map((r) => (zh ? `「${r.note}」` : `"${r.note}"`));
      const said = notes.length ? (zh ? `。玩家说：${notes.join("；")}` : `. Players said: ${notes.join("; ")}`) : "";
      lines.push(`${i + 1}. ${id} ${term(id)}${zh ? "：" : ": "}${why}${rs.length > 1 ? ` ×${rs.length}` : ""}${said}`);
    });
    if (!fix.length) lines.push(zh ? "（没有玩家报的）" : "(none flagged by players)");
    if (easy.length) {
      lines.push(zh ? `太好猜（出场 ${EASY_ROUNDS} 次以上、裁判猜中 ${EASY_RIGHT}% 以上）：` : `Too easy (${EASY_ROUNDS}+ rounds, judge right ${EASY_RIGHT}%+):`);
      for (const p of easy) lines.push(`- ${p.card} ${term(p.card)}${zh ? `：${p.rounds} 局，猜中 ${right(p)}%` : `: ${p.rounds} rounds, right ${right(p)}%`}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast(zh ? "复制好了，贴给一本正经的对话就行" : "Copied. Paste it into the game's chat");
    } catch {
      toast(zh ? "没复制上，再试一次" : "Couldn't copy. Try again");
    }
  };

  /** One flagged card: the card as the reporters read it, what they said, and the decision. */
  const flagged = ([id, rs]: [string, Report[]], stage: "waiting" | "fixing") => {
    const c = card(id);
    const langs = [...new Set(rs.map((r) => (r.lang === "en" ? "en" : "zh")))];
    const key = `${stage}:${id}`;
    return (
      <article key={key} className="adm-scene sfa-card">
        <header>
          <strong>{term(id)}</strong>
          <span className="hint">
            {where(id)} · {numbers(id)}
          </span>
          {rs.length > 1 && (
            <span className="adm-scene-tags">
              <span className="seat-tag">{zh ? `${rs.length} 人说有问题` : `${rs.length} people flagged it`}</span>
            </span>
          )}
        </header>
        {c &&
          langs.map((l) => (
            <div key={l} className="sfa-text" lang={l === "en" ? "en" : "zh-CN"}>
              <p>{c.definition[l]}</p>
              <p className="hint">{c.funFact[l]}</p>
            </div>
          ))}
        <ul className="sfa-reports">
          {rs.map((r) => (
            <li key={r.id}>
              <strong>{tx(REASONS[r.reason]) || r.reason}</strong>
              <span className="hint">
                {" "}
                · {langName(r.lang)} · {day(r.at)}
              </span>
              {r.note && <q>{r.note}</q>}
            </li>
          ))}
        </ul>
        <div className="row adm-scene-actions">
          {stage === "waiting" ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy === key} onClick={() => void decide(key, rs.map((r) => r.id), "no")}>
                <X size={15} /> {zh ? "没问题" : "Nothing wrong"}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === key} onClick={() => void decide(key, rs.map((r) => r.id), "fix")}>
                <Wrench size={15} /> {zh ? "要改" : "Needs fixing"}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === key} onClick={() => void decide(key, rs.map((r) => r.id), "done")}>
              <Check size={15} /> {zh ? "改好了" : "Fixed"}
            </button>
          )}
        </div>
      </article>
    );
  };

  const verdict = (s: { rounds: number; pct: number; lo: number; hi: number }) =>
    s.rounds < ENOUGH
      ? { cls: "", text: zh ? "局数还少" : "Too few rounds" }
      : s.pct > s.hi
        ? { cls: "is-high", text: zh ? "偏高：裁判太好猜" : "High: the judge has it easy" }
        : s.pct < s.lo
          ? { cls: "is-low", text: zh ? "偏低：太难猜" : "Low: too hard to tell" }
          : { cls: "is-ok", text: zh ? "正好" : "On target" };

  const sizes = TARGETS.map((tg) => {
    const rows = (desk?.sizes ?? []).filter((s) => s.players >= tg.from && s.players <= tg.to);
    const r = rows.reduce((n, s) => n + s.rounds, 0);
    const f = rows.reduce((n, s) => n + s.fooled, 0);
    return { ...tg, rounds: r, pct: right({ rounds: r, fooled: f }) };
  });
  const cards = desk?.cards ?? [];
  const shown = showAll ? cards : cards.slice(0, TOP);
  const fixing = byCard(desk?.fixing ?? []);

  return (
    <section className="adm-scenes sfa">
      <h2 className="adm-h">
        {zh ? "一本正经 · 玩家报的卡" : "In All Seriousness · cards flagged"}
        {!!desk?.counts.waiting && <span className="adm-badge tabular">{desk.counts.waiting}</span>}
      </h2>
      {failed ? (
        <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void load() }} />
      ) : !desk || !bank ? (
        <Skeleton lang={lang} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
      ) : (
        !desk.waiting.length && <EmptyState title={zh ? "没有等你看的卡。" : "No flagged cards waiting."} />
      )}
      {desk && bank && byCard(desk.waiting).map((g) => flagged(g, "waiting"))}

      {desk && bank && (fixing.length > 0 || easy.length > 0) && (
        <>
          <h3 className="sfa-h">
            {zh ? "要改的卡" : "Cards to fix"}
            <span className="hint tabular"> {fixing.length + easy.length}</span>
          </h3>
          <p className="hint sfa-lead">
            {zh
              ? "卡片写在代码里，改要靠一本正经的对话。点「复制清单」，贴给它就行，改完上线后再点「改好了」。"
              : "The cards live in the code, so the game's chat makes the change. Copy the list and paste it there; once the fix is live, mark it fixed."}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyList()}>
            <ClipboardCopy size={15} /> {zh ? "复制清单" : "Copy the list"}
          </button>
          {fixing.map((g) => flagged(g, "fixing"))}
          {easy.length > 0 && (
            <article className="adm-scene sfa-card">
              <header>
                <strong>{zh ? "太好猜" : "Too easy"}</strong>
                <span className="hint">
                  {zh ? `出场 ${EASY_ROUNDS} 次以上、裁判猜中 ${EASY_RIGHT}% 以上：该换难度或拿掉` : `${EASY_ROUNDS}+ rounds and the judge right ${EASY_RIGHT}%+ of the time: make it harder or take it out`}
                </span>
              </header>
              <ul className="sfa-reports">
                {easy.map((p) => (
                  <li key={p.card}>
                    <strong>{term(p.card)}</strong>
                    <span className="hint">
                      {" "}
                      · {where(p.card)} · {numbers(p.card)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </>
      )}

      {!!desk?.decided.length && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDecided((s) => !s)}>
          {showDecided ? (zh ? "收起处理过的" : "Hide the decided ones") : zh ? `处理过的 ${desk.decided.length} 条` : `${desk.decided.length} decided`}
        </button>
      )}
      {showDecided && desk && bank && (
        <ul className="sfa-reports sfa-decided">
          {desk.decided.map((r) => (
            <li key={r.id}>
              <strong>{term(r.card)}</strong>
              <span className="hint">
                {" "}
                · {tx(REASONS[r.reason]) || r.reason} · {r.status === "done" ? (zh ? "改好了" : "Fixed") : zh ? "没问题" : "Nothing wrong"}
                {r.decidedAt ? ` · ${day(r.decidedAt)}` : ""}
              </span>
              {r.note && <q>{r.note}</q>}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `back:${r.id}`} onClick={() => void decide(`back:${r.id}`, [r.id], "new")}>
                <RotateCcw size={15} /> {zh ? "放回去" : "Put it back"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {desk && bank && (
        <>
          <h2 className="adm-h">{zh ? "一本正经 · 每张卡打得怎么样" : "In All Seriousness · how the cards play"}</h2>
          <p className="hint sfa-lead">
            {zh ? `一共打了 ${rounds} 局，用到 ${cards.length} 张卡（词库 ${bank.total} 张）。` : `${rounds} rounds so far, on ${cards.length} of the ${bank.total} cards.`}
          </p>
          <div className="sfa-scroll">
            <table className="sfa-table">
              <caption>{zh ? "裁判猜中率，按一桌几个人" : "How often the judge is right, by table size"}</caption>
              <thead>
                <tr>
                  <th scope="col">{zh ? "人数" : "Players"}</th>
                  <th scope="col">{zh ? "局数" : "Rounds"}</th>
                  <th scope="col">{zh ? "猜中" : "Right"}</th>
                  <th scope="col">{zh ? "目标" : "Target"}</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => {
                  const v = verdict(s);
                  return (
                    <tr key={s.from}>
                      <th scope="row">{s.from === s.to ? (zh ? `${s.from} 人` : `${s.from}`) : zh ? `${s.from} 到 ${s.to} 人` : `${s.from} to ${s.to}`}</th>
                      <td className="tabular">{s.rounds}</td>
                      <td className="tabular">{s.rounds ? `${s.pct}%` : "–"}</td>
                      <td>
                        <span className="tabular">
                          {s.lo} {zh ? "到" : "to"} {s.hi}%
                        </span>
                        <span className={`sfa-verdict ${v.cls}`}>{v.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cards.length > 0 ? (
            <div className="sfa-scroll">
              <table className="sfa-table">
                <caption>{zh ? "出场最多的卡" : "The cards played most"}</caption>
                <thead>
                  <tr>
                    <th scope="col">{zh ? "卡" : "Card"}</th>
                    <th scope="col">{zh ? "局数" : "Rounds"}</th>
                    <th scope="col">{zh ? "猜中" : "Right"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.card} className={p.rounds >= EASY_ROUNDS && right(p) >= EASY_RIGHT ? "is-easy" : ""}>
                      <th scope="row">
                        {term(p.card)}
                        <span className="hint">{where(p.card)}</span>
                      </th>
                      <td className="tabular">{p.rounds}</td>
                      <td className="tabular">{right(p)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={zh ? "还没有人打过。" : "Nobody has played yet."} />
          )}
          {cards.length > TOP && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? (zh ? `只看前 ${TOP} 张` : `Just the top ${TOP}`) : zh ? `看全部 ${cards.length} 张` : `All ${cards.length} cards`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
