import { Feather, Plus, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "../../account/AccountContext";
import { Sheet } from "../../components/Sheet";
import { KINDS, type DramaKind, type DramaLevel } from "../../data/drama";
import type { T } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { cleanScene, SCENE_LIMITS as L } from "../../shared/dramaScene";
import type { DramaView, SeatView } from "../../shared/protocol";
import { useStore } from "../../store";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { ToastProvider, useToast } from "../../ui/Toast";

type RoleDraft = { name: string; brief: string; alibi: string };
export type Draft = { title: string; setup: string; kind: DramaKind; level: DramaLevel; roles: RoleDraft[]; culprit: string; culpritCard: string; twist: string };

const blankRole = (): RoleDraft => ({ name: "", brief: "", alibi: "" });
const fresh = (level: DramaLevel): Draft => ({ title: "", setup: "", kind: "family", level, roles: [blankRole(), blankRole(), blankRole()], culprit: "", culpritCard: "", twist: "" });
const KEY = "changle.drama.draft";

function loadDraft(level: DramaLevel): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Draft | null;
    if (d && typeof d.title === "string" && Array.isArray(d.roles)) return d;
  } catch {
    /* none */
  }
  return fresh(level);
}

const ERRORS: Record<string, T> = {
  title: { zh: "给剧本起个名字", en: "Give it a title" },
  setup: { zh: "写一句发生了什么", en: "Say what happened" },
  roles: { zh: "至少要两个有名字的角色", en: "It needs at least two named roles" },
  culprit: { zh: "坏人叫什么？比如小三、凶手、内鬼", en: "What's the culprit called? The cheat, the killer, the mole..." },
  card: { zh: "写一下坏人干了什么", en: "Say what the culprit did" },
  bad: { zh: "没写好，再看看", en: "Something's missing" },
};

type Mine = { id: number; title: T; status: "new" | "live" | "no"; at: number };

/**
 * Writing a scene: what happened, two to four roles (a secret each, or one is dealt), who the
 * culprit is and what they did, and a twist if you like. It goes to this table (played next,
 * with you on stage), and, signed in, to the public library for the site's owner to approve.
 * `writers`: on one phone, who is writing (they'll be cast in it).
 */
type SceneWriterProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (scene: Draft, by?: string) => void;
  level: DramaLevel;
  writers?: { id: string; name: string }[];
};

export function SceneWriter(props: SceneWriterProps) {
  return <ToastProvider><Writer {...props} /></ToastProvider>;
}

