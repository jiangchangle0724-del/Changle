import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { KINDS, type DramaScene } from "../data/drama";
import type { T } from "../i18n";
import { api } from "../lib/api";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";

type Sent = { id: number; uid: string; name: string; email: string; lang: string; status: "new" | "live" | "no"; at: number; scene: DramaScene };
type List = { waiting: Sent[]; live: Sent[]; counts: { waiting: number; live: number } };

/**
 * The back office's 戏精大赏 desk: scenes players sent in, read in full, then let on the air
 * (every table can draw them, with the writer's name) or turned down; a live one can come off.
 */
export function AdminScenes() {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [list, setList] = useState<List | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(0);
  const [showLive, setShowLive] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setList(await api<List>("/admin/scenes"));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: number, status: "live" | "no" | "new") => {
    setBusy(id);
    try {
      await api(`/admin/scenes/${id}`, { body: { status } });
      await load();
    } catch {
      toast(zh ? "没成功，再试一次" : "That didn't go through. Try again");
    } finally {
      setBusy(0);
    }
  };

  const tx = (x: T | undefined) => (x ? (zh ? x.zh : x.en) : "");
  const kind = (k: string) => tx(KINDS.find((x) => x.key === k)?.name);
  const day = (at: number) => new Date(at).toLocaleDateString(zh ? "zh-CN" : "en-CA", { month: "short", day: "numeric" });

  const card = (x: Sent, actions: "review" | "live") => (
    <article key={x.id} className="adm-scene">
      <header>
        <strong>{tx(x.scene.title)}</strong>
        <span className="hint">
          {x.name} · {x.email} · {day(x.at)}
        </span>
        <span className="adm-scene-tags">
          <span className="seat-tag">{kind(x.scene.kind)}</span>
          <span className="seat-tag">{x.scene.level === "spicy" ? (zh ? "微辣" : "Spicy") : zh ? "全年龄" : "All ages"}</span>
          <span className="seat-tag">{x.scene.diff === "hard" ? (zh ? "困难" : "Hard") : zh ? "简单" : "Easy"}</span>
          <span className="seat-tag">{x.lang === "both" ? (zh ? "中英" : "Both") : x.lang === "zh" ? (zh ? "中文" : "Chinese") : zh ? "英文" : "English"}</span>
        </span>
      </header>
      <p>{tx(x.scene.setup)}</p>
      <ul className="adm-scene-roles">
        {x.scene.roles.map((r, i) => (
          <li key={i}>
            <strong>{tx(r.name)}</strong>
            {tx(r.brief) && <span> · {tx(r.brief)}</span>}
            {tx(r.alibi) && <em>{zh ? `秘密：${tx(r.alibi)}` : `Secret: ${tx(r.alibi)}`}</em>}
          </li>
        ))}
      </ul>
      <p className="adm-scene-culprit">
        <strong>{zh ? `坏人「${tx(x.scene.culprit)}」：` : `${tx(x.scene.culprit)}: `}</strong>
        {tx(x.scene.culpritCard)}
      </p>
      {tx(x.scene.twist) && <p className="hint">{zh ? `反转：${tx(x.scene.twist)}` : `Twist: ${tx(x.scene.twist)}`}</p>}
      <div className="row adm-scene-actions">
        {actions === "review" ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm adm-danger" disabled={busy === x.id} onClick={() => void decide(x.id, "no")}>
              <X size={15} /> {zh ? "不通过" : "Turn down"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === x.id} onClick={() => void decide(x.id, "live")}>
              <Check size={15} /> {zh ? "通过上线" : "Put it on"}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={() => void decide(x.id, "no")}>
            <RotateCcw size={15} /> {zh ? "下架" : "Take it off"}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <section className="adm-scenes">
      <h2 className="adm-h">
        {zh ? "戏精大赏 · 剧本投稿" : "Drama Queens · scenes sent in"}
        {!!list?.counts.waiting && <span className="adm-badge tabular">{list.counts.waiting}</span>}
      </h2>
      {failed ? <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void load() }} /> : !list ? <Skeleton lang={lang} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} /> : !list.waiting.length && <EmptyState title={zh ? "没有等审核的剧本。" : "Nothing waiting."} />}
      {list?.waiting.map((x) => card(x, "review"))}
      {!!list?.live.length && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLive((s) => !s)}>
          {showLive ? (zh ? "收起已上线的" : "Hide the live ones") : zh ? `已上线 ${list.counts.live} 个` : `${list.counts.live} live`}
        </button>
      )}
      {showLive && list?.live.map((x) => card(x, "live"))}
    </section>
  );
}
