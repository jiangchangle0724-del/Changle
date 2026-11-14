import { Crown, Flame, Megaphone, MonitorSpeaker, Play, Snowflake } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { haptic } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useRoom, useRoomEvent, useTicker } from "../../online/RoomContext";
import { FIRE_GAP_MS } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { TIMES_MIN, useHeat } from "./parts";
import { RecapLines } from "./RecapLines";
import { DancePad } from "./phone/DancePad";
import { DeckPad } from "./phone/DeckPad";
import { MySongs } from "./phone/MySongs";
import "../../styles/dj.css";
import "../../styles/dj-phone.css";

/**
 * 打碟 · DJ Booth on a phone: no sound here (it all comes out of the big screen). The player at the
 * top (上一曲, 暂停 or 播放, 切歌: anyone), the song box and the 歌单, the sound pads, a 🔥 to push the
 * DJ, for the host 报幕 on or off (and at the end another set), and at the very bottom 跟着跳 (Steve
 * on Nov 12: the deck's turntables, mixer, crossfader and DROP gone, dancing along moved down, and
 * the card with the night's stretch at the top gone too; on Nov 13: the host's stretches and 结束这一场
 * gone, "仅保留 announcement on": the night moves on by itself).
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

  // (the browser checks move the night along themselves: the host has no buttons for it now)
  useEffect(() => {
    if (!import.meta.env.DEV || !isHost) return;
    const w = window as unknown as { __djHost?: { phase: (p: string) => void } };
    w.__djHost = { phase: (p) => g("phase", { phase: p }) };
    return () => {
      delete w.__djHost;
    };
  }, [isHost, g]);

  const rules = (
    <>
      <p>
        {zh
          ? "一台公用手机投屏到电视（或者电视、电脑）打开 changle.ca/dj 就是音箱：在那上面点「开始派对」放歌，也能直接在上面点歌。别的手机不出声，按 🔥 给 DJ 加油，大屏上看得到是谁。"
          : "Open changle.ca/dj on a phone everyone shares, mirrored to the TV (or on a TV or computer), and it's the speaker: press Start the party there, and pick songs on it too. The other phones stay quiet; press 🔥 to push the DJ, and the big screen shows who did."}
      </p>
      <p>
        {zh
          ? "每个人的手机上都能点歌：输入歌名或者贴 YouTube 链接，点的歌按顺序在电视上放整首，两首之间 DJ 接几秒，没人点歌的时候 DJ 一直放。最上面的播放键谁都能按：上一曲、暂停、播放、切歌。下面十二个音效键（喇叭、警笛、搓碟……）在电视上下一拍响。最下面是跟着跳：拿着手机跟电视上的教练一起跳。"
          : "Everyone can ask for songs on their phone: type a song or paste a YouTube link, and the TV plays them whole, in turn, the DJ for a few seconds between them (and on its own when nobody's asked for one). The player at the top is anyone's: previous, pause, play, next. The twelve sound pads below (air horn, siren, scratch and more) play on the TV from the next beat. At the very bottom, dance along: hold the phone and follow the coach on the TV."}
      </p>
      <p>
        {zh
          ? `一晚分四段，自己往下走：暖场 ${TIMES_MIN.warm} 分钟，推高 ${TIMES_MIN.build} 分钟，然后是顶点，最后 ${TIMES_MIN.cool} 分钟收尾。一场 ${TIMES_MIN.cap} 小时。`
          : `A night in four stretches, moving on by itself: ${TIMES_MIN.warm} minutes of warm-up, ${TIMES_MIN.build} of build, then the peak, and the last ${TIMES_MIN.cool} minutes wind down. A set runs ${TIMES_MIN.cap} hours.`}
      </p>
    </>
  );

  return (
    <NetFrame title={GAME_BY_ID.dj.name} rules={rules} onLeave={onLeave} dock={false}>
      <div className={`djp is-${v.phase}`}>
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
              {zh ? "主人" : "Host"}
            </span>
            {/* 报幕: the big screen says who a song asked for is from */}
            <button type="button" className="djp-voice" aria-pressed={v.voice !== false} onClick={() => g("voice", { on: v.voice === false })}>
              <Megaphone size={16} strokeWidth={2.4} />
              {v.voice !== false ? (zh ? "语音报幕：开" : "Announcements: on") : zh ? "语音报幕：关" : "Announcements: off"}
            </button>
            {v.phase === "end" && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => g("again")}>
                <Play size={17} />
                {zh ? "再来一场" : "Another set"}
              </button>
            )}
          </section>
        )}
        {/* the host's songs: on the TV's computer, sent there from this phone, and the switch to them */}
        {isHost && v.phase !== "end" && <MySongs v={v} />}

        {/* 跟着跳: the phone in the dancing hand, following the coach on the TV (at the very bottom, Steve on Nov 12) */}
        {v.phase !== "end" && <DancePad v={v} g={g} zh={zh} />}
      </div>
    </NetFrame>
  );
}
