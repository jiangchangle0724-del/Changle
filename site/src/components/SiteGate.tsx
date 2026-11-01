import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "../account/AccountContext";
import { API } from "../config";
import type { SiteNotice } from "../lib/api";
import { useStore } from "../store";

/**
 * The owner can pause the whole site, and ban a phone. Every phone asks now and then whether the
 * site is open (and hears it at once through the live socket when signed in); a paused site shows
 * everyone a closed sign instead of the app, except the owner, who sees a strip saying so.
 */
export function useSiteState() {
  const [paused, setPaused] = useState(false);
  const [banned, setBanned] = useState(false);
  useEffect(() => {
    let dead = false;
    const check = () =>
      fetch(`${API}/status`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ paused?: boolean }>) : null))
        .then((d) => {
          if (!dead && d) setPaused(!!d.paused);
        })
        .catch(() => {});
    void check();
    const id = window.setInterval(() => document.visibilityState === "visible" && void check(), 60_000);
    const vis = () => document.visibilityState === "visible" && void check();
    const on = (e: Event) => {
      const n = (e as CustomEvent<SiteNotice>).detail;
      if (n === "paused") setPaused(true);
      if (n === "open") setPaused(false);
      if (n === "banned") setBanned(true);
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("changle:site", on);
    return () => {
      dead = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("changle:site", on);
    };
  }, []);
  return { paused, banned };
}

/** The closed sign (paused), or the door shut for good (banned). */
export function ClosedSign({ kind, onSignIn }: { kind: "paused" | "banned"; onSignIn?: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="screen notice-screen closed-sign" role="alert">
      <div className="notice-body">
        <svg viewBox="-40 -40 80 80" width={112} height={112} aria-hidden="true" className="notice-ring">
          <circle r={30} fill="none" stroke="var(--line)" strokeWidth={5} />
          <circle r={30} fill="none" stroke={kind === "banned" ? "var(--stop)" : "var(--gel-amber)"} strokeWidth={5} strokeLinecap="round" strokeDasharray="190 0" className="notice-arc" />
        </svg>
        <p className="notice-title">
          {kind === "paused" ? (zh ? "changle 暂停中" : "changle is closed for now") : zh ? "这个账号或这台手机已被停用" : "This account or phone has been blocked"}
        </p>
        <p className="hint" style={{ textAlign: "center" }}>
          {kind === "paused" ? (zh ? "站长在整理，过一会儿再来。" : "The owner is tidying up. Come back in a while.") : zh ? "有问题请联系站长。" : "Ask the site's owner if you think this is a mistake."}
        </p>
        {kind === "paused" && onSignIn && (
          <button type="button" className="link-btn" onClick={onSignIn}>
            {zh ? "站长登录" : "Owner sign-in"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Wraps the app: the closed sign while paused (for everyone but the owner), a strip for the owner. */
export function SiteGate({ children, signIn }: { children: ReactNode; signIn: ReactNode }) {
  const { paused, banned } = useSiteState();
  const { me, status, openSignIn } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const master = status === "in" && !!me?.master;
  if (banned && !master)
    return <ClosedSign kind="banned" />;
  if (paused && !master)
    return (
      <>
        <ClosedSign kind="paused" onSignIn={() => openSignIn()} />
        {signIn}
      </>
    );
  return (
    <>
      {paused && master && (
        <a className="paused-strip" href="#/admin">
          {zh ? "全站暂停中，只有你能用。去后台恢复" : "The site is paused. Only you can use it. Reopen it in the back office"}
        </a>
      )}
      {children}
      {signIn}
    </>
  );
}
