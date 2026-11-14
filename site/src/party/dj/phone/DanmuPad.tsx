import { MessageSquareText, Send } from "lucide-react";
import { useRef, useState } from "react";
import { haptic } from "../../../lib/sfx";
import { DANMU, DANMU_READY } from "../../../shared/dj/danmu";
import type { DjView } from "../../../shared/protocol";
import type { G } from "./Player";

/**
 * 弹幕 on a phone (Steve on Nov 13: "再加一个玩家可以发弹幕的功能，可以推荐几个弹幕表情之类的，也可以自定义"):
 * a tap on a ready one, or a line of one's own, flies across the TV with this player's face and
 * name. One a second and a half (the room takes no more); the host can turn them off.
 */
export function DanmuPad({ v, g, zh }: { v: DjView; g: G; zh: boolean }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ n: number; said: string } | null>(null);
  const last = useRef(0);
  const seq = useRef(0);
  const on = v.danmuOn !== false;
  const ended = v.phase === "end";

  const tell = (said: string) => {
    const n = ++seq.current;
    setNote({ n, said });
    window.setTimeout(() => setNote((x) => (x?.n === n ? null : x)), 2500);
  };
  const say = (data: { p: number } | { t: string }, shown: string) => {
    const t = performance.now();
    if (t - last.current < DANMU.gapMs) {
      tell(zh ? "慢一点，一秒半一条" : "Easy: one every second and a half");
      return false;
    }
    last.current = t;
    haptic(12);
    g("say", data);
    tell(zh ? `发到电视了：${shown}` : `On the TV: ${shown}`);
    return true;
  };
  const own = text.trim();

  return (
    <section className="djk-danmu" aria-label={zh ? "弹幕" : "Comments on the TV"}>
      <span className="djk-danmu-title">
        <MessageSquareText size={22} aria-hidden="true" />
        {zh ? "发弹幕" : "Comments on the TV"}
      </span>
      {!on ? (
        <p className="djk-danmu-note">{zh ? "主人关了弹幕" : "The host turned comments off"}</p>
      ) : (
        <>
          <p className="djk-danmu-note">{zh ? "点一个，或者自己写一句，从电视上飘过去，带着你的名字。" : "Tap one or write your own: it flies across the TV with your name."}</p>
          <div className="djk-danmu-ready" role="group" aria-label={zh ? "现成的弹幕" : "Ready ones"}>
            {DANMU_READY.map((r, i) => (
              <button key={i} type="button" className="djk-danmu-chip" disabled={ended} onClick={() => say({ p: i }, zh ? r.zh : r.en)}>
                {zh ? r.zh : r.en}
              </button>
            ))}
          </div>
          <form
            className="djk-danmu-own"
            onSubmit={(e) => {
              e.preventDefault();
              if (own && say({ t: own }, own)) setText("");
            }}
          >
            <input
              className="djk-danmu-input"
              type="text"
              value={text}
              maxLength={DANMU.chars * 2}
              placeholder={zh ? `自己写一句（${DANMU.chars} 个字以内）` : `Your own words (${DANMU.chars} characters at most)`}
              aria-label={zh ? "自己写的弹幕" : "Your own comment"}
              enterKeyHint="send"
              autoComplete="off"
              disabled={ended}
              onChange={(e) => setText(Array.from(e.target.value).slice(0, DANMU.chars).join(""))}
            />
            <button type="submit" className="btn btn-primary" disabled={!own || ended}>
              <Send size={18} aria-hidden="true" />
              {zh ? "发送" : "Send"}
            </button>
          </form>
          <p className="djk-danmu-sent" role="status">
            {note?.said ?? ""}
          </p>
        </>
      )}
    </section>
  );
}
