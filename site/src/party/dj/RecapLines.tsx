import { useRoom } from "../../online/RoomContext";
import type { DjView } from "../../shared/protocol";
import { reqLine } from "./deck/words";
import { STYLE_NAMES } from "./parts";
import { recapOf } from "./recap";
import { useDjNames } from "./names";

/** How many songs the recap names (the rest are counted). */
const SONGS_NAMED = 4;

/**
 * 今晚回顾, the night's recap, as lines: the TV's end card and the phones show the same (a phone
 * adds the player's own line above). A song a player typed stays theirs: the others read only who
 * asked for one.
 */
export function RecapLines({ v, zh, line, note }: { v: DjView; zh: boolean; line: string; note: string }) {
  const { now } = useRoom();
  const nameOf = useDjNames(zh);
  const r = recapOf(v, now());
  const styleName = (s: (typeof r.styles)[number]["style"]) => (s === "mine" ? (zh ? "主人的歌" : "The host's songs") : zh ? STYLE_NAMES[s].zh : STYLE_NAMES[s].en);
  const sep = zh ? "、" : ", ";
  const songs = r.songs.slice(-SONGS_NAMED).map((x) => reqLine(x, nameOf(x.by), zh));
  const more = r.songs.length - songs.length;
  return (
    <>
      <p className={`${line} tabular`}>{zh ? `放了 ${r.minutes} 分钟，🔥 一共 ${r.fires} 次` : `${r.minutes} ${r.minutes === 1 ? "minute" : "minutes"} of music, ${r.fires} 🔥 in all`}</p>
      {r.styles.length > 0 && (
        <p className={line}>
          {zh ? "放得最久：" : "Played most: "}
          {r.styles.map((s) => (zh ? `${styleName(s.style)} ${s.minutes} 分钟` : `${styleName(s.style)} ${s.minutes} min`)).join(" · ")}
        </p>
      )}
      {songs.length > 0 && (
        <p className={line}>
          {zh ? `点歌放了 ${r.songs.length} 首：` : `${r.songs.length} ${r.songs.length === 1 ? "song" : "songs"} asked for played: `}
          {songs.join(zh ? "，" : "; ")}
          {more > 0 && (zh ? `，还有 ${more} 首` : `, and ${more} more`)}
        </p>
      )}
      {r.fans.length > 0 && (
        <p className={line}>
          {zh ? "最嗨：" : "Most fired up: "}
          {r.fans.map((f) => (zh ? `${nameOf(f.pid)} 🔥 ${f.n}` : `${nameOf(f.pid)} (🔥 ${f.n})`)).join(sep)}
        </p>
      )}
      {r.perfect.length > 0 && (
        <p className={line}>
          {zh ? "完美 Drop：" : "Perfect drops: "}
          {r.perfect.map((f) => (zh ? `${nameOf(f.pid)} ${f.n} 次` : `${nameOf(f.pid)} ×${f.n}`)).join(sep)}
        </p>
      )}
      {r.onBeat && (
        <p className={line}>
          {zh ? `跳得最准：${nameOf(r.onBeat.pid)}，${Math.round(r.onBeat.share * 100)}% 踩在拍子上` : `Best on the beat: ${nameOf(r.onBeat.pid)}, ${Math.round(r.onBeat.share * 100)}% of beats`}
          {r.mostDanced && r.mostDanced.pid !== r.onBeat.pid && (zh ? ` · 跳得最多：${nameOf(r.mostDanced.pid)}，${r.mostDanced.hits} 拍` : ` · Danced the most: ${nameOf(r.mostDanced.pid)}, ${r.mostDanced.hits} beats`)}
        </p>
      )}
      {v.speaker && v.speaker.seconds > 0 && (
        <p className={note}>{r.stalls === 0 ? (zh ? "今晚声音一直没断" : "The sound never broke tonight") : zh ? `今晚声音卡了 ${r.stalls} 次` : `The sound stalled ${r.stalls} ${r.stalls === 1 ? "time" : "times"} tonight`}</p>
      )}
    </>
  );
}
