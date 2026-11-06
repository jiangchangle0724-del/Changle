import { Ban, LogOut, Pause, Play, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { GAME_BY_ID, isGameId } from "../games/registry";
import { api, ApiError, siteNotice } from "../lib/api";
import { setLight } from "../lib/motion";
import { useStore } from "../store";
import { useAccount, type PublicUser } from "./AccountContext";
import { AdminScenes } from "./AdminScenes";
import { AdminCards } from "../party/straightface/AdminCards";
import { Avatar, colorFor } from "./Avatar";
import "../styles/admin.css";
import { PageLoading } from "../games/GameLoading";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { ToastProvider, useToast } from "../ui/Toast";

type Where = { code: string; game: string } | null;
type Person = PublicUser & { email: string; banned: boolean; online: boolean; seen: number; master: boolean; where: Where };
type Seat = { pid: string; name: string; on: boolean; uid?: string; banned: boolean; master: boolean };
type Table = { code: string; game: string; screens: number; at: number; seats: Seat[] };
type Overview = {
  paused: boolean;
  counts: { users: number; online: number; rooms: number; guests: number };
  online: Person[];
  rooms: Table[];
  banned: { users: Person[]; devices: { device: string; name: string; at: number }[] };
};
/** what waits for a yes in the sheet */
type Ask =
  | { kind: "kick-user"; p: Person }
  | { kind: "ban-user"; p: Person }
  | { kind: "kick-seat"; code: string; s: Seat }
  | { kind: "ban-seat"; code: string; s: Seat }
  | { kind: "pause" };

const CONTROL = "#31b9ff";

/** #/admin: the owner's back office. Who is on, at which table; sign someone out, ban them; pause the whole site. */
export function AdminPage({ onBack }: { onBack: () => void }) {
  return <ToastProvider><BackOffice onBack={onBack} /></ToastProvider>;
}

function BackOffice({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const { me, status, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => setLight(CONTROL), []);

  const load = useCallback(async () => {
    try {
      setO(await api<Overview>("/admin/overview"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError && e.code === "forbidden" ? "forbidden" : "network");
    }
  }, []);

  // kept fresh while the page is open
  useEffect(() => {
    if (!me?.master) return;
    void load();
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), 8000);
    return () => window.clearInterval(id);
  }, [me?.master, load]);

  const search = async (text: string) => {
    setSearching(true);
    setSearchFailed(false);
    setFound(null);
    try {
      setFound((await api<{ users: Person[] }>(`/admin/users?q=${encodeURIComponent(text.trim())}`)).users);
    } catch {
      setSearchFailed(true);
    } finally {
      setSearching(false);
    }
  };

  const run = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      const r = await api<{ paused?: boolean }>(path, { body });
      if (path === "/admin/pause") siteNotice(r.paused ? "paused" : "open");
      setAsk(null);
      await load();
      if (found) await search(q);
    } catch {
      toast(zh ? "没成功，再试一次" : "That didn't go through. Try again");
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!ask) return;
    if (ask.kind === "kick-user") void run("/admin/kick", { uid: ask.p.id });
    if (ask.kind === "ban-user") void run("/admin/ban", { uid: ask.p.id, on: true });
    if (ask.kind === "kick-seat") void run("/admin/kick", { code: ask.code, pid: ask.s.pid });
    if (ask.kind === "ban-seat") void run("/admin/ban", { code: ask.code, pid: ask.s.pid, name: ask.s.name, on: true });
    if (ask.kind === "pause") void run("/admin/pause", { on: true });
  };

  const gameName = (g: string) => (isGameId(g) ? (zh ? GAME_BY_ID[g].name.zh : GAME_BY_ID[g].name.en) : zh ? "大厅" : "Lobby");
  const whereText = (w: Where) => (w ? `${gameName(w.game)} ${w.code}` : zh ? "在逛首页" : "Browsing");

  if (status === "loading") return <PageLoading lang={lang} />;
  if (!me?.master)
    return (
      <div className="screen adm">
        <TopBar onBack={onBack} />
        <div className="empty">
          <p>{zh ? "后台只给站长用。" : "The back office is for the site's owner."}</p>
          {!me && (
            <button type="button" className="btn btn-primary" onClick={() => openSignIn()}>
              {zh ? "登录" : "Sign in"}
            </button>
          )}
        </div>
      </div>
    );

  const personRow = (p: Person, actions = true) => (
    <li key={p.id} className="adm-row">
      <Avatar uid={p.id} name={p.name} av={p.av} ac={p.ac} size={38} />
      <div className="adm-who">
        <span className="adm-name">
          {p.name}
          {p.master && <span className="seat-tag">{zh ? "你" : "You"}</span>}
          {p.banned && <span className="seat-tag adm-tag-ban">{zh ? "已拉黑" : "Banned"}</span>}
        </span>
        <span className="adm-sub">
          {p.email}
          {p.online && <span className={`adm-where ${p.where ? "is-playing" : ""}`}>{whereText(p.where)}</span>}
        </span>
      </div>
      {actions && !p.master && (
        <div className="seat-row-actions">
          {p.banned ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run("/admin/ban", { uid: p.id, on: false })}>
              <RotateCcw size={14} /> {zh ? "解除" : "Unban"}
            </button>
          ) : (
            <>
              {p.online && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAsk({ kind: "kick-user", p })}>
                  {zh ? "踢出" : "Kick"}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm adm-danger" disabled={busy} onClick={() => setAsk({ kind: "ban-user", p })}>
                {zh ? "拉黑" : "Ban"}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );

  const paused = !!o?.paused;
  return (
    <div className="screen adm" style={{ ["--gel" as string]: CONTROL }}>
      <TopBar onBack={onBack} title={{ zh: "后台", en: "Back office" }} />

      <section className={`adm-switch ${paused ? "is-paused" : ""}`} aria-live="polite">
        <span className="adm-lamp" aria-hidden="true" />
        <div className="adm-switch-text">
          <strong>{paused ? (zh ? "全站已暂停" : "The site is paused") : zh ? "全站开放中" : "The site is open"}</strong>
          <span>{paused ? (zh ? "只有你能用。打开网站的人只看到暂停中。" : "Only you can use it. Everyone else sees a closed sign.") : zh ? "暂停后，除了你，所有人马上停下。" : "Pausing stops everyone but you, at once."}</span>
        </div>
        {paused ? (
          <button type="button" className="btn btn-primary" disabled={busy || !o} onClick={() => void run("/admin/pause", { on: false })}>
            <Play size={17} /> {zh ? "恢复开放" : "Reopen"}
          </button>
        ) : (
          <button type="button" className="btn btn-penalty" disabled={busy || !o} onClick={() => setAsk({ kind: "pause" })}>
            <Pause size={17} /> {zh ? "一键暂停" : "Pause all"}
          </button>
        )}
      </section>

      {error === "network" && <EmptyState tone="error" title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void load() }} />}

      <div className="stats">
        <div className="stat">
          <strong className="tabular">{o?.counts.online ?? "–"}</strong>
          <span>{zh ? "在线账号" : "online"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{o?.counts.guests ?? "–"}</strong>
          <span>{zh ? "桌上访客" : "guests"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{o?.counts.rooms ?? "–"}</strong>
          <span>{zh ? "开着的桌" : "tables"}</span>
        </div>
        <div className="stat">
          <strong className="tabular">{o?.counts.users ?? "–"}</strong>
          <span>{zh ? "注册" : "accounts"}</span>
        </div>
      </div>

      <AdminScenes />
      <AdminCards />

      <h2 className="adm-h">{zh ? "在线的人" : "Online now"}</h2>
      {o && !o.online.length ? <p className="hint adm-empty">{zh ? "现在没有登录的人在线。" : "Nobody signed in is online."}</p> : <ul className="adm-list">{o?.online.map((p) => personRow(p))}</ul>}

      <h2 className="adm-h">{zh ? "开着的桌" : "Tables"}</h2>
      {o && !o.rooms.length && <p className="hint adm-empty">{zh ? "现在没有桌子开着。" : "No tables open."}</p>}
      {o?.rooms.map((t) => (
        <article key={t.code} className="adm-table">
          <header className="adm-table-head">
            <span className="adm-code tabular">{t.code}</span>
            <strong>{gameName(t.game)}</strong>
            <span className="hint">{zh ? `${t.seats.filter((s) => s.on).length} 人在` : `${t.seats.filter((s) => s.on).length} here`}</span>
          </header>
          <ul className="adm-list">
            {t.seats.map((s) => (
              <li key={s.pid} className={`adm-row ${s.on ? "" : "is-away"}`}>
                <Avatar name={s.name} ac={colorFor(s.pid)} size={32} />
                <div className="adm-who">
                  <span className="adm-name">
                    {s.name}
                    {!s.uid && <span className="seat-tag">{zh ? "访客" : "Guest"}</span>}
                    {s.master && <span className="seat-tag">{zh ? "你" : "You"}</span>}
                    {!s.on && <span className="seat-tag seat-tag-away">{zh ? "暂离" : "Away"}</span>}
                    {s.banned && <span className="seat-tag adm-tag-ban">{zh ? "已拉黑" : "Banned"}</span>}
                  </span>
                </div>
                {!s.master && (
                  <div className="seat-row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAsk({ kind: "kick-seat", code: t.code, s })}>
                      {zh ? "踢出" : "Kick"}
                    </button>
                    {!s.banned && (
                      <button type="button" className="btn btn-ghost btn-sm adm-danger" disabled={busy} onClick={() => setAsk({ kind: "ban-seat", code: t.code, s })}>
                        {zh ? "拉黑" : "Ban"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}

      <h2 className="adm-h">{zh ? "找人" : "Find someone"}</h2>
      <form
        className="field adm-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <Search size={17} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "名字、邮箱或六位号" : "Name, email or handle"} enterKeyHint="search" aria-label={zh ? "找人" : "Find someone"} />
        <button type="submit" className="btn btn-moon btn-sm" disabled={searching}>
          {zh ? "找" : "Find"}
        </button>
      </form>
      {searching && <Skeleton lang={lang} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />}
      {searchFailed && <EmptyState tone="error" title={zh ? "没搜成，检查一下网络" : "The search didn't go through. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => void search(q) }} />}
      {found && (found.length ? <ul className="adm-list">{found.map((p) => personRow(p))}</ul> : <EmptyState title={zh ? "没找到。" : "No one found."} />)}

      <h2 className="adm-h">{zh ? "黑名单" : "Banned"}</h2>
      {o && !o.banned.users.length && !o.banned.devices.length && <p className="hint adm-empty">{zh ? "黑名单是空的。" : "Nobody is banned."}</p>}
      <ul className="adm-list">
        {o?.banned.users.map((p) => personRow(p))}
        {o?.banned.devices.map((d) => (
          <li key={d.device} className="adm-row">
            <span className="adm-device" aria-hidden="true">
              <Ban size={17} />
            </span>
            <div className="adm-who">
              <span className="adm-name">{d.name || (zh ? "访客" : "Guest")}</span>
              <span className="adm-sub">{zh ? "访客手机" : "Guest phone"}</span>
            </div>
            <div className="seat-row-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run("/admin/ban", { device: d.device, on: false })}>
                <RotateCcw size={14} /> {zh ? "解除" : "Unban"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={!!ask} onClose={() => setAsk(null)} title={askTitle(ask, zh)} gel={ask?.kind === "pause" || ask?.kind.startsWith("ban") ? "#ff4d6d" : CONTROL}>
        <p className="hint adm-ask">{askText(ask, zh)}</p>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setAsk(null)}>
            {zh ? "算了" : "Cancel"}
          </button>
          <button type="button" className={`btn btn-block ${ask?.kind.startsWith("kick") ? "btn-primary" : "btn-penalty"}`} disabled={busy} onClick={confirm}>
            {ask?.kind.startsWith("kick") ? <LogOut size={16} /> : ask?.kind === "pause" ? <Pause size={16} /> : <Ban size={16} />}
            {ask?.kind.startsWith("kick") ? (zh ? "踢出" : "Kick") : ask?.kind === "pause" ? (zh ? "暂停" : "Pause") : zh ? "拉黑" : "Ban"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function askTitle(a: Ask | null, zh: boolean) {
  if (!a) return "";
  if (a.kind === "pause") return zh ? "暂停全站？" : "Pause the whole site?";
  const name = "p" in a ? a.p.name : a.s.name;
  if (a.kind.startsWith("kick")) return zh ? `把 ${name} 请出去？` : `Kick ${name}?`;
  return zh ? `拉黑 ${name}？` : `Ban ${name}?`;
}

function askText(a: Ask | null, zh: boolean) {
  if (!a) return "";
  switch (a.kind) {
    case "pause":
      return zh ? "除了你，所有人马上停下，正在玩的桌子也会断开。打开网站的人只看到暂停中。随时可以恢复。" : "Everyone but you stops at once, tables included. Visitors see a closed sign. Reopen any time.";
    case "kick-user":
      return zh ? "会退出登录，也会离开所在的桌子。可以重新登录回来。" : "They're signed out and taken off their table. They can sign in again.";
    case "ban-user":
      return zh ? "账号和用过的手机都进不来了，也不能再用这个邮箱注册。随时可以在黑名单里解除。" : "Their account and their phones are shut out, and the email can't sign up again. Undo it from the banned list any time.";
    case "kick-seat":
      return zh ? "离开这桌。用桌号还能再进来。" : "Taken off this table. They can come back with the code.";
    case "ban-seat":
      return zh ? "这台手机进不了任何一桌。随时可以在黑名单里解除。" : "This phone can't sit at any table. Undo it from the banned list any time.";
  }
}