function Writer({
  open,
  onClose,
  onAdd,
  level,
  writers,
}: SceneWriterProps) {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const { me, openSignIn } = useAccount();
  const [d, setD] = useState<Draft>(() => loadDraft(level));
  const [by, setBy] = useState(writers?.[0]?.id ?? "");
  const [share, setShare] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [mineFailed, setMineFailed] = useState(false);
  const [mineLoading, setMineLoading] = useState(false);

  // the draft survives closing the sheet (and the phone locking)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* fine */
    }
  }, [d]);

  const loadMine = useCallback(async (signal?: AbortSignal) => {
    if (!me) return;
    setMine(null);
    setMineFailed(false);
    setMineLoading(true);
    try {
      const r = await api<{ scenes: Mine[] }>("/scenes/mine", { signal });
      if (!signal?.aborted) setMine(r.scenes);
    } catch {
      if (!signal?.aborted) setMineFailed(true);
    } finally {
      if (!signal?.aborted) setMineLoading(false);
    }
  }, [me?.id]);
  useEffect(() => {
    const ctl = new AbortController();
    if (open) {
      setError("");
      setNote("");
      void loadMine(ctl.signal);
    }
    return () => ctl.abort();
  }, [open, loadMine]);

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setRole = (i: number, p: Partial<RoleDraft>) => setD((x) => ({ ...x, roles: x.roles.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const tx = (x: T) => (zh ? x.zh : x.en);

  const submit = async () => {
    const r = cleanScene(d);
    if ("error" in r) {
      setError(tx(ERRORS[r.error] ?? ERRORS.bad));
      return;
    }
    setBusy(true);
    setError("");
    onAdd(d, writers ? by : undefined);
    let sent = "";
    if (share && me) {
      try {
        await api("/scenes", { body: { scene: d } });
        sent = zh ? "也投给了公共剧本库：站长审核通过后，所有人都能玩到。" : "Also sent to the public library: once the owner approves it, everyone can play it.";
      } catch (e) {
        sent = e instanceof ApiError && e.code === "slow-down" ? (zh ? "今天投稿够多了，明天再投公共剧本库。" : "That's enough sending for today. Try the public library again tomorrow.") : zh ? "投稿没发出去，网不好。" : "Couldn't send it to the library. Check the connection.";
      }
    }
    setBusy(false);
    setD(fresh(d.level));
    setNote((zh ? "加好了，下一幕就演。" : "Added. It's on next.") + (sent ? ` ${sent}` : ""));
    loadMine();
  };

  const status = (s: Mine["status"]) => (s === "live" ? (zh ? "已上线" : "Live") : s === "no" ? (zh ? "没通过" : "Not this time") : zh ? "审核中" : "Waiting");

  return (
    <Sheet open={open} onClose={onClose} title={zh ? "写一个剧本" : "Write a scene"} gel="#ffcf6b">
      <form
        className="dm-writer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="hint">{zh ? "写好的剧本下一幕就演，编剧亲自上台。坏人是谁照样随机，连你也不知道。" : "Your scene is played next, with you on stage. Who's the culprit is still drawn at random, so even you won't know."}</p>

        <label className="field-label" htmlFor="dw-title">
          {zh ? "剧名" : "Title"}
        </label>
        <div className="field">
          <input id="dw-title" value={d.title} maxLength={L.title} onChange={(e) => set({ title: e.target.value })} placeholder={zh ? "比如：年夜饭上的第三个红包" : "e.g. The Third Red Envelope"} />
        </div>

        <label className="field-label" htmlFor="dw-setup">
          {zh ? "发生了什么" : "What happened"}
        </label>
        <div className="field">
          <textarea id="dw-setup" rows={3} value={d.setup} maxLength={L.setup} onChange={(e) => set({ setup: e.target.value })} placeholder={zh ? "大家都会看到这段。比如：年夜饭上，奶奶准备的红包少了一个。" : "Everyone sees this. e.g. At the New Year dinner, one of Grandma's red envelopes is missing."} />
        </div>

        <span className="field-label">{zh ? "类型" : "Kind"}</span>
        <div className="picker" role="group">
          {KINDS.map((k) => (
            <button key={k.key} type="button" className="chip" aria-pressed={d.kind === k.key} onClick={() => set({ kind: k.key })}>
              {tx(k.name)}
            </button>
          ))}
        </div>

        <span className="field-label">{zh ? "尺度" : "Spice"}</span>
        <div className="seg" role="group">
          <button type="button" aria-pressed={d.level === "all"} onClick={() => set({ level: "all" })}>
            {zh ? "全年龄" : "All ages"}
          </button>
          <button type="button" aria-pressed={d.level === "spicy"} onClick={() => set({ level: "spicy" })}>
            {zh ? "微辣" : "Spicy"}
          </button>
        </div>

        <span className="field-label">{zh ? "角色（2 到 4 个）" : "Roles (2 to 4)"}</span>
        <p className="hint dw-roles-hint">{zh ? "每个角色可以写一个小秘密，让 TA 也显得可疑；不写就随机发一个。" : "Give each role a little secret that makes them look guilty too. Leave it blank and one is dealt."}</p>
        <ol className="dw-roles">
          {d.roles.map((r, i) => (
            <li key={i} className="dw-role">
              <div className="dw-role-head">
                <span className="dw-role-n tabular">{i + 1}</span>
                <div className="field">
                  <input value={r.name} maxLength={L.name} onChange={(e) => setRole(i, { name: e.target.value })} placeholder={zh ? "角色名，比如：奶奶" : "Role, e.g. Grandma"} aria-label={zh ? `角色 ${i + 1} 的名字` : `Role ${i + 1} name`} />
                </div>
                {d.roles.length > 2 && (
                  <button type="button" className="icon-btn" aria-label={zh ? "去掉这个角色" : "Remove this role"} onClick={() => set({ roles: d.roles.filter((_, j) => j !== i) })}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="field">
                <input value={r.brief} maxLength={L.brief} onChange={(e) => setRole(i, { brief: e.target.value })} placeholder={zh ? "大家都知道的（可不写）" : "What everyone knows (optional)"} aria-label={zh ? "大家都知道的" : "What everyone knows"} />
              </div>
              <div className="field">
                <input value={r.alibi} maxLength={L.alibi} onChange={(e) => setRole(i, { alibi: e.target.value })} placeholder={zh ? "TA 的小秘密（可不写）" : "Their little secret (optional)"} aria-label={zh ? "小秘密" : "Little secret"} />
              </div>
            </li>
          ))}
        </ol>
        {d.roles.length < 4 && (
          <button type="button" className="btn btn-ghost btn-sm dw-add" onClick={() => set({ roles: [...d.roles, blankRole()] })}>
            <Plus size={15} /> {zh ? "再加一个角色" : "Add a role"}
          </button>
        )}

        <label className="field-label" htmlFor="dw-culprit">
          {zh ? "坏人叫什么" : "The culprit is called"}
        </label>
        <div className="field">
          <input id="dw-culprit" value={d.culprit} maxLength={L.culprit} onChange={(e) => set({ culprit: e.target.value })} placeholder={zh ? "小三、凶手、内鬼……" : "The cheat, the killer, the mole..."} />
        </div>

        <label className="field-label" htmlFor="dw-card">
          {zh ? "坏人干了什么" : "What the culprit did"}
        </label>
        <div className="field">
          <textarea id="dw-card" rows={3} value={d.culpritCard} maxLength={L.card} onChange={(e) => set({ culpritCard: e.target.value })} placeholder={zh ? "只有拿到坏人牌的人能看到。比如：红包是你拿的，就在你兜里。千万别承认。" : "Only whoever is dealt the culprit's card sees this. e.g. You took the envelope. It's in your pocket. Never admit it."} />
        </div>

        <label className="field-label" htmlFor="dw-twist">
          {zh ? "剧情反转（可不写）" : "Plot twist (optional)"}
        </label>
        <div className="field">
          <textarea id="dw-twist" rows={2} value={d.twist} maxLength={L.twist} onChange={(e) => set({ twist: e.target.value })} placeholder={zh ? "演到一半弹出来。不写就随机一个。" : "It lands halfway through. Blank: one is drawn for you."} />
        </div>

        {writers && writers.length > 1 && (
          <>
            <span className="field-label">{zh ? "谁写的（TA 会上台）" : "Who wrote it (they'll be on stage)"}</span>
            <div className="picker" role="group">
              {writers.map((w) => (
                <button key={w.id} type="button" className="chip" aria-pressed={by === w.id} onClick={() => setBy(w.id)}>
                  {w.name}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="pf-check dw-share">
          <input type="checkbox" checked={share && !!me} disabled={!me} onChange={(e) => setShare(e.target.checked)} />
          <span>
            {zh ? "也投给公共剧本库：站长审核通过后，所有人都能玩到，署你的名字。" : "Also send it to the public library: once the site's owner approves it, everyone can play it, with your name on it."}
            {!me && (
              <>
                {" "}
                <button type="button" className="link-btn" onClick={() => openSignIn()}>
                  {zh ? "登录后才能投稿" : "Sign in to send it"}
                </button>
              </>
            )}
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}
        {note && <p className="dw-note" role="status">{note}</p>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          <Send size={17} /> {zh ? "加到这一桌" : "Add it to this table"}
        </button>

        {me && (mineFailed || mineLoading || !!mine?.length) && (
          <section className="dw-mine">
            <span className="field-label">{zh ? "我投过的剧本" : "Scenes I've sent"}</span>
            {mineFailed && <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void loadMine() }} />}
            {mineLoading && <Skeleton lang={lang} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />}
            <ul>
              {mine?.map((m) => (
                <li key={m.id}>
                  <span className="dw-mine-title">{tx(m.title)}</span>
                  <span className={`dw-status is-${m.status}`}>{status(m.status)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={zh ? "删掉这个投稿" : "Delete this one"}
                    onClick={() => {
                      void api(`/scenes/${m.id}`, { method: "DELETE" })
                        .then(() => loadMine(), () => toast(zh ? "没成功，再试一次" : "That didn't go through. Try again"));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </Sheet>
  );
}

/**
 * On the setup screen (and between scenes): the scenes written at this table, a button to write
 * one, and how many from the public library are mixed in.
 */
export function TableScenes({ v, me, isHost, nameOf, onWrite, onRemove, library }: { v: DramaView; me: string; isHost: boolean; nameOf: (pid: string) => string; onWrite: () => void; onRemove: (id: string) => void; library?: { loading: boolean; failed: boolean; retry: () => void } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const waiting = v.mine.filter((w) => !w.played);
  return (
    <section className="dm-written">
      <div className="dm-written-head">
        <strong>{zh ? "自己写的剧本" : "Your own scenes"}</strong>
        <button type="button" className="btn btn-moon btn-sm" onClick={onWrite}>
          <Feather size={15} /> {zh ? "写一个" : "Write one"}
        </button>
      </div>
      {waiting.length ? (
        <ul>
          {waiting.map((w) => (
            <li key={w.id}>
              <span className="dm-written-title">{zh ? w.title.zh : w.title.en}</span>
              <span className="hint">{w.by ? (zh ? `${nameOf(w.by)} 写的` : `by ${nameOf(w.by)}`) : ""}</span>
              {(w.by === me || isHost) && (
                <button type="button" className="icon-btn" aria-label={zh ? "撤回" : "Take it back"} onClick={() => onRemove(w.id)}>
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{zh ? "写好的剧本下一幕先演，编剧亲自上台。" : "A scene written here is played next, with its writer on stage."}</p>
      )}
      {v.lib > 0 && <p className="hint">{zh ? `还会混进 ${v.lib} 个大家投稿的剧本。` : `Plus ${v.lib} scenes from the public library, mixed in.`}</p>}
      {library?.loading && <Skeleton lang={lang} lines={3} slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />}
      {library?.failed && <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: library.retry }} />}
    </section>
  );
}

/**
 * The public library: a dozen approved scenes in this language, a few at a time so each
 * message stays small for the table. A scene by someone sitting here is marked as theirs (they'll be on stage in it).
 */
export async function loadLibrary(lang: "zh" | "en", seats: SeatView[] = [], signal?: AbortSignal): Promise<unknown[][]> {
  const r = await api<{ scenes: { id: number; uid: string; name: string; scene: unknown }[] }>(`/scenes?lang=${lang}&n=12`, { signal });
  const list = r.scenes.map((x) => ({ id: x.id, name: x.name, scene: x.scene, by: seats.find((s) => s.uid && s.uid === x.uid)?.id }));
  const chunks: unknown[][] = [];
  // (a table takes messages up to 32,000 characters: three scenes at a time stay well under)
  for (let i = 0; i < list.length; i += 3) chunks.push(list.slice(i, i + 3));
  return chunks;
}
