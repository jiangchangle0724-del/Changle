import { useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import { cleanCode } from "./config";

/**
 * A table code being typed. While a keyboard is still composing (a Chinese keyboard spells the
 * letter first, then commits it), the field is left exactly as typed and cleaned up only when the
 * letter is committed: changing it mid-composition made iPhones type the letter again, so one Q
 * became QQQ. The field shows capitals either way (CSS).
 *
 * A Mac's pinyin keyboard turns the letters it spelled into characters when a digit or the space
 * bar picks one (Steve 2026-11-23: "AB2C" came out as "2C"): the letters it spelled count instead,
 * and `ime` says a Chinese keyboard is on, for a line telling them to switch to English.
 */
export function useCodeField(initial = "") {
  const [raw, setRaw] = useState(initial);
  const [ime, setIme] = useState(false);
  const composing = useRef(false);
  /** the code before this composition, and the letters it spelled so far */
  const before = useRef("");
  const spelled = useRef("");
  return {
    /** the code as it stands, cleaned */
    code: cleanCode(raw),
    /** a keyboard composed something here: likely a Chinese one */
    ime,
    set: (v: string) => setRaw(cleanCode(v)),
    field: {
      value: raw,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setRaw(composing.current ? e.target.value : cleanCode(e.target.value)),
      onCompositionStart: (e: CompositionEvent<HTMLInputElement>) => {
        composing.current = true;
        before.current = cleanCode(e.currentTarget.value);
        spelled.current = "";
        setIme(true);
      },
      onCompositionUpdate: (e: CompositionEvent<HTMLInputElement>) => {
        // (pinyin spells in Latin letters; once it shows characters, keep the letters it had)
        if (/[A-Za-z0-9]/.test(e.data) && !/[^\x00-\x7F]/.test(e.data)) spelled.current = e.data;
      },
      onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
        composing.current = false;
        const typed = cleanCode(spelled.current);
        setRaw(typed.length > cleanCode(e.data ?? "").length ? cleanCode(before.current + typed) : cleanCode(e.currentTarget.value));
      },
    },
  };
}
