import type { Lang } from "../i18n";
import type { TruthTally } from "../shared/protocol";
import "./TruthDare.css";

type Award = { key: string; zh: string; en: string; of: (id: string) => number };

/**
 * 这局小结 for truth or dare: who the bottle picked most, who answered the most truths, did the most
 * dares, was named most in whispers (and, online, took the most penalties; on one phone the shell's
 * own tally above already says that). Only what happened shows; ties name everyone tied.
 */
export function TruthRecap({
  lang,
  people,
  picked,
  tally,
  penalties = false,
}: {
  lang: Lang;
  people: { id: string; name: string }[];
  picked: Record<string, number>;
  tally: Record<string, TruthTally>;
  /** online: the penalties too */
  penalties?: boolean;
}) {
  const zh = lang === "zh";
  const t = (id: string) => tally[id] ?? {};
  const awards: Award[] = [
    { key: "picked", zh: "被瓶子指到最多", en: "Picked by the bottle the most", of: (id) => picked[id] ?? 0 },
    { key: "t", zh: "真心话答得最多", en: "Most truths answered", of: (id) => t(id).t ?? 0 },
    { key: "d", zh: "大冒险做得最多", en: "Most dares done", of: (id) => t(id).d ?? 0 },
    { key: "n", zh: "悄悄话里被点名最多", en: "Named the most in whispers", of: (id) => t(id).n ?? 0 },
    ...(penalties ? [{ key: "p", zh: "认罚最多", en: "Most penalties", of: (id: string) => t(id).p ?? 0 }] : []),
  ];
  const lines = awards
    .map((a) => {
      const top = Math.max(0, ...people.map((p) => a.of(p.id)));
      return { a, top, who: top > 0 ? people.filter((p) => a.of(p.id) === top).map((p) => p.name) : [] };
    })
    .filter((l) => l.top > 0);
  if (!lines.length) return <p className="own-lead">{zh ? "还没转几轮，玩一会儿再来看。" : "Not much to tell yet. Play a few rounds."}</p>;
  return (
    <ul className="truth-recap" aria-label={zh ? "这局的称号" : "This game's titles"}>
      {lines.map(({ a, top, who }) => (
        <li key={a.key}>
          <span className="truth-recap-title">{zh ? a.zh : a.en}</span>
          <span className="truth-recap-who">
            {who.join(zh ? "、" : ", ")}
            <span className="truth-recap-n tabular">{zh ? ` ${top} 次` : ` ×${top}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
