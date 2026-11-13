import { Hand, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { DjView, ReqView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { songName } from "../deck/words";

/** What a phone tells the room: the game action `{ x, ...data }`. */
export type G = (x: string, data?: Record<string, unknown>) => void;

/**
 * The player on every phone (Steve on Nov 12: "手机上点完歌后可以直接在玩家手机上一键播放，切歌，暂停，
 * 上一曲"): what the TV plays now and what comes next, then 上一曲, 暂停 or 播放, and 切歌, for anyone at
 * the table; the video over the whole TV; and a word when the TV wants a tap on its video (an
 * iPhone's YouTube player, the night's first song). The shared phone has it too (SharedSongs.tsx,
 * `me` its SHARED_BY): the room takes those from the speaker only.
 */
export function Player({ v, me, g, zh, nameOf }: { v: DjView; me: string; g: G; zh: boolean; nameOf: (pid: string) => string }) {
  const d = v.deck;
  const live = v.phase !== "wait" && v.phase !== "end";
  const paused = !!d.paused;
  const song = d.song;
  // the song playing whole (the night's list has it last), or the one the switch is going into
  const cur: ReqView | null = song && d.heard.at(-1)?.id === song.id ? d.heard.at(-1)! : null;
  const coming = !song && d.drop && d.up ? d.up : null;
  const by = song?.by ?? coming?.by ?? null;
  const nameIn = (r: ReqView | null) => (r ? (songName(r, zh) ?? (r.yt ? (zh ? "一首 YouTube 上的歌" : "A song from YouTube") : zh ? "一首歌" : "A song")) : null);
  const whose = (pid: string) => (pid === me ? (zh ? "你点的" : "Yours") : zh ? `${nameOf(pid)} 点的` : `${nameOf(pid)}'s`);
  const kicker = !live ? (v.phase === "end" ? (zh ? "这一场结束了" : "The set is over") : zh ? "还没开始" : "Not started") : paused ? (zh ? "暂停了" : "Paused") : song ? (zh ? "电视上在放" : "On the TV") : coming ? (zh ? "马上开始" : "Coming on") : zh ? "DJ 在放" : "The DJ plays";
  const title = song ? (nameIn(cur) ?? (zh ? "一首 YouTube 上的歌" : "A song from YouTube")) : coming ? nameIn(coming) : live ? (zh ? "两首歌之间，DJ 接着放" : "Between songs, the DJ plays on") : v.phase === "end" ? (zh ? "主人可以再来一场" : "The host can start another set") : zh ? "电视上点「开始派对」就开场" : "Press Start the party on the TV";
  // a song before the one playing (none playing: the last one) to go back to
  const before = d.heard.length - (cur ? 1 : 0) > 0;
  // (a switch on its way into the next song can't be taken back)
  const moving = !!d.drop;
  const next = d.up && d.up.id !== coming?.id ? d.up : null;
  const press = (x: "play" | "pause" | "next" | "prev") => {
    haptic(12);
    g(x);
  };
  return (
    <section className={`djk-player${paused ? " is-paused" : ""}`} aria-label={zh ? "播放" : "Player"}>
      <div className="djk-player-now" aria-live="polite">
        <span className="djk-player-kicker">{kicker}</span>
        <span className="djk-player-title">{title}</span>
        {by && <span className="djk-player-by">{whose(by)}</span>}
      </div>
      <div className="djk-player-keys" role="group" aria-label={zh ? "播放控制" : "Playback"}>
        <button type="button" className="djk-key" disabled={!live || moving || !before} onClick={() => press("prev")}>
          <SkipBack size={24} aria-hidden="true" />
          <span>{zh ? "上一曲" : "Previous"}</span>
        </button>
        <button type="button" className="djk-key is-main" disabled={!live} onClick={() => press(paused ? "play" : "pause")}>
          {paused ? <Play size={30} aria-hidden="true" /> : <Pause size={30} aria-hidden="true" />}
          <span>{paused ? (zh ? "播放" : "Play") : zh ? "暂停" : "Pause"}</span>
        </button>
        <button type="button" className="djk-key" disabled={!live || moving || (!song && !d.up)} onClick={() => press("next")}>
          <SkipForward size={24} aria-hidden="true" />
          <span>{zh ? "切歌" : "Next"}</span>
        </button>
      </div>
      {live && d.tap && (
        <p className="djk-player-tap" role="status">
          <Hand size={18} aria-hidden="true" />
          {zh ? "电视上要点一下视频才出声（这个浏览器第一首歌要点一下，之后就自己放）" : "Tap the video on the TV for sound (this browser wants one tap for the first song, then it plays by itself)"}
        </p>
      )}
      {live && (
        <p className="djk-player-next">
          {next
            ? zh
              ? `下一首：${nameIn(next)} · ${whose(next.by)}${d.reqs.length ? ` · 歌单里还有 ${d.reqs.length} 首` : ""}`
              : `Up next: ${nameIn(next)} · ${whose(next.by)}${d.reqs.length ? ` · ${d.reqs.length} more on the playlist` : ""}`
            : zh
              ? "歌单空着：在下面点歌，点的歌一首接一首放"
              : "The playlist is empty: ask for songs below, they play one after another"}
        </p>
      )}
      {/* the video over the whole TV, or back in its corner (anyone at the table) */}
      {song && (
        <button type="button" className="btn btn-ghost btn-block" aria-pressed={!!v.full} onClick={() => g("full", { on: !v.full })}>
          {v.full ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
          {v.full ? (zh ? "电视上回到小窗" : "Back to the corner on the TV") : zh ? "电视上全屏看视频" : "Video over the whole TV"}
        </button>
      )}
    </section>
  );
}
