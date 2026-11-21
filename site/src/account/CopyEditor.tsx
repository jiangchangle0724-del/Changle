import { PenLine, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { setCopy } from "../lib/copy";
import { setCopyEditOn, useCopyEditOn } from "../lib/copyEdit";
import { originalOf, pageLang } from "../lib/copyPatch";
import { COPY_MAX, type CopyMap } from "../shared/copy";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import "../styles/copyedit.css";

type Edit = { node: Text; lang: "zh" | "en"; orig: string; now: string };

/** how long a press takes to open the editor, and how far the finger may drift meanwhile */
const HOLD = 550;
const DRIFT = 10;
/** what a press never edits: fields, and the editor's own words */
const SKIP = "input,textarea,select,[contenteditable],[data-copy-off]";

/**
 * Signed in as the master account, a long press on any words opens them for editing (Steve
 * 2026-11-21), and the change is for everyone, right away (src/shared/copy.ts). Off on this phone
 * from the sheet; on again in the back office (AdminCopy). Loaded for that account alone (App.tsx).
 */
export function CopyEditor() {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [edit, setEdit] = useState<Edit | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = useRef(false);
  open.current = !!edit;
  const on = useCopyEditOn();

  useEffect(() => {
    if (!on) return;
    let timer = 0;
    let at: { x: number; y: number; el: Element } | null = null;
    const cancel = () => {
      window.clearTimeout(timer);
      at = null;
    };
    const fire = () => {
      const p = at;
      cancel();
      const node = p && textNear(p.el, p.x, p.y);
      if (!node) return;
      swallowClick();
      navigator.vibrate?.(12);
      const now = (node.nodeValue ?? "").trim();
      setEdit({ node, lang: pageLang(), orig: originalOf(node), now });
      setText(now);
      setFailed(false);
    };
    const down = (e: PointerEvent) => {
      cancel();
      if (open.current || !e.isPrimary || e.button !== 0) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest(SKIP)) return;
      at = { x: e.clientX, y: e.clientY, el };
      timer = window.setTimeout(fire, HOLD);
    };
    const move = (e: PointerEvent) => {
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > DRIFT) cancel();
    };
    // an Android phone asks for its own long-press menu first: this press is ours
    const menu = (e: Event) => {
      if (!at) return;
      e.preventDefault();
      fire();
    };
    const o = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", down, o);
    document.addEventListener("pointermove", move, o);
    document.addEventListener("pointerup", cancel, o);
    document.addEventListener("pointercancel", cancel, o);
    document.addEventListener("contextmenu", menu, true);
    window.addEventListener("scroll", cancel, o);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down, o);
      document.removeEventListener("pointermove", move, o);
      document.removeEventListener("pointerup", cancel, o);
      document.removeEventListener("pointercancel", cancel, o);
      document.removeEventListener("contextmenu", menu, true);
      window.removeEventListener("scroll", cancel, o);
    };
  }, [on]);

  const save = async (value: string) => {
    if (!edit) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await api<{ copy: CopyMap }>("/admin/copy", { body: { lang: edit.lang, orig: edit.orig, text: value } });
      setCopy(r.copy);
      setEdit(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const changed = !!edit && edit.orig !== edit.now;
  return (
    <Sheet
      open={!!edit}
      onClose={() => setEdit(null)}
      lang={lang}
      title={zh ? "改这段字" : "Edit this text"}
      footer={
        <div className="copyedit-actions" data-copy-off>
          {changed && (
            <Button tone="quiet" icon={RotateCcw} disabled={busy} onClick={() => edit && void save(edit.orig)}>
              {zh ? "恢复原文" : "Restore the original"}
            </Button>
          )}
          <Button icon={PenLine} busy={busy} disabled={!text.trim() || text.trim() === edit?.now} onClick={() => void save(text)}>
            {zh ? "保存" : "Save"}
          </Button>
        </div>
      }
    >
      {edit && (
        <div className="copyedit" data-copy-off>
          {changed && (
            <p className="copyedit-was">
              <span>{zh ? "原文" : "Originally"}</span>
              {edit.orig}
            </p>
          )}
          <div className="field">
            <textarea rows={3} value={text} maxLength={COPY_MAX} onChange={(e) => setText(e.target.value)} aria-label={zh ? "新的字" : "New text"} />
          </div>
          <p className="hint">
            {zh
              ? "全站一模一样的这段字都会跟着改，所有人一分钟内看到。它的翻译是另一段字：切到另一种语言再长按。"
              : "Every identical piece of this text on the site changes with it, for everyone within a minute. Its translation is separate: switch language and long-press it."}
          </p>
          {/\d/.test(edit.orig) && <p className="hint">{zh ? "带数字的字，数字不一样的地方不会跟着改。" : "It has a number in it: places with a different number stay as they are."}</p>}
          {failed && (
            <p className="copyedit-error" role="alert">
              {zh ? "没存上，再试一次" : "Couldn't save. Try again."}
            </p>
          )}
          <button
            type="button"
            className="copyedit-off"
            onClick={() => {
              setEdit(null);
              setCopyEditOn(false);
            }}
          >
            {zh ? "在这台手机上关掉长按改字（后台能再打开）" : "Turn off long-press editing on this phone (back on in the back office)"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** The words under the finger: the text in or around the pressed element nearest the press. */
function textNear(el: Element, x: number, y: number): Text | null {
  const range = document.createRange();
  for (let box: Element | null = el, up = 0; box && up < 3; box = box.parentElement, up++) {
    let best: Text | null = null;
    let near = 28;
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
      if (!n.nodeValue?.trim() || n.parentElement?.closest(SKIP)) continue;
      range.selectNodeContents(n);
      for (const b of range.getClientRects()) {
        const d = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
        if (d < near) {
          near = d;
          best = n;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** A mouse ends the press with a click on whatever was under it: that one isn't a click. */
function swallowClick() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const off = () => window.removeEventListener("click", stop, true);
  window.addEventListener("click", stop, true);
  window.addEventListener("pointerup", () => window.setTimeout(off, 350), { capture: true, once: true });
  window.setTimeout(off, 15000);
}
