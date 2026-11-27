import { BookOpen, MessageCircle, Mic, VenetianMask } from "lucide-react";
import { useEffect, useState } from "react";
import { sceneGuide } from "../../data/dramaGuide";
import { INNOCENT, roleScript, type RoleScript, SCRIPTS } from "../../data/dramaScripts";
import type { T } from "../../i18n";
import type { DramaView } from "../../shared/protocol";
import { useStore } from "../../store";

/*
 * 新手台词本 (Steve on Nov 26: "看完之后根本不知道怎么去演"): on a 新手 table, a scene with a script
 * hands every actor their lines, the way a 剧本杀 character book or a murder-mystery party kit does:
 * one thing to keep doing, and for each of the four steps a line to say and one to throw at someone.
 * Under the card while the cards are read (`ScriptBook`), and during the scene a prompter that
 * follows the clock (`Prompter`; on one phone passed round, `TablePrompter` for the whole cast).
 */

/** Which of a scene's steps the clock is on: the twist (halfway) opens the third of four. */
export function stepAt(f: number, n: number, twist: boolean): number {
  const x = Math.min(1, Math.max(0, f));
  if (twist && n === 4) return x < 0.2 ? 0 : x < 0.5 ? 1 : x < 0.85 ? 2 : 3;
  return Math.min(n - 1, Math.floor(x * n));
}

/** The script this phone shows: a 新手 table, a scene with one, and the role's own lines. */
export function scriptFor(v: Pick<DramaView, "diff" | "mode" | "scene">, role: T | null | undefined): RoleScript | undefined {
  if (v.diff !== "starter" || v.mode !== "show") return undefined;
  return roleScript(v.scene?.id, role);
}

/**
 * The two more things for steps 2 and 3: the culprit's (in a monologue, the actor's, who has the
 * real secret), or everyone else's, in the same box.
 */
const extrasFor = (sceneId: string | undefined, culprit: boolean): T[] => (culprit && sceneId ? (SCRIPTS[sceneId]?.culprit ?? []) : INNOCENT);

const q = (x: T, zh: boolean) => (zh ? `「${x.zh}」` : `“${x.en}”`);

