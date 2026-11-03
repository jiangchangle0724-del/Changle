import { Music2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRoom, useRoomEvent } from "../../../online/RoomContext";
import { encodePiece, fileNumber, PHONE_BYTES_MIN, PIECE_BYTES, SONG_BYTES } from "../../../shared/dj/songwire";
import { SONG_SENT, type SongSent } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { useStore } from "../../../store";

/** What the phone says about a song it sent: the TV's word on it, or why it never got there. */
const SAID: Record<SongSent | "big" | "line" | "quiet", { zh: string; en: string }> = {
  added: { zh: "加好了", en: "Added" },
  kind: { zh: "不是歌的文件", en: "Not a sound file" },
  short: { zh: "太短，不到 45 秒", en: "Too short, under 45 seconds" },
  long: { zh: "太长，超过 15 分钟", en: "Too long, over 15 minutes" },
  unreadable: { zh: "放不了，可能是加密的会员歌", en: "Can't be played, maybe a protected download" },
  full: { zh: "电视上的歌太多了，先在电视上清空一些", en: "The TV has too many songs. Clear some there first" },
  there: { zh: "电视上已经有这首了", en: "The TV has this one already" },
  big: { zh: "文件太大，超过 30 MB", en: "Too big, over 30 MB" },
  line: { zh: "断线了，没传完，再试一次", en: "The connection dropped before it was sent. Try again" },
  quiet: { zh: "电视没回应，看看电视上的「我的歌」", en: "The TV didn't answer. Check My songs there" },
};
type Said = keyof typeof SAID;

/** files waiting to be sent at most (one at a time) */
const QUEUE_MAX = 20;
/** how long the TV may take to listen to a song before the phone gives up waiting */
const ANSWER_MS = 90_000;

const sleep = (ms: number) => new Promise((ok) => window.setTimeout(ok, ms));
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);

/**
 * 打碟 · DJ Booth: 我的歌 on the host's phone (Steve on Nov 2: it should work from the phone too).
 * How many songs the big screen's computer has; songs on this phone sent to it (in pieces through
 * the table, nothing kept on the way: songwire.ts), listened to there like the computer's own;
 * and the switch between them and the sound-check DJ.
 */
