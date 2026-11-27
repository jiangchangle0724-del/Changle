import { CircleAlert, LockKeyhole, LogIn, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { api, ApiError } from "../lib/api";
import { setLight } from "../lib/motion";
import { back, go, mark } from "../router";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";
import { GameHeader } from "../ui/GameHeader";
import { Skeleton } from "../ui/Skeleton";
import "../ui/base.css";
import { AUDIENCE, MONEY, troubleOf, wayIn, type Trouble } from "./financeDoor";
// the tools' styles come with the page, not with the home page
import "../styles/tools.css";

/** ‹ goes back where you came from, or to the Tools tab when the page was opened from a link */
const leave = () => (mark()?.inSite ? back() : go({ kind: "home", tab: "tools" }, true));

/**
 * changle.ca/tools/finance: the main site's page for 心里有数 · MoneyLens, which lives on its own
 * domain. For now it is one thing only, the way in: a browser sent here by money.changle.ca with
 * a nonce (`handoff`) gets a code for whoever is signed in, and is sent back with it. Nothing has
 * to be pressed unless nobody is signed in. financeDoor.ts says why that is safe, and holds the
 * one address this page ever leaves for.
 *
 * Opened without a nonce it says what 心里有数 is and that it is not open to everyone yet. (Its
 * card on the Tools tab and the page that introduces it come later: docs/briefs/moneylens.md.)
 */
export function Finance({ handoff }: { handoff?: string }) {
  const { lang, setLang } = useStore();
  const zh = lang === "zh";
  const { me, status, openSignIn } = useAccount();
  // (kept from the first drawing: the address can change under a sheet, the nonce this page was opened with does not)
  const [nonce] = useState(handoff);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /** a code has been asked for, for the account that is signed in now: one sign-in, one code */
  const asked = useRef(false);

  useEffect(() => {
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--type-tool").trim();
    if (amber) setLight(amber);
  }, []);

  const ask = useCallback(async () => {
    if (!nonce) return;
    asked.current = true;
    setTrouble(null);
    try {
      const { code } = await api<{ code?: unknown }>("/handoff", { body: { aud: AUDIENCE, nonce } });
      const to = wayIn(code);
      // (the page that took the browser here is not one to come back to: its nonce is spent)
      if (to) window.location.replace(to);
      else setTrouble("failed");
    } catch (e) {
      const why = e instanceof ApiError ? troubleOf(e.status, e.code) : troubleOf(null);
      // (signed out after all: the next sign-in asks again by itself)
      if (why === "sign-in") asked.current = false;
      setTrouble(why);
    }
  }, [nonce]);

  // signed in (now, or already): on to MoneyLens, by itself
  useEffect(() => {
    if (nonce && status === "in" && me && !asked.current) void ask();
  }, [nonce, status, me, ask]);
  // nobody signed in: the sign-in sheet comes up by itself, once
  const offered = useRef(false);
  useEffect(() => {
    if (nonce && status === "out" && !offered.current) {
      offered.current = true;
      openSignIn(true);
    }
  }, [nonce, status, openSignIn]);

  const signIn = { label: zh ? "登录" : "Sign in", onClick: () => openSignIn(true) };
  const again = { label: zh ? "再试一次" : "Try again", onClick: () => void ask() };
  let body;
  if (!nonce)
    body = (
      <EmptyState
        icon={LockKeyhole}
        title={zh ? "心里有数还在内测" : "MoneyLens is in a closed test"}
        body={zh ? "把银行账单变成一本看得懂的账。现在只有受邀的账号进得来。" : "Bank statements, turned into a ledger you can read. For now, invited accounts only."}
        action={{ label: zh ? "打开心里有数" : "Open MoneyLens", onClick: () => window.location.assign(`${MONEY}/`) }}
      />
    );
  else if (trouble === "sign-in" || (status === "out" && !trouble))
    body = (
      <EmptyState
        icon={LogIn}
        title={zh ? "先登录 changle.ca" : "Sign in to changle.ca first"}
        body={zh ? "心里有数用你的 changle.ca 账号。登录以后会自动接着走。" : "MoneyLens uses your changle.ca account. Once you're signed in, this goes on by itself."}
        action={signIn}
      />
    );
  else if (trouble === "slow-down") body = <EmptyState tone="error" icon={CircleAlert} title={zh ? "试得太频繁了，过一分钟再试" : "Too many tries. Wait a minute, then try again"} action={again} />;
  else if (trouble === "offline") body = <EmptyState tone="error" icon={WifiOff} title={zh ? "没连上，检查一下网络" : "Couldn't connect. Check your connection"} action={again} />;
  else if (trouble === "bad-link")
    body = (
      <EmptyState
        tone="error"
        icon={CircleAlert}
        title={zh ? "这个链接用不了" : "This link doesn't work"}
        body={zh ? "从心里有数重新进一次。" : "Start again from MoneyLens."}
        action={{ label: zh ? "打开心里有数" : "Open MoneyLens", onClick: () => window.location.assign(`${MONEY}/`) }}
      />
    );
  else if (trouble === "failed") body = <EmptyState tone="error" icon={CircleAlert} title={zh ? "没成功，过一会儿再试" : "That didn't work. Try again in a moment"} action={again} />;
  else
    body = (
      <div className="finance-going" role="status">
        <p>{zh ? "正在带你去心里有数" : "Taking you to MoneyLens"}</p>
        <Skeleton lang={lang} shape="line" />
      </div>
    );

  return (
    <div className="screen tool-page ui-category-tool">
      <GameHeader title={{ zh: "心里有数", en: "MoneyLens" }} lang={lang} onBack={leave} onLang={() => setLang(lang === "zh" ? "en" : "zh")} />
      {body}
    </div>
  );
}