/** An actor's lines, step by step, under their card while the cards are read. */
export function ScriptBook({ sceneId, script, culprit, solo }: { sceneId: string; script: RoleScript; culprit: boolean; solo: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const tx = (x: T) => (zh ? x.zh : x.en);
  const beats = sceneGuide(sceneId)?.beats ?? [];
  const extras = extrasFor(sceneId, culprit || solo);
  return (
    <section className="dm-book" aria-label={zh ? "你的台词本" : "Your script"}>
      <p className="dm-book-head">
        <BookOpen size={18} strokeWidth={2.4} aria-hidden="true" />
        <strong>{zh ? "你的台词本" : "Your script"}</strong>
        <span>{zh ? "照着念就行，演的时候手机会一步一步提示你" : "Just read it out. Your phone prompts you step by step during the scene"}</span>
      </p>
      <ol className="dm-book-steps">
        {script.steps.map((st, i) => (
          <li key={i}>
            <p className="dm-book-beat">
              <span className="dm-book-n">{zh ? `第 ${i + 1} 步` : `Step ${i + 1}`}</span>
              {beats[i] && tx(beats[i])}
            </p>
            <p className="dm-book-say">
              <Mic size={15} aria-hidden="true" />
              <span>
                <strong>{zh ? "你说" : "Say"}</strong>
                {q(st.say, zh)}
              </span>
            </p>
            <p className="dm-book-ask">
              <MessageCircle size={15} aria-hidden="true" />
              <span>
                <strong>{zh ? "再问" : "Then ask"}</strong>
                {q(st.ask, zh)}
              </span>
            </p>
          </li>
        ))}
      </ol>
      {extras.length > 0 && (
        <div className="dm-book-extra">
          <p className="dm-book-extra-head">
            <VenetianMask size={16} aria-hidden="true" />
            {solo ? (zh ? "你的秘密，这样露一点点" : "Let your secret slip, just a little") : culprit ? (zh ? "你是坏人，另外做两件事" : "You're the culprit: two more things") : zh ? "你是好人，另外做两件事" : "You're innocent: two more things"}
          </p>
          <ul>
            {extras.map((x, i) => (
              <li key={i}>
                <strong>{zh ? `第 ${i + 2} 步` : `Step ${i + 2}`}</strong>
                {tx(x)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The step the clock is on, redrawn twice a second; a tapped step shows until the clock moves on. */
function useStep(v: Pick<DramaView, "endsAt" | "actMs">, n: number, now: () => number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const auto = stepAt((now() - (v.endsAt - v.actMs)) / Math.max(1, v.actMs), n, true);
  const [picked, setPicked] = useState<{ step: number; during: number } | null>(null);
  const step = picked && picked.during === auto ? picked.step : auto;
  return { step, auto, pick: (i: number) => setPicked({ step: i, during: auto }) };
}

/** Step buttons: which step is showing, and the one the clock is on. */
function StepTabs({ n, step, auto, onPick }: { n: number; step: number; auto: number; onPick: (i: number) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dm-prompt-tabs" role="tablist" aria-label={zh ? "第几步" : "Steps"}>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === step} className={`${i === step ? "is-on" : ""} ${i === auto ? "is-now" : ""}`} onClick={() => onPick(i)}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

/** During the scene, on an actor's own phone: this step's lines, big, following the clock. */
export function Prompter({ v, script, culprit, solo, now }: { v: DramaView; script: RoleScript; culprit: boolean; solo: boolean; now: () => number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const tx = (x: T) => (zh ? x.zh : x.en);
  const sceneId = v.scene?.id ?? "";
  const beats = sceneGuide(sceneId)?.beats ?? [];
  const n = script.steps.length;
  const { step, auto, pick } = useStep(v, n, now);
  const st = script.steps[step];
  const extra = extrasFor(sceneId, culprit || solo)[step - 1];
  return (
    <section className="dm-prompt" aria-live="polite">
      <div className="dm-prompt-top">
        <span className="dm-prompt-title">{zh ? `提词器 · 第 ${step + 1} 步` : `Prompter · step ${step + 1}`}</span>
        <StepTabs n={n} step={step} auto={auto} onPick={pick} />
      </div>
      {beats[step] && <p className="dm-prompt-beat">{tx(beats[step])}</p>}
      <p className="dm-prompt-say">
        <span>{zh ? "你说" : "Say"}</span>
        {q(st.say, zh)}
      </p>
      <p className="dm-prompt-ask">
        <span>{zh ? "再问" : "Then ask"}</span>
        {q(st.ask, zh)}
      </p>
      {extra && (
        <p className="dm-prompt-extra">
          <VenetianMask size={15} aria-hidden="true" />
          <span>{tx(extra)}</span>
        </p>
      )}
      <p className="dm-prompt-trait">{tx(script.trait)}</p>
    </section>
  );
}

/**
 * One phone on the table: what each actor says this step (never the culprit's extras), so anyone
 * stuck can glance down.
 */
export function TablePrompter({ v, now }: { v: DramaView; now: () => number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const tx = (x: T) => (zh ? x.zh : x.en);
  const lines = v.cast.map((c) => ({ c, sc: scriptFor(v, c.role) })).filter((x) => !!x.sc);
  const n = lines[0]?.sc?.steps.length ?? 4;
  const { step, auto, pick } = useStep(v, n, now);
  if (!lines.length) return null;
  const beats = sceneGuide(v.scene?.id)?.beats ?? [];
  return (
    <section className="dm-prompt dm-prompt-table" aria-live="polite">
      <div className="dm-prompt-top">
        <span className="dm-prompt-title">{zh ? `台词提示 · 第 ${step + 1} 步` : `Lines · step ${step + 1}`}</span>
        <StepTabs n={n} step={step} auto={auto} onPick={pick} />
      </div>
      {beats[step] && <p className="dm-prompt-beat">{tx(beats[step])}</p>}
      <ul className="dm-prompt-cast">
        {lines.map(({ c, sc }) => (
          <li key={c.pid}>
            <strong>{tx(c.role)}</strong>
            <span>{q(sc!.steps[step].say, zh)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
