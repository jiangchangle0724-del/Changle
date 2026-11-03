import { Crown, Flame, Megaphone, MonitorSpeaker, Play, Snowflake, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { haptic } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useRoom, useRoomEvent, useTicker } from "../../online/RoomContext";
import { onAir } from "../../shared/dj/deck";
import { FIRE_GAP_MS, SET_PHASES, type SetPhase } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NowPlaying, phaseHint, phaseName, TIMES_MIN, useHeat } from "./parts";
import { RecapLines } from "./RecapLines";
import { DancePad } from "./phone/DancePad";
import { DeckPad } from "./phone/DeckPad";
import { MySongs } from "./phone/MySongs";
import "../../styles/dj.css";
import "../../styles/dj-phone.css";

/**
 * 打碟 · DJ Booth on a phone: no sound here (it all comes out of the big screen). The beginner deck
 * (everyone DJs at once: the crossfader, the pads, the build-up and the drop, what plays next), a 🔥
 * to push the DJ, and for the host, the night's four stretches and the end of the set.
 */
export function NetDj({ v, onLeave }: { v: DjView; onLeave: () => void }) {
  // the speaker is the only music: the lounge loop stays off on this phone
  useEffect(() => holdBackground(), []);
  const { room, me, isHost, g, now, nameOf, code } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  useTicker(v.phase !== "wait" && v.phase !== "end", 5000);
  const h = useHeat(v);
  const mine = h.total(me);
  const heat = h.minute;
  const noSpeaker = (room?.screens ?? 0) === 0;
  // who's pressed the most tonight, among those at the table
  const seats = room?.seats ?? [];
  const ranked = h.top.map((pid) => seats.find((x) => x.id === pid)).filter((x): x is NonNullable<typeof x> => !!x && h.total(x.id) > 0);
  const myRank = ranked.findIndex((x) => x.id === me) + 1;

  // a burst on this phone for every press, and the latest names from everyone else; the room
  // takes one 🔥 per 400 ms a phone, so faster taps only burst here
  const [pops, setPops] = useState<number[]>([]);
  const seq = useRef(0);
  const sentAt = useRef(0);
  const press = () => {
    const t = performance.now();
    if (t - sentAt.current >= FIRE_GAP_MS) {
      sentAt.current = t;
      g("fire");
    }
    haptic(14);
    const id = ++seq.current;
    setPops((p) => [...p.slice(-5), id]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 900);
  };
  // ❄️, the other side of 🔥 (the plan's reactions): the floor's dragging. The room reads both
  // (读场: Lyria plays denser and brighter for 🔥, less for ❄️); one or the other per press gap
  const [colds, setColds] = useState<number[]>([]);
  const chill = () => {
    const t = performance.now();
    if (t - sentAt.current >= FIRE_GAP_MS) {
      sentAt.current = t;
      g("cold");
    }
    haptic(8);
    const id = ++seq.current;
    setColds((p) => [...p.slice(-3), id]);
    window.setTimeout(() => setColds((p) => p.filter((x) => x !== id)), 900);
  };
  const [others, setOthers] = useState<{ id: number; name: string; cold: boolean }[]>([]);
  useRoomEvent((e) => {
    if (e.k !== "fx" || (e.fx !== "fire" && e.fx !== "cold") || !e.pid || e.pid === me) return;
    const id = ++seq.current;
    setOthers((list) => [...list.slice(-3), { id, name: nameOf(e.pid!), cold: e.fx === "cold" }]);
    window.setTimeout(() => setOthers((list) => list.filter((x) => x.id !== id)), 2200);
  });
  const chills = v.colds.filter((c) => now() - c.at < 60_000).length;

  const rules = (
    <>
      <p>
        {zh
          ? "电视或电脑打开 changle.ca/dj 就是音箱：在那上面点「开始派对」放歌。手机不出声，按 🔥 给 DJ 加油，大屏上看得到是谁。"
          : "Open changle.ca/dj on a TV or computer and it's the speaker: press Start the party there. Phones stay quiet; press 🔥 to push the DJ, and the big screen shows who did."}
      </p>
      <p>
        {zh
          ? "每个人的手机都是打碟台，大家可以同时按，什么都卡在拍子上，不会乱：推子在 A、B 两个碟之间混，八个效果键（回声、扫频、喇叭、刹车、警笛、激光、搓碟、倒带）下一拍响，大家一起狂点「蓄力」，满了倒数 8 秒，在 DROP 那一下按，踩准了就是完美 Drop。下面选下一首放什么，票最多的放到没在放的那个碟上，Drop 的时候直接换过去。"
          : "Every phone is a deck and everyone can play at once; it all lands on the beat, so nothing goes wrong. The crossfader mixes decks A and B, the eight pads (echo, sweep, horn, brake, siren, laser, scratch, rewind) play from the next beat, everyone taps Build up together, and when it's full an 8-second count starts: press DROP on it, right on it is a perfect drop. Below, pick what plays next; the most picked goes on the deck that isn't playing, and a drop switches straight to it."}
      </p>
      <p>
        {zh
          ? `一晚分四段：暖场 ${TIMES_MIN.warm} 分钟，推高 ${TIMES_MIN.build} 分钟，然后是顶点，主人决定什么时候收尾，收尾 ${TIMES_MIN.cool} 分钟后结束。主人随时可以把它拖到任何一段。每场最长 ${TIMES_MIN.cap} 小时。`
          : `A night in four stretches: ${TIMES_MIN.warm} minutes of warm-up, ${TIMES_MIN.build} of build, then the peak until the host winds it down, and ${TIMES_MIN.cool} minutes later it's over. The host can move it to any stretch at any time. A set runs ${TIMES_MIN.cap} hours at most.`}
      </p>
    </>
  );

  return (
    <NetFrame title={GAME_BY_ID.dj.name} rules={rules} onLeave={onLeave} dock={false}>
      <div className={`djp is-${v.phase}`}>
        <section className="djp-now">
          <span className="djp-phase">{phaseName(v.phase, zh)}</span>
          <span className="djp-hint">{phaseHint(v, now(), zh)}</span>
          {v.phase !== "wait" && v.phase !== "end" && <NowPlaying v={v} song={v.deck?.local ? v.onDecks?.[onAir(v.deck)] : null} />}
        </section>

        {v.phase === "end" && (
          <section className="djp-recap" aria-label={zh ? "今晚回顾" : "Tonight's recap"}>
            <span className="djp-recap-title">{zh ? "今晚回顾" : "Tonight's recap"}</span>
            <p className="djp-recap-you tabular">
              {zh
                ? `你：🔥 ${mine} 次 · 完美 Drop ${v.deck?.perfects?.[me] ?? 0} 次 · 点的歌放了 ${(v.deck?.heard ?? []).filter((r) => r.by === me).length} 首`
                : `You: 🔥 ${mine} · perfect drops ${v.deck?.perfects?.[me] ?? 0} · your songs played ${(v.deck?.heard ?? []).filter((r) => r.by === me).length}`}
            </p>
            <RecapLines v={v} zh={zh} line="djp-recap-line" note="djp-recap-note" />
          </section>
        )}

        {noSpeaker && (
          <p className="djp-warn" role="status">
            <MonitorSpeaker size={18} />
            {zh ? `没有音箱在线：在电视或电脑上打开 changle.ca/tv/${code}` : `No speaker on: open changle.ca/tv/${code} on a TV or computer`}
          </p>
        )}

        {/* 跟着跳: the phone in the dancing hand, following the coach on the TV */}
        {v.phase !== "end" && <DancePad v={v} g={g} zh={zh} />}

        {/* (a rooms server a moment behind the site, mid-deploy, sends no deck yet) */}
        {v.deck && <DeckPad v={v} />}

        <div className="djp-fire-wrap is-small">
          <div className="djp-react">
            <button type="button" className="djp-fire" onClick={press} aria-label={zh ? "给 DJ 加油" : "Fire up the DJ"}>
              <Flame size={48} strokeWidth={2.2} />
              {pops.map((id) => (
                <span key={id} className="djp-pop" aria-hidden="true">
                  🔥
                </span>
              ))}
            </button>
            <button type="button" className="djp-cold" onClick={chill} disabled={v.phase === "wait" || v.phase === "end"} aria-label={zh ? "有点冷场" : "It's dragging"}>
              <Snowflake size={30} strokeWidth={2.2} />
              <span>{zh ? "冷场" : "Dragging"}</span>
              {colds.map((id) => (
                <span key={id} className="djp-pop" aria-hidden="true">
                  ❄️
                </span>
              ))}
            </button>
          </div>
          <p className="djp-count tabular">{zh ? `你按了 ${mine} 次 · 这一分钟全场 🔥 ${heat} ❄️ ${chills}` : `You: ${mine} · everyone this minute: 🔥 ${heat} ❄️ ${chills}`}</p>
          <p className="djp-others" aria-live="polite">
            {others.map((o) => (
              <span key={o.id}>
                {o.cold ? "❄️" : "🔥"} {o.name}
              </span>
            ))}
          </p>
        </div>

        {ranked.length > 0 && (
          <section className="djp-fans" aria-label={zh ? "今晚最嗨" : "Most fired up tonight"}>
            <span className="djp-fans-title">{zh ? "今晚最嗨" : "Most fired up tonight"}</span>
            <ol>
              {ranked.slice(0, 3).map((s, i) => (
                <li key={s.id} className={s.id === me ? "is-me" : ""}>
                  <span className="djp-rank tabular">{i + 1}</span>
                  <SeatFace seat={s} size={32} />
                  <span className="djp-fan-name">{s.id === me ? (zh ? "你" : "You") : s.name}</span>
                  <span className="djp-fan-n tabular">🔥 {h.total(s.id)}</span>
                </li>
              ))}
            </ol>
            {myRank > 3 && <p className="djp-you tabular">{zh ? `你排第 ${myRank}，再按几下` : `You're #${myRank}. Keep pressing`}</p>}
          </section>
        )}

        {isHost && (
          <section className="djp-host" aria-label={zh ? "主人" : "Host"}>
            <span className="djp-host-label">
              <Crown size={14} strokeWidth={2.4} />
              {zh ? "主人：把今晚拖到" : "Host: take the night to"}
            </span>
            <div className="seg djp-seg" role="group">
              {SET_PHASES.map((p: SetPhase) => (
                <button key={p} type="button" aria-pressed={v.phase === p} disabled={v.phase === "wait" || v.phase === "end"} onClick={() => g("phase", { phase: p })}>
                  {phaseName(p, zh)}
                </button>
              ))}
            </div>
            {v.phase !== "end" && <p className="djp-host-note">{zh ? "DJ 等这一段 8 小节放完再换，最多 15 秒，大屏上会报出来" : "The DJ switches when these 8 bars end, 15 seconds at most; the big screen announces it"}</p>}
            {/* 报幕: the big screen says who a song asked for is from */}
            <button type="button" className="djp-voice" aria-pressed={v.voice !== false} onClick={() => g("voice", { on: v.voice === false })}>
              <Megaphone size={16} strokeWidth={2.4} />
              {v.voice !== false ? (zh ? "语音报幕：开" : "Announcements: on") : zh ? "语音报幕：关" : "Announcements: off"}
            </button>
            {v.phase === "end" ? (
              <button type="button" className="btn btn-primary btn-block" onClick={() => g("again")}>
                <Play size={17} />
                {zh ? "再来一场" : "Another set"}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-block" disabled={v.phase === "wait"} onClick={() => g("phase", { phase: "end" })}>
                <Square size={15} />
                {zh ? "结束这一场" : "End this set"}
              </button>
            )}
          </section>
        )}
        {/* the host's songs: on the TV's computer, sent there from this phone, and the switch to them */}
        {isHost && v.phase !== "end" && <MySongs v={v} />}
      </div>
    </NetFrame>
  );
}
