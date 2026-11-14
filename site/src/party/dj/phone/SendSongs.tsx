import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRoom, useRoomEvent } from "../../../online/RoomContext";
import { encodePiece, fileNumber, PHONE_BYTES_MIN, PIECE_BYTES, SONG_BYTES } from "../../../shared/dj/songwire";
import { SONG_SENT, type SongSent } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";

/** What the phone says about a song it sent: the TV's word on it, or why it never got there. */
const SAID: Record<SongSent | "big" | "line" | "quiet", { zh: string; en: string }> = {
  added: { zh: "加进歌单了", en: "On the playlist" },
  kind: { zh: "不是歌的文件", en: "Not a sound file" },
  short: { zh: "太短，不到 45 秒", en: "Too short, under 45 seconds" },
  long: { zh: "太长，超过 15 分钟", en: "Too long, over 15 minutes" },
  unreadable: { zh: "放不了，可能是加密的会员歌", en: "Can't be played, maybe a protected download" },
  full: { zh: "电视上放不下更多歌了", en: "The TV can't take more songs" },
  there: { zh: "电视上已经有这首，也加进你的歌单了", en: "The TV had it already: on the playlist for you too" },
  big: { zh: "文件太大，超过 30 MB", en: "Too big, over 30 MB" },
  line: { zh: "断线了，没传完，再试一次", en: "The connection dropped before it was sent. Try again" },
  quiet: { zh: "电视没回应，再传一次试试", en: "The TV didn't answer. Try sending it again" },
};
type Said = keyof typeof SAID;

/** files waiting to be sent at most (one at a time) */
const QUEUE_MAX = 20;
/** how long the TV may take to listen to a song before the phone gives up waiting */
const ANSWER_MS = 90_000;

const sleep = (ms: number) => new Promise((ok) => window.setTimeout(ok, ms));
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);

/**
 * 打碟 · DJ Booth: songs from this phone, on every phone (Steve on Nov 13: "要允许所有玩家都可以上传
 * 自己的歌上去，不仅是host"; before, the host's 我的歌 alone). Song files on this phone go to the big
 * screen's computer in pieces through the table (nothing kept on the way: songwire.ts), are
 * listened to there, and go on the 歌单 as this player's, played whole when their turn comes.
 */
export function SendSongs({ v, zh }: { v: DjView; zh: boolean }) {
  const { me, room, sendBytes, bytesWaiting } = useRoom();
  const L = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  const pick = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [now, setNow] = useState<{ name: string; done: number; size: number; listening: boolean } | null>(null);
  const [sent, setSent] = useState<{ key: number; name: string; said: Said }[]>([]);
  const answers = useRef(new Map<number, (r: SongSent) => void>());
  const paced = useRef<{ at: number; bytes: number }[]>([]);
  const busy = useRef(false);
  const screen = (room?.screens ?? 0) > 0;
  const ended = v.phase === "end";

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

  return (
    <section className="djk-send" aria-label={zh ? "从手机传歌" : "Songs from this phone"}>
      <button type="button" className="btn btn-ghost btn-block" disabled={!screen || ended || queue.length >= QUEUE_MAX} onClick={() => pick.current?.click()}>
        <Upload size={18} aria-hidden="true" />
        {zh ? "从手机传歌" : "Send a song from this phone"}
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
      <p className="djk-send-note">
        {!screen
          ? zh
            ? "电视那台设备没开着，开了才能传"
            : "The TV isn't on. Songs can go once it is"
          : zh
            ? "手机里的歌（MP3、M4A 这些）传到电视上，加进歌单，轮到就放整首。不存到网上，会员下载的加密歌放不了。"
            : "A song on this phone (MP3, M4A and the like) goes to the TV and onto the playlist, played whole when its turn comes. Nothing is saved online; protected downloads from music apps can't be played."}
      </p>
      {now && (
        <p className="djk-send-now" role="status">
          {now.listening ? (zh ? `电视正在听：${now.name}` : `The TV is listening: ${now.name}`) : zh ? `正在传 ${pct}%：${now.name}` : `Sending ${pct}%: ${now.name}`}
          {more > 0 && (zh ? `，还有 ${more} 首` : `, ${more} more`)}
        </p>
      )}
      {sent.length > 0 && (
        <ul className="djk-send-done">
          {sent.map((s) => (
            <li key={s.key} className={s.said === "added" || s.said === "there" ? "is-ok" : ""}>
              <span className="djk-send-name">{s.name}</span>
              <span>{L(SAID[s.said])}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
