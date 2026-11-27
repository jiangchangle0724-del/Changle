import { Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { Button, Pill, Sheet, Tabs } from "../ui";
import { OWN_MAX, OWN_TEXT, type OwnCard } from "./truthRules";
import "./TruthDare.css";

type Kind = "truth" | "dare";

/**
 * 自己出题: the table writes its own truths and dares, dealt before the built-in ones. On one phone
 * they are listed and kept on the phone; online each phone drops its own into the pile, unseen and
 * unsigned, like slips of paper in a hat, and nobody is dealt one they wrote.
 */
export function TruthOwn({
  open,
  onClose,
  lang,
  onAdd,
  list,
  onRemove,
  counts,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  onAdd: (kind: Kind, text: string) => void;
  /** one phone: the cards themselves */
  list?: OwnCard[];
  onRemove?: (id: string) => void;
  /** online: how many are waiting, and how many of them this phone wrote */
  counts?: { truth: number; dare: number; mine: number };
  /** online, the host: empty the pile */
  onClear?: () => void;
}) {
  const zh = lang === "zh";
  const [kind, setKind] = useState<Kind>("truth");
  const [text, setText] = useState("");
  const [added, setAdded] = useState(0);
  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(0), 1800);
    return () => window.clearTimeout(id);
  }, [added]);

  const total = list ? list.length : counts ? counts.truth + counts.dare : 0;
  const full = total >= OWN_MAX;
  const words = text.replace(/\s+/g, " ").trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!words || full) return;
    onAdd(kind, words);
    setText("");
    setAdded(Date.now());
  };
  const label = (k: Kind) => (k === "truth" ? (zh ? "真心话" : "Truth") : zh ? "大冒险" : "Dare");

  return (
    <Sheet open={open} onClose={onClose} lang={lang} title={zh ? "自己出题" : "Write your own"}>
      <form className="own-form" onSubmit={submit}>
        <p className="own-lead">
          {list
            ? zh
              ? "你们自己出的题先抽，抽完再抽题库里的。题存在这台手机上，下次打开还在。"
              : "Your own cards come up before the built-in ones, and stay on this phone for next time."
            : zh
              ? "每个人都能往牌堆里放题，谁也看不到是谁出的。大家出的先抽，不会抽到自己出的那张。"
              : "Anyone can add cards and nobody sees who wrote them. They come up first, and never to whoever wrote them."}
        </p>
        <Tabs
          variant="segmented"
          label={zh ? "出哪种题" : "Kind of card"}
          value={kind}
          onChange={setKind}
          items={[
            { key: "truth", label: label("truth") },
            { key: "dare", label: label("dare") },
          ]}
        />
        <label className="field">
          <input
            value={text}
            maxLength={OWN_TEXT}
            enterKeyHint="done"
            autoComplete="off"
            aria-label={label(kind)}
            placeholder={
              kind === "truth"
                ? zh
                  ? "一个你一直想问大家的问题"
                  : "A question you've always wanted to ask"
                : zh
                  ? "一件你想看别人做的事"
                  : "Something you'd love to see someone do"
            }
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Button type="submit" tone="primary" block icon={Plus} disabled={!words || full}>
          {added ? (zh ? "放进去了，再来一张" : "In the pile. Another?") : zh ? "放进牌堆" : "Add to the pile"}
        </Button>
        {full && <p className="own-lead">{zh ? `最多 ${OWN_MAX} 张，先抽掉一些再加。` : `The pile is full (${OWN_MAX}). Play some first.`}</p>}

        {counts && (
          <p className="own-count" aria-live="polite">
            {zh
              ? `牌堆里有大家出的 ${counts.truth} 张真心话、${counts.dare} 张大冒险${counts.mine ? `，其中 ${counts.mine} 张是你出的` : ""}。`
              : `In the pile: ${counts.truth} ${counts.truth === 1 ? "truth" : "truths"} and ${counts.dare} ${counts.dare === 1 ? "dare" : "dares"} from the table${counts.mine ? `, ${counts.mine} of them yours` : ""}.`}
          </p>
        )}
        {onClear && total > 0 && (
          <Button tone="quiet" block onClick={onClear}>
            {zh ? "清空大家出的题" : "Clear the table's cards"}
          </Button>
        )}

        {list && (
          <ul className="own-list">
            {list.length === 0 && <li className="own-empty">{zh ? "还没有自己出的题。" : "No cards of your own yet."}</li>}
            {list.map((c) => (
              <li key={c.id} className="own-row">
                <Pill tone={c.k === "truth" ? "accent" : "danger"}>{label(c.k)}</Pill>
                <span className="own-text">{c.text}</span>
                <Button tone="icon" icon={X} label={zh ? `删掉：${c.text}` : `Remove: ${c.text}`} onClick={() => onRemove?.(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </form>
    </Sheet>
  );
}
