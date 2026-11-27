import { Coins, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import type { Lang } from "../i18n";
import { reduced } from "../lib/motion";
import { TRUTH_FLIP_MS } from "../shared/protocol";
import "./TruthDare.css";

/**
 * 悄悄话's coin: it spins while it's in the air, then shows how it landed. Heads (open), the table
 * hears the question; tails (hidden), it stays with the one who read it.
 */
export function WhisperCoin({ landed, lang }: { landed: "open" | "hidden" | null; lang: Lang }) {
  const zh = lang === "zh";
  const Face = landed === "open" ? Eye : landed === "hidden" ? EyeOff : Coins;
  return (
    <div className={`whisper-coin-wrap${landed ? ` is-${landed}` : ""}`} aria-live="polite">
      <motion.div
        className="whisper-coin"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: landed || reduced() ? 0 : 1080 }}
        transition={{ duration: landed ? 0 : TRUTH_FLIP_MS / 1000, ease: [0.15, 0.6, 0.25, 1] }}
        aria-hidden="true"
      >
        <Face />
      </motion.div>
      <p className="whisper-coin-says">
        {!landed
          ? zh
            ? "抛硬币，正面公开问题，反面保密……"
            : "Tossing the coin: heads, everyone hears it; tails, it stays secret…"
          : landed === "open"
            ? zh
              ? "正面：问题公开"
              : "Heads: here's the question"
            : zh
              ? "反面：问题保密"
              : "Tails: it stays secret"}
      </p>
    </div>
  );
}

/** Whom the one picked named out loud: a tap on the name, so the phone (and the room) knows. */
export function WhisperNames({ people, onPick, lang, ask }: { people: { id: string; name: string }[]; onPick: (id: string) => void; lang: Lang; ask: string }) {
  return (
    <div className="whisper-names" role="group" aria-label={ask}>
      <p className="whisper-ask">{ask}</p>
      <div className="whisper-chips">
        {people.map((p) => (
          <button key={p.id} type="button" className="btn btn-quiet btn-sm" onClick={() => onPick(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <p className="own-lead">{lang === "zh" ? "说自己也可以。" : "Naming yourself counts too."}</p>
    </div>
  );
}
