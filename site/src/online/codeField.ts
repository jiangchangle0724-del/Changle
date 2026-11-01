import { useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import { cleanCode } from "./config";

/**
 * A table code being typed. While a keyboard is still composing (a Chinese keyboard spells the
 * letter first, then commits it), the field is left exactly as typed and cleaned up only when the
 * letter is committed: changing it mid-composition made iPhones type the letter again, so one Q
 * became QQQ. The field shows capitals either way (CSS).
 */
export function useCodeField(initial = "") {
  const [raw, setRaw] = useState(initial);
  const composing = useRef(false);
  return {
    /** the code as it stands, cleaned */
    code: cleanCode(raw),
    set: (v: string) => setRaw(cleanCode(v)),
    field: {
      value: raw,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setRaw(composing.current ? e.target.value : cleanCode(e.target.value)),
      onCompositionStart: () => {
        composing.current = true;
      },
      onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
        composing.current = false;
        setRaw(cleanCode(e.currentTarget.value));
      },
    },
  };
}
