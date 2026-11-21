import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { setCopy } from "../lib/copy";
import { setCopyEditOn, useCopyEditOn } from "../lib/copyEdit";
import type { CopyEdit, CopyMap } from "../shared/copy";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";

/**
 * The back office's 改字 desk: long-press editing on or off on this phone, and every text the
 * owner changed, each with a way back to the original (account/CopyEditor.tsx). Its own words are
 * never swapped (data-copy-off), so the originals show as they were.
 */
export function AdminCopy() {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const on = useCopyEditOn();
  const [edits, setEdits] = useState<CopyEdit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setEdits((await api<{ edits: CopyEdit[] }>("/admin/copy")).edits);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const restore = async (e: CopyEdit) => {
    setBusy(`${e.lang}:${e.orig}`);
    try {
      setCopy((await api<{ copy: CopyMap }>("/admin/copy", { body: { lang: e.lang, orig: e.orig, text: e.orig } })).copy);
      await load();
    } catch {
      toast(zh ? "没成功，再试一次" : "That didn't go through. Try again");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="adm-copy" data-copy-off>
      <h2 className="adm-h">
        {zh ? "改字" : "Site text"}
        {!!edits?.length && <span className="adm-badge tabular">{edits.length}</span>}
      </h2>
      <div className="adm-copy-switch">
        <div className="adm-switch-text">
          <strong>{zh ? "长按改字" : "Long-press to edit"}</strong>
          <span>
            {on
              ? zh
                ? "这台手机上开着：长按网站上的任何字就能改，所有人一分钟内看到。"
                : "On for this phone: long-press any words on the site to change them, for everyone within a minute."
              : zh
                ? "这台手机上关着。打开后，长按网站上的字就能改。"
                : "Off on this phone. Turn it on, then long-press any words to change them."}
          </span>
        </div>
        <button type="button" className={`btn ${on ? "btn-ghost" : "btn-primary"}`} aria-pressed={on} onClick={() => setCopyEditOn(!on)}>
          {on ? (zh ? "关掉" : "Turn off") : zh ? "打开" : "Turn on"}
        </button>
      </div>
      {failed ? (
        <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void load() }} />
      ) : !edits ? (
        <Skeleton lang={lang} lines={2} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
      ) : !edits.length ? (
        <p className="hint adm-empty">{zh ? "还没改过字。" : "No text changed yet."}</p>
      ) : (
        <ul className="adm-list">
          {edits.map((e) => (
            <li key={`${e.lang}:${e.orig}`} className="adm-row">
              <span className="adm-copy-lang" aria-label={e.lang === "zh" ? (zh ? "中文" : "Chinese") : zh ? "英文" : "English"}>
                {e.lang === "zh" ? "中" : "EN"}
              </span>
              <div className="adm-who">
                <span className="adm-name">{e.text}</span>
                <span className="adm-sub">
                  {zh ? "原文：" : "Was: "}
                  {e.orig}
                </span>
              </div>
              <div className="seat-row-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void restore(e)}>
                  <RotateCcw size={14} /> {zh ? "恢复原文" : "Restore"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
