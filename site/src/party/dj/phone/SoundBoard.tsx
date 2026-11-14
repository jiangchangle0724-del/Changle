import { ChevronLeft } from "lucide-react";
import { useRef, useState } from "react";
import { useRoom, useRoomEvent } from "../../../online/RoomContext";
import { haptic } from "../../../lib/sfx";
import { useBackCloses } from "../../../router";
import { SFX, SFX_CATS, SFX_TIMES, sfxOf, type SfxCat } from "../../../shared/dj/sfx";
import { playHere } from "../sfx/here";
import { SFX_ICON } from "../sfx/look";
import type { G } from "./Player";

/**
 * The sound board on every phone (Steve on Nov 13: "首先对我的这些音效进行细致的分类…玩家看到的会先是这些
 * 分类进去之后才可以播放音效。把你的音效全部替换掉"): the categories first; a category opens its sounds
 * (the phone's back button, or ‹, goes back to the categories); a tap plays the sound on the TV at
 * once. Under it, who just played what. Also on the shared phone's 音效 sheet (`me`: the table's,
 * SHARED_BY; Nov 14). With no big screen on at the table (`here`), a sound plays on the phone
 * that pressed it (Nov 14: "手机在没有连接电视的时候也可以在自己的手机上播放音效").
 */
export function SoundBoard({ g, zh, nameOf, me: who, here = false }: { g: G; zh: boolean; nameOf: (pid: string) => string; me?: string; here?: boolean }) {
  const { me: seat } = useRoom();
  const me = who ?? seat;
  const [cat, setCat] = useState<SfxCat | null>(null);
  useBackCloses(cat !== null, () => setCat(null));
  const at = useRef(0);
  const [hit, setHit] = useState<{ i: number; n: number } | null>(null);
  const press = (i: number) => {
    const t = performance.now();
    if (t - at.current < SFX_TIMES.gapMs) return;
    at.current = t;
    g("sfx", { i });
    if (here) playHere(i);
    haptic(12);
    setHit((h) => ({ i, n: (h?.n ?? 0) + 1 }));
  };

  // who just played what (theirs, and everyone else's), and who asked for a song
  const [said, setSaid] = useState<{ id: number; text: string }[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "fx" || !e.pid) return;
    let text: string;
    if (e.fx === "sfx") {
      const x = SFX[e.data?.[0] ?? -1];
      if (!x) return;
      text = `${e.pid === me ? (zh ? "你" : "You") : nameOf(e.pid)} · ${zh ? x.zh : x.en}`;
    } else if (e.fx === "req" && e.pid !== me) text = zh ? `${nameOf(e.pid)} 点了一首歌` : `${nameOf(e.pid)} asked for a song`;
    else return;
    const id = ++seq.current;
    setSaid((l) => [...l.slice(-2), { id, text }]);
    window.setTimeout(() => setSaid((l) => l.filter((y) => y.id !== id)), 2200);
  });

  const open = cat ? SFX_CATS.find((c) => c.id === cat)! : null;
  return (
    <section className="djk-board" aria-label={zh ? "音效" : "Sounds"}>
      {!open ? (
        <>
          <span className="djk-board-title">
            {who
              ? zh
                ? "音效：选一类，点了马上响"
                : "Sounds: pick a kind, they play at once"
              : here
                ? zh
                  ? "音效：电视没开，点了在这台手机上响"
                  : "Sounds: no TV on, so they play on this phone"
                : zh
                  ? "音效：选一类，点了电视上马上响"
                  : "Sounds: pick a kind, they play on the TV at once"}
          </span>
          <div className="djk-cats">
            {SFX_CATS.map((c) => {
              const Icon = SFX_ICON[c.id];
              return (
                <button key={c.id} type="button" className={`djk-cat is-${c.id}`} onClick={() => setCat(c.id)}>
                  <Icon size={26} aria-hidden="true" />
                  <span className="djk-cat-name">{zh ? c.zh : c.en}</span>
                  <span className="djk-cat-n tabular">{zh ? `${sfxOf(c.id).length} 个` : `${sfxOf(c.id).length}`}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className={`djk-board-head is-${open.id}`}>
            <button type="button" className="djk-board-back" onClick={() => setCat(null)} aria-label={zh ? "回到全部分类" : "Back to all kinds"}>
              <ChevronLeft size={22} aria-hidden="true" />
              {zh ? "分类" : "Kinds"}
            </button>
            <span className="djk-board-name">{zh ? open.zh : open.en}</span>
          </div>
          <div className={`djk-sfx-list is-${open.id}`}>
            {sfxOf(open.id).map(({ i, x }) => (
              <button key={x.id} type="button" className={`djk-sfx${hit?.i === i ? " is-hit" : ""}`} onClick={() => press(i)}>
                <span key={hit?.i === i ? hit.n : 0}>{zh ? x.zh : x.en}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="djk-said" aria-live="polite">
        {said.map((x) => (
          <span key={x.id}>{x.text}</span>
        ))}
      </p>
    </section>
  );
}
