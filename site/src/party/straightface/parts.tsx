/**
 * The pieces of 一本正经 · In All Seriousness. Every piece takes a view object (PrivateView / PublicView or
 * a slice of one), never the GameState: the one-phone screen and the online screens render the
 * same parts from what the engine's two view functions allow them to see.
 */
import { Check, Tag } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TimerArc } from "../../components/TimerArc";
import type { T } from "../../i18n";
import { haptic, sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import type { Level, PrivateView, RoundResult } from "../../shared/straightface/types";
import { NameFace } from "../common";
import { PACK_AUDIENCE, PACK_NAMES, PACKS, type Audience, type Pack } from "../../data/straightface";
import { PACK_ART, ROLE_ART } from "./art";
import { S } from "./text";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** A bilingual line in the reader's language, with `{vars}` filled in. */
export function useSay() {
  const { lang } = useStore();
  return (t: T, vars?: Record<string, string | number>) => fill(lang === "zh" ? t.zh : t.en, vars ?? {});
}

/** The reader's language first and big, the other underneath (titles on cards). */
export function Bi({ t, className = "" }: { t: T; className?: string }) {
  const { lang } = useStore();
  // a Chinese original (锅包肉 / 锅包肉 guō bāo ròu): the characters, with the reading under them, in both languages
  const original = t.zh.trim() !== "" && t.en.startsWith(t.zh);
  const main = original ? t.zh : lang === "zh" ? t.zh : t.en;
  const other = original ? t.en.slice(t.zh.length).trim() || main : lang === "zh" ? t.en : t.zh;
  return (
    <span className={`sf-bi ${className}`}>
      {/* an English word marked as English, so a Chinese page still hyphenates it properly */}
      <span className="sf-bi-main" lang={/^[\x20-\x7e]+$/.test(main) ? "en" : undefined}>
        {main}
      </span>
      {other !== main && <span className="sf-bi-other">{other}</span>}
    </span>
  );
}

export function LevelDots({ level }: { level: Level }) {
  return (
    <span className="sf-dots" aria-label={`${level}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? "is-on" : ""} />
      ))}
    </span>
  );
}

const isPack = (p: string | null | undefined): p is Pack => !!p && (PACKS as readonly string[]).includes(p);

/** The word of the round, as big as the screen allows: the whole table reads it, under its pack's picture. */
export function TermCard({ term, level, lead, big = false, pack, children }: { term: T; level: Level | null; lead?: string; big?: boolean; pack?: string | null; children?: ReactNode }) {
  const { lang } = useStore();
  // a long word (Hippopotomonstrosesquipedaliophobia) gets smaller type instead of breaking mid-word
  const shown = term.zh.trim() !== "" && term.en.startsWith(term.zh) ? term.zh : lang === "zh" ? term.zh : term.en;
  const longest = Math.max(...shown.split(/\s+/).map((w) => [...w].length));
  const fit = longest >= 14 ? "is-xlong" : longest >= 10 ? "is-long" : "";
  return (
    <div className={`sf-term panel ${big ? "is-big" : ""} ${fit}`}>
      {isPack(pack) && (
        <span className="sf-term-pack">
          <img src={PACK_ART[pack]} alt="" width={28} height={28} />
          <span>{lang === "zh" ? PACK_NAMES[pack].zh : PACK_NAMES[pack].en}</span>
        </span>
      )}
      {lead && <p className="sf-term-lead">{lead}</p>}
      <Bi t={term} className="sf-term-word" />
      {level && <LevelDots level={level} />}
      {children}
    </div>
  );
}

/**
 * Hold to see your part (the honest one reads the definition, a bluffer the seeds). The card shows
 * only while the finger is down and goes dark the moment it lifts; a fixed clock starts at the
 * first press and runs whether or not the finger stays, so how long someone needs to read leaks
 * nothing. When the clock runs out the screen says who gets the phone next: never earlier.
 */
export function HoldToPeek({ name, view, seconds, onDone }: { name: string; view: PrivateView; seconds: number; onDone: () => void }) {
  const say = useSay();
  const { lang } = useStore();
  const [holding, setHolding] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const l = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0 && !done.current) {
        done.current = true;
        setHolding(false);
        sfx.pop();
        onDoneRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const down = () => {
    if (done.current) return;
    if (endsAt === null) {
      setEndsAt(Date.now() + seconds * 1000);
      sfx.flip();
    }
    haptic(6);
    setHolding(true);
  };
  const up = () => setHolding(false);

  const honest = view.role === "honest";
  return (
    <div className="sf-peek">
      <p className="sf-peek-name">{name}</p>
      <p className="hint sf-peek-hint">{say(S.holdHint, { n: seconds })}</p>
      <button
        type="button"
        className={`sf-hold ${holding ? "is-open" : ""}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            down();
          }
        }}
        onKeyUp={up}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={holding}
        aria-label={say(S.holdToSee)}
      >
        {holding ? (
          <div className="sf-part" lang={lang === "zh" ? "zh-CN" : "en"}>
            <p className={`sf-part-role ${honest ? "is-honest" : "is-bluffer"}`}>{say(honest ? S.youAreHonest : S.youAreBluffer)}</p>
            {view.term && <p className="sf-part-term">{lang === "zh" ? view.term.zh : view.term.en}</p>}
            {honest && view.definition && <p className="sf-part-def">{lang === "zh" ? view.definition.zh : view.definition.en}</p>}
            <p className="sf-part-hint">{say(honest ? S.honestHint : S.blufferHint)}</p>
            {!honest && view.bluffSeeds && view.bluffSeeds.length > 0 && (
              <div className="sf-seeds">
                <span>{say(S.seedsLead)}</span>
                <ul>
                  {view.bluffSeeds.map((s, i) => (
                    <li key={i}>{lang === "zh" ? s.zh : s.en}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <span className="sf-hold-label">
            <span>{say(S.holdToSee)}</span>
            {endsAt !== null && <small className="tabular">{say(S.secondsLeft, { n: left })}</small>}
          </span>
        )}
      </button>
      {endsAt !== null && (
        <div className="sf-peek-track" aria-hidden="true">
          <i style={{ width: `${(left / seconds) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** Who is explaining, with their soft clock: when it runs out the ring flashes and nothing moves on. */
export function SpeakerRing({ name, seconds, resetKey, index, total }: { name: string; seconds: number; resetKey: string | number; index: number; total: number }) {
  const say = useSay();
  const [over, setOver] = useState(false);
  useEffect(() => setOver(false), [resetKey]);
  return (
    <div className={`sf-speaker ${over ? "is-over" : ""}`}>
      <TimerArc seconds={seconds} running={!over} resetKey={resetKey} size={132} onEnd={() => setOver(true)} />
      <div className="sf-speaker-who">
        <span className="hint">
          {say(S.nowSpeaking)} · <span className="tabular">{index + 1}</span>/<span className="tabular">{total}</span>
        </span>
        <strong>{name}</strong>
      </div>
    </div>
  );
}

/** A row of people to pick one from (a bet, the accusation, the tag). */
export function PickOne({
  people,
  onPick,
  disabled = [],
  marks = {},
  size = 58,
}: {
  people: { id: string; name: string }[];
  onPick: (id: string) => void;
  disabled?: string[];
  /** a small word under a name ("tagged") */
  marks?: Record<string, string>;
  size?: number;
}) {
  return (
    <div className="ballot">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          className="nominee"
          disabled={disabled.includes(p.id)}
          onClick={() => {
            sfx.tap();
            haptic(8);
            onPick(p.id);
          }}
        >
          <span className="nominee-face">
            <NameFace name={p.name} size={size} />
            {marks[p.id] && (
              <span className="sf-mark" aria-hidden="true">
                <Tag size={12} strokeWidth={2.6} />
              </span>
            )}
          </span>
          <span className="nominee-name">{p.name}</span>
          {marks[p.id] && <small className="sf-mark-word">{marks[p.id]}</small>}
        </button>
      ))}
    </div>
  );
}

/** The faces in speaking order; the one up now is lit, the ones done are ticked. */
export function OrderStrip({ order, names, current }: { order: string[]; names: Record<string, string>; current: number }) {
  return (
    <ol className="sf-order">
      {order.map((id, i) => (
        <li key={id} className={i === current ? "is-now" : i < current ? "is-done" : ""}>
          <span className="sf-order-face">
            <NameFace name={names[id] ?? "?"} size={36} />
            {i < current && (
              <span className="sf-order-check" aria-hidden="true">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="sf-order-name">{names[id]}</span>
        </li>
      ))}
    </ol>
  );
}

export type RevealItem = { key: string; node: ReactNode };

/**
 * The reveal, one line at a time: the real meaning, the fun fact, who did what (nothing that gives
 * the honest one away), then the honest one, then the points. A tap shows the rest at once.
 */
export function RevealSequence({ items, stepMs = 900, onAllShown, onStep }: { items: RevealItem[]; stepMs?: number; onAllShown: () => void; onStep?: (key: string) => void }) {
  const say = useSay();
  const [shown, setShown] = useState(1);
  const all = shown >= items.length;
  const onAll = useRef(onAllShown);
  onAll.current = onAllShown;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const heard = useRef(new Set<string>());
  useEffect(() => {
    // each line makes its sound once, also when a tap shows the rest at once
    for (const it of items.slice(0, shown)) {
      if (heard.current.has(it.key)) continue;
      heard.current.add(it.key);
      if (onStepRef.current) onStepRef.current(it.key);
      else if (heard.current.size > 1) sfx.tap();
    }
  }, [shown, items]);
  useEffect(() => {
    if (all) {
      onAll.current();
      return;
    }
    const id = window.setTimeout(() => setShown((n) => n + 1), stepMs);
    return () => window.clearTimeout(id);
  }, [shown, all, stepMs]);
  return (
    <div className="sf-reveal">
      {items.slice(0, shown).map((it) => (
        <div key={it.key} className="sf-reveal-item">
          {it.node}
        </div>
      ))}
      {!all && (
        <button type="button" className="link-btn sf-skip" onClick={() => setShown(items.length)}>
          {say(S.skip)}
        </button>
      )}
    </div>
  );
}

/** A result's lines as the reveal shows them. */
export function Lines({ lines, className = "" }: { lines: T[]; className?: string }) {
  const { lang } = useStore();
  return (
    <ul className={`sf-lines ${className}`}>
      {lines.map((l, i) => (
        <li key={i}>{lang === "zh" ? l.zh : l.en}</li>
      ))}
    </ul>
  );
}

/** The points this round put on each name. */
export function Deltas({ deltas, names }: { deltas: RoundResult["deltas"]; names: Record<string, string> }) {
  const rows = Object.entries(deltas).filter(([, d]) => d !== 0);
  if (!rows.length) return null;
  return (
    <div className="sf-deltas">
      {rows.map(([id, d]) => (
        <span key={id} className={`sf-delta ${d > 0 ? "is-up" : "is-down"}`}>
          {names[id]} <b className="tabular">{d > 0 ? `+${d}` : d}</b>
        </span>
      ))}
    </div>
  );
}

/** One of the three parts, drawn: only on screens the whole table may see. */
export function RoleArt({ role, size = 88, className = "" }: { role: keyof typeof ROLE_ART; size?: number; className?: string }) {
  return <img className={`sf-role-art ${className}`} src={ROLE_ART[role]} alt="" width={size} height={size} />;
}

/** Who is who, before the first round: the judge, the honest one, the bluffers. */
export function RoleCast() {
  const say = useSay();
  const cast = [
    { role: "judge", name: S.judge, line: S.roleJudgeLine },
    { role: "honest", name: S.honest, line: S.roleHonestLine },
    { role: "bluffer", name: S.bluffer, line: S.roleBlufferLine },
  ] as const;
  return (
    <ul className="sf-cast">
      {cast.map((c) => (
        <li key={c.role}>
          <RoleArt role={c.role} />
          <strong>{say(c.name)}</strong>
          <span>{say(c.line)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The packs, as pictures, in three groups: the table's own language first, then the ones any table can
 * play, then the other language. A group's header picks all of it or none; at least one pack stays on.
 */
export function PackPicker({ picked, onChange }: { picked: Pack[]; onChange: (next: Pack[]) => void }) {
  const say = useSay();
  const { lang } = useStore();
  const order: Audience[] = lang === "zh" ? ["zh", "both", "en"] : ["en", "both", "zh"];
  const label: Record<Audience, T> = { zh: S.packsZh, en: S.packsEn, both: S.packsBoth };
  const toggle = (p: Pack) => {
    const on = picked.includes(p);
    if (on && picked.length === 1) return;
    sfx.tap();
    onChange(on ? picked.filter((x) => x !== p) : [...picked, p]);
  };
  const toggleGroup = (group: Pack[]) => {
    const allOn = group.every((p) => picked.includes(p));
    const next = allOn ? picked.filter((p) => !group.includes(p)) : [...new Set([...picked, ...group])];
    if (!next.length) return;
    sfx.tap();
    onChange(next);
  };
  return (
    <div className="sf-pack-groups">
      {order.map((a) => {
        const group = PACKS.filter((p) => PACK_AUDIENCE[p] === a);
        const allOn = group.every((p) => picked.includes(p));
        return (
          <section key={a} className="sf-pack-group">
            <div className="sf-pack-group-head">
              <span className="field-label">{say(label[a])}</span>
              <button type="button" className="link-btn" onClick={() => toggleGroup(group)}>
                {say(allOn ? S.groupNone : S.groupAll)}
              </button>
            </div>
            <div className="sf-pack-grid" role="group" aria-label={say(label[a])}>
              {group.map((p) => {
                const on = picked.includes(p);
                return (
                  <button key={p} type="button" className={`sf-pack ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggle(p)}>
                    <img src={PACK_ART[p]} alt="" width={48} height={48} loading="lazy" />
                    <span>{lang === "zh" ? PACK_NAMES[p].zh : PACK_NAMES[p].en}</span>
                    {on && (
                      <span className="sf-pack-check" aria-hidden="true">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
