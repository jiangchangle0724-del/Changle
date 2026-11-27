import type { Limit } from "../data/truthDare";
import { LIMITS } from "../data/truthDare";
import type { Lang } from "../i18n";
import { Pill, Sheet } from "../ui";
import "./TruthDare.css";

const NAMES: Record<Limit, { zh: string; en: string }> = {
  touch: { zh: "不碰身体", en: "No touching" },
  phone: { zh: "不动手机", en: "Phone stays mine" },
  love: { zh: "不聊感情", en: "No love life" },
  mild: { zh: "只要温和", en: "Keep it mild" },
};

/** What each limit skips, in a line. */
const WHAT: Record<Limit, { zh: string; en: string }> = {
  touch: { zh: "跳过要碰到别人的大冒险", en: "skips dares that touch someone" },
  phone: { zh: "跳过要给大家看手机、用手机发消息的题", en: "skips showing your phone or sending from it" },
  love: { zh: "跳过前任、暗恋、约会这类题", en: "skips exes, crushes and dates" },
  mild: { zh: "大家玩辣的，你也只抽温和的", en: "mild cards even at a spicy table" },
};

export const limitName = (l: Limit, lang: Lang) => NAMES[l][lang];

/**
 * 每人底线: the cards a player would rather skip. On one phone the table sets them for each person
 * (and the phone keeps them for next time); online each phone sets its own, and nobody else sees.
 */
export function TruthLimits({
  open,
  onClose,
  lang,
  people,
  limits,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  /** one phone: everyone at the table; online: just this phone's player (no name shown) */
  people: { id: string; name?: string }[];
  limits: Record<string, Limit[]>;
  onChange: (id: string, list: Limit[]) => void;
}) {
  const zh = lang === "zh";
  const mine = people.length === 1 && !people[0].name;
  return (
    <Sheet open={open} onClose={onClose} lang={lang} title={mine ? (zh ? "我的底线" : "My limits") : zh ? "每人底线" : "Everyone's limits"}>
      <div className="limits-form">
        <p className="own-lead">
          {mine
            ? zh
              ? "只有你自己看得到。抽到你的时候，会跳过你关掉的题。"
              : "Only you can see these. When it's your turn, the cards you switch off are skipped."
            : zh
              ? "谁有不想碰的题，在这里替 TA 选上。抽到 TA 的时候会跳过，下次打开还在。"
              : "Pick what each person would rather skip. Their cards will steer clear, and the phone remembers next time."}
        </p>
        <ul className="limits-what">
          {LIMITS.map((l) => (
            <li key={l}>
              <strong>{NAMES[l][lang]}</strong>
              {zh ? "：" : ": "}
              {WHAT[l][lang]}
            </li>
          ))}
        </ul>
        {people.map((p) => {
          const on = limits[p.id] ?? [];
          return (
            <div key={p.id} className="limits-row" role="group" aria-label={p.name ?? (zh ? "我的底线" : "My limits")}>
              {p.name && <span className="limits-name">{p.name}</span>}
              <div className="limits-pills">
                {LIMITS.map((l) => (
                  <Pill
                    key={l}
                    kind="toggle"
                    tone={l === "mild" ? "accent" : "warning"}
                    selected={on.includes(l)}
                    onToggle={(sel) => onChange(p.id, sel ? [...on.filter((x) => x !== l), l] : on.filter((x) => x !== l))}
                  >
                    {NAMES[l][lang]}
                  </Pill>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------- what one phone keeps between games ---------- */

const KEY = "changle.truth.limits.v1";

/** One phone: each player's limits, by player id. Online: this phone's own, under "me". */
export function readLimits(): Record<string, Limit[]> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, Limit[]> = {};
    for (const [id, list] of Object.entries(all ?? {})) if (Array.isArray(list)) out[id] = LIMITS.filter((l) => list.includes(l));
    return out;
  } catch {
    return {};
  }
}

export function writeLimits(all: Record<string, Limit[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(all).filter(([, l]) => l.length))));
  } catch {
    /* private mode: the limits last for this game */
  }
}
