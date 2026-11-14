// The words to paste into the group chat (src/engine/copy.ts writes them): an invitation, a nudge
// for whoever is still to answer, the result. Pick a tone, read what will be pasted, take another
// line if this one doesn't suit, then copy it in Chinese or in English. The tone stays as picked
// on this phone, for every gathering.
import { useState } from "preact/hooks";
import type { Lang, Tone } from "../../engine";
import { t } from "../i18n";
import { CopyButton, useLang } from "./common";

const TONES: readonly Tone[] = ["plain", "easy", "funny"];
const TONE_KEY = "when.tone";
const TONE_WORD = { plain: "tonePlain", easy: "toneEasy", funny: "toneFunny" } as const;

function savedTone(): Tone {
  try {
    const tone = localStorage.getItem(TONE_KEY);
    return TONES.includes(tone as Tone) ? (tone as Tone) : "plain";
  } catch {
    return "plain";
  }
}

/** `write` gives the words for a tone, a language and a variant (0, 1, 2, …; copy.ts wraps around). */
export function Words({ write }: { write: (tone: Tone, lang: Lang, pick: number) => string }) {
  const lang = useLang();
  const [tone, setTone] = useState<Tone>(savedTone);
  const [pick, setPick] = useState(0);
  const other: Lang = lang === "zh" ? "en" : "zh";
  const choose = (next: Tone) => {
    setTone(next);
    setPick(0);
    try {
      localStorage.setItem(TONE_KEY, next);
    } catch {
      // a phone that keeps nothing still gets the tone for now
    }
  };
  return (
    <div class="words">
      <div class="seg seg-3" role="group" aria-label={t("toneLabel")}>
        {TONES.map((x) => (
          <button key={x} type="button" aria-pressed={tone === x} onClick={() => choose(x)}>
            {t(TONE_WORD[x])}
          </button>
        ))}
      </div>
      <p class="words-text" aria-live="polite">
        {write(tone, lang, pick)}
      </p>
      <button type="button" class="link-btn" onClick={() => setPick(pick + 1)}>
        {t("wordsAnother")}
      </button>
      <div class="row">
        <CopyButton text={write(tone, lang, pick)} label={t(lang === "zh" ? "copyZh" : "copyEn")} kind="primary" />
        <CopyButton text={write(tone, other, pick)} label={t(other === "zh" ? "copyZh" : "copyEn")} />
      </div>
    </div>
  );
}
