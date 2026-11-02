import { FolderOpen, Music2, Plus, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import type { DjView } from "../../../shared/protocol";
import { useStore } from "../../../store";
import type { useBooth } from "../useBooth";
import type { NotAdded } from "./crate";

type Booth = ReturnType<typeof useBooth>;

const WHY: Record<NotAdded, { zh: string; en: string }> = {
  kind: { zh: "不是歌的文件", en: "Not a sound file" },
  short: { zh: "太短，不到 45 秒", en: "Too short, under 45 seconds" },
  long: { zh: "太长，超过 15 分钟", en: "Too long, over 15 minutes" },
  unreadable: { zh: "放不了，可能是加密的会员歌", en: "Can't be played, maybe a protected download" },
};

/**
 * 打碟 · DJ Booth on the big screen: the host's own songs (Steve's ask on Nov 2). Files or a folder
 * from this computer, listened to here (nothing is uploaded); then the night plays them instead of
 * the stand-in, beat-matched, and the phones ask for them by name.
 */
export function LocalPanel({ booth, v }: { booth: Booth; v: DjView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const n = booth.crate.length;
  const on = booth.wantLocal && n > 0;
  const add = (list: FileList | File[] | null) => {
    if (list && list.length) booth.addFiles(Array.from(list));
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };
  return (
    <>
      <button type="button" className={`dj-local-btn ${on ? "is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Music2 size={24} aria-hidden="true" />
        {zh ? "我的歌" : "My songs"}
        {n > 0 && <span className="tabular"> · {n}</span>}
      </button>
      {open && (
        <div
          className={`dj-local ${over ? "is-over" : ""}`}
          role="dialog"
          aria-label={zh ? "我的歌" : "My songs"}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <div className="dj-local-head">
            <h2>{zh ? "用你自己的歌" : "Play your own songs"}</h2>
            <button type="button" className="dj-local-x" onClick={() => setOpen(false)} aria-label={zh ? "关上" : "Close"}>
              <X size={24} aria-hidden="true" />
            </button>
          </div>
          <p className="dj-local-note">
            {zh
              ? "选这台电脑里的歌（MP3、M4A、WAV 这些），只在这里放，不上传。DJ 会听出每首的速度，下一首调速对上拍子，Drop 的时候切进它最响的那段。会员下载的歌是加密的，放不了。"
              : "Pick songs on this computer (MP3, M4A, WAV and the like). They play here and aren't uploaded. The DJ hears each one's tempo, matches the next to the beat, and a drop lands on its loudest part. Protected downloads from music apps can't be played."}
          </p>
          <div className="dj-local-add">
            <button type="button" className="tv-btn" onClick={() => files.current?.click()}>
              <Plus size={24} aria-hidden="true" />
              {zh ? "选歌" : "Choose songs"}
            </button>
            <button type="button" className="tv-btn" onClick={() => folder.current?.click()}>
              <FolderOpen size={24} aria-hidden="true" />
              {zh ? "选一个文件夹" : "Choose a folder"}
            </button>
            <input ref={files} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.aif,.aiff,.flac,.ogg,.opus" hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
            <input
              ref={folder}
              type="file"
              multiple
              hidden
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => (add(e.target.files), (e.target.value = ""))}
            />
          </div>
          <p className="dj-local-drop">{zh ? "也可以把歌直接拖到这里" : "Or drop songs here"}</p>
          {booth.adding && (
            <p className="dj-local-busy" role="status">
              {zh ? `正在听 ${booth.adding.done + 1}/${booth.adding.total}：${booth.adding.name}` : `Listening ${booth.adding.done + 1}/${booth.adding.total}: ${booth.adding.name}`}
            </p>
          )}
          {n > 0 && (
            <ol className="dj-local-list">
              {booth.crate.map((s) => (
                <li key={s.id}>
                  <span className="dj-local-t">{s.title}</span>
                  {s.artist && <span className="dj-local-a">{s.artist}</span>}
                  <span className="dj-local-bpm tabular">{s.beat.sure < 0.2 ? (zh ? "节拍不明显" : "No clear beat") : `${Math.round(s.beat.bpm)} BPM`}</span>
                </li>
              ))}
            </ol>
          )}
          {booth.failed.length > 0 && (
            <ul className="dj-local-failed">
              {booth.failed.slice(-4).map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.name}: {zh ? WHY[f.why].zh : WHY[f.why].en}
                </li>
              ))}
            </ul>
          )}
          <div className="dj-local-go">
            {on ? (
              <button type="button" className="tv-btn" onClick={() => booth.setWantLocal(false)}>
                {zh ? "换回试音版 DJ" : "Back to the sound-check DJ"}
              </button>
            ) : (
              <button type="button" className="tv-btn tv-btn-main" disabled={n === 0} onClick={() => booth.setWantLocal(true)}>
                {zh ? "用我的歌放" : "Play my songs"}
              </button>
            )}
            {n > 0 && !on && (
              <button type="button" className="tv-btn" onClick={booth.clearSongs}>
                {zh ? "清空" : "Clear"}
              </button>
            )}
          </div>
          <p className="dj-local-state" role="status">
            {v.source === "local" ? (zh ? "正在放你的歌" : "Playing your songs") : on ? (v.phase === "wait" ? (zh ? "开始派对就放你的歌" : "Your songs play when the party starts") : zh ? "马上换成你的歌" : "Switching to your songs") : ""}
          </p>
        </div>
      )}
    </>
  );
}