export function MySongs({ v }: { v: DjView }) {
  const { g, me, room, sendBytes, bytesWaiting } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const L = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  const pick = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [now, setNow] = useState<{ name: string; done: number; size: number; listening: boolean } | null>(null);
  const [sent, setSent] = useState<{ key: number; name: string; said: Said }[]>([]);
  const answers = useRef(new Map<number, (r: SongSent) => void>());
  const paced = useRef<{ at: number; bytes: number }[]>([]);
  const busy = useRef(false);
  const screen = (room?.screens ?? 0) > 0;

  // the TV's word on a song this phone sent
  useRoomEvent((e) => {
    if (e.k !== "fx" || e.fx !== "song" || e.pid !== me || !e.data) return;
    const r = SONG_SENT[e.data[0]];
    if (r) answers.current.get(e.data[1])?.(r);
  });

  /** A minute's worth already sent (the table takes PHONE_BYTES_MIN a minute from a phone). */
  const overMinute = (more: number) => {
    const t = Date.now();
    paced.current = paced.current.filter((x) => t - x.at < 60_000);
    return paced.current.reduce((n, x) => n + x.bytes, 0) + more > PHONE_BYTES_MIN * 0.9;
  };

  /** One file: its pieces as the line takes them, then the TV's word on it. */
  const sendOne = async (f: File): Promise<Said> => {
    if (f.size > SONG_BYTES) return "big";
    if (f.size < 1) return "kind";
    const id = newId();
    const num = fileNumber(id);
    const n = Math.ceil(f.size / PIECE_BYTES);
    const answer = new Promise<SongSent>((ok) => answers.current.set(num, ok));
    try {
      setNow({ name: f.name, done: 0, size: f.size, listening: false });
      for (let i = 0; i < n; i++) {
        const bytes = new Uint8Array(await f.slice(i * PIECE_BYTES, Math.min(f.size, (i + 1) * PIECE_BYTES)).arrayBuffer());
        // the line takes a megabyte at a time, the table a minute's worth
        for (let t = 0; bytesWaiting() > 1_000_000 || overMinute(bytes.length); t++) {
          if (t > 900) return "line";
          await sleep(100);
        }
        if (!sendBytes(encodePiece({ id, i, n, size: f.size, name: f.name.slice(0, 200), type: f.type.slice(0, 80) }, bytes))) return "line";
        paced.current.push({ at: Date.now(), bytes: bytes.length });
        setNow({ name: f.name, done: Math.min(f.size, (i + 1) * PIECE_BYTES), size: f.size, listening: false });
      }
      setNow({ name: f.name, done: f.size, size: f.size, listening: true });
      return await Promise.race([answer, sleep(ANSWER_MS).then(() => "quiet" as const)]);
    } finally {
      answers.current.delete(num);
    }
  };

  useEffect(() => {
    if (busy.current || !queue.length) return;
    busy.current = true;
    const f = queue[0];
    void sendOne(f).then((said) => {
      setSent((l) => [...l.slice(-4), { key: Math.random(), name: f.name, said }]);
      setNow(null);
      busy.current = false;
      setQueue((q) => q.slice(1));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  const pct = now ? Math.round((100 * now.done) / Math.max(1, now.size)) : 0;
  const more = Math.max(0, queue.length - 1);
  const state =
    v.source === "local"
      ? zh
        ? "正在放你的歌"
        : "Playing your songs"
      : v.mine
        ? v.crateN === 0
          ? zh
            ? "电视上还没有歌，先传几首"
            : "The TV has no songs yet. Send some first"
          : v.phase === "wait"
            ? zh
              ? "开始派对就放你的歌"
              : "Your songs play when the party starts"
            : zh
              ? "马上换成你的歌"
              : "Switching to your songs"
        : "";

  return (
    <section className="djp-host djp-mine" aria-label={zh ? "我的歌" : "My songs"}>
      <span className="djp-host-label">
        <Music2 size={14} strokeWidth={2.4} />
        {zh ? `我的歌 · 电视上有 ${v.crateN} 首` : `My songs · ${v.crateN} on the TV`}
      </span>
      <p className="djp-host-note">
        {zh ? "手机里的歌（MP3、M4A 这些）可以传到电视那台电脑上放，不存到网上。会员下载的加密歌放不了。" : "Songs on this phone (MP3, M4A and the like) can go to the TV's computer and play there. Nothing is saved online. Protected downloads from music apps can't be played."}
      </p>
      <button type="button" className="btn btn-ghost btn-block" disabled={!screen || queue.length >= QUEUE_MAX} onClick={() => pick.current?.click()}>
        <Upload size={16} />
        {zh ? "从手机传歌到电视" : "Send songs to the TV"}
      </button>
      <input
        ref={pick}
        type="file"
        multiple
        hidden
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) setQueue((q) => [...q, ...files].slice(0, QUEUE_MAX));
        }}
      />
      {!screen && <p className="djp-host-note">{zh ? "电视那台电脑没开着，开了才能传" : "The TV's computer isn't on. Songs can go once it is"}</p>}
      {now && (
        <p className="djp-mine-now" role="status">
          {now.listening ? (zh ? `电视正在听：${now.name}` : `The TV is listening: ${now.name}`) : zh ? `正在传 ${pct}%：${now.name}` : `Sending ${pct}%: ${now.name}`}
          {more > 0 && (zh ? `，还有 ${more} 首` : `, ${more} more`)}
        </p>
      )}
      {sent.length > 0 && (
        <ul className="djp-mine-sent">
          {sent.map((s) => (
            <li key={s.key} className={s.said === "added" ? "is-ok" : ""}>
              <span className="djp-mine-name">{s.name}</span>
              <span>{L(SAID[s.said])}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`btn btn-block ${v.mine ? "btn-ghost" : "btn-primary"}`} disabled={!v.mine && v.crateN === 0} onClick={() => g("mine", { on: !v.mine })}>
        {v.mine ? (zh ? "换回试音版 DJ" : "Back to the sound-check DJ") : zh ? "用我的歌放" : "Play my songs"}
      </button>
      {state && (
        <p className="djp-host-note" role="status">
          {state}
        </p>
      )}
    </section>
  );
}
