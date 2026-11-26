/**
 * 查看链接, both ends of it (Steve, 2026-11-23: on 结清, besides the picture, a link for everyone to
 * come in and see the details). Someone in the ledger sends it to the group (ViewLinkSheet); whoever
 * opens it sees the ledger as its people do, the expenses and who pays whom, and can change nothing
 * (Viewing). Its key is made from the ledger's own (invite.ts, viewKeyOf), so it is the same link
 * whoever in the ledger sends it, and the server lets it read the ledger and do nothing else
 * (tools/split/src/room/protocol.ts). Changing the ledger's key turns it off.
 */
import { Check, Copy, Eye, FileQuestion, RotateCw, Share2, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { go } from "../router";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Sheet } from "../ui/Sheet";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { expensesOf, settlement, type Ledger } from "./core";
import { viewKeyOf, viewLink, viewText } from "./invite";
import { Crew, ExpenseList, Standing } from "./LedgerPage";
import { viewNet } from "./net";
import { Bar, copyText, Sentences } from "./parts";
import { SettleView } from "./SettleView";
import { say } from "./words";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  /** the ledger's key, which the link's own is made from */
  ledgerKey: string;
  /** the server has the ledger (one started with no signal has no link until it has) */
  made: boolean;
  /** the ledger's key is being changed: the link waits for the new one (the old one's is about to stop working) */
  changing: boolean;
  /** nothing has answered lately */
  away: boolean;
  lang: Lang;
};

/**
 * The 查看链接, to send: what it is, then the buttons to copy it or (where the phone has one) send
 * it with the phone's own share sheet. As it opens the sheet tells the server about the link (again
 * the same link changes nothing there), and the buttons are there once the server has it, so a link
 * that is sent always opens.
 */
export function ViewLinkSheet({ open, onClose, ledger, ledgerKey, made, changing, away, lang }: SheetProps) {
  /** the link, once the server has it, for the key it was made from (a new key makes another) */
  const [ready, setReady] = useState<{ key: string; link: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const link = ready?.key === ledgerKey ? ready.link : null;
  useEffect(() => {
    if (!open || !made || changing) return;
    let live = true;
    setFailed(false);
    void (async () => {
      const view = await viewKeyOf(ledgerKey);
      const got = await viewNet.make(ledger.id, ledgerKey, view);
      if (!live) return;
      if (got.data) setReady({ key: ledgerKey, link: viewLink(window.location.origin, ledger.id, view) });
      else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [open, made, changing, ledgerKey, ledger.id, tries]);

  // "copied" is said on the button itself: a toast would sit behind the open sheet
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => link && setCopied((await copyText(viewText(ledger.name, link, lang))) ? "done" : "failed");
  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: ledger.name, text: say(lang, "viewLine", { name: ledger.name }), url: link });
    } catch {
      // the share sheet was closed
    }
  };
  const copyWord = say(lang, copied === "done" ? "copied" : copied === "failed" ? "copyNot" : "copyLink");
  /** what the sheet says while there is no link to send */
  const waiting = !made ? (away ? "viewLinkNotYet" : "viewLinkMaking") : failed && !link ? "viewLinkAway" : !link ? "viewLinkMaking" : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "viewLink")}
      footer={
        link ? (
          canShare ? (
            // a phone's own share sheet reaches the chat app in one step; copying is the other way
            <div className="split-pair">
              <Button tone="quiet" icon={copied === "done" ? Check : Copy} onClick={() => void copy()}>
                {copyWord}
              </Button>
              <Button icon={Share2} onClick={() => void share()}>
                {say(lang, "sendViewLink")}
              </Button>
            </div>
          ) : (
            <Button size="lg" block icon={copied === "done" ? Check : Copy} onClick={() => void copy()}>
              {copyWord}
            </Button>
          )
        ) : waiting === "viewLinkAway" ? (
          <Button tone="quiet" block icon={RotateCw} onClick={() => setTries((n) => n + 1)}>
            {say(lang, "retry")}
          </Button>
        ) : undefined
      }
    >
      <div className="split-invite split-view-link">
        <p>
          <Sentences text={say(lang, "viewLinkLead")} lang={lang} />
        </p>
        {waiting ? (
          <p className="split-invite-who" role="status">
            {say(lang, waiting)}
          </p>
        ) : (
          <p className="split-invite-who">{say(lang, "viewLinkNote")}</p>
        )}
        {/* said aloud once; the button keeps a name of its own */}
        <span className="ui-visually-hidden" role="status">
          {copied ? say(lang, copied === "done" ? "copied" : "copyFailed") : ""}
        </span>
      </div>
    </Sheet>
  );
}

/** How often an open 查看链接 reads the ledger again while it is in front (it has no live socket: the server lets it read and nothing else). */
export const LOOK_EVERY = 30_000;

type View = "list" | "settle";
type Seen = { ledger: Ledger } | "loading" | "away" | "gone";

/**
 * A 查看链接, opened: the ledger's two views as its people see them, with nothing that changes it.
 * The phone keeps nothing of it: the key stays in the address (so the same link, or the browser's
 * history, opens it again), and the ledger is read from the server as the page opens, every
 * LOOK_EVERY while it is in front, and as it comes back in front. Once read, the page keeps showing
 * it through a lost signal; a link that stops working (the key was changed, or the ledger deleted)
 * says so in its place.
 */
export function Viewing({ id, view }: { id: string; view: string }) {
  const { lang } = useStore();
  const [seen, setSeen] = useState<Seen>("loading");
  const [tab, setTab] = useState<View>("list");
  /** the latest read asked for: an earlier one that answers after it is let go */
  const asked = useRef(0);
  const look = useCallback(async () => {
    const mine = ++asked.current;
    const got = await viewNet.look(id, view);
    if (mine !== asked.current) return;
    if (got.data) setSeen({ ledger: got.data.ledger });
    // 403: the key opens nothing (changed, or never made); 404: no ledger; 400: no such key at all (a link cut short)
    else if (got.status === 403 || got.status === 404 || got.status === 400) setSeen("gone");
    else setSeen((was) => (typeof was === "object" ? was : "away"));
  }, [id, view]);
  useEffect(() => {
    void look();
    const inFront = () => document.visibilityState === "visible";
    const timer = window.setInterval(() => inFront() && void look(), LOOK_EVERY);
    const onFront = () => inFront() && void look();
    document.addEventListener("visibilitychange", onFront);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFront);
      asked.current++;
    };
  }, [look]);
  const ledger = typeof seen === "object" ? seen.ledger : null;
  const plan = useMemo(() => (ledger ? settlement(ledger) : null), [ledger]);
  const toList = () => go({ kind: "split" }, true);

  if (!ledger || !plan)
    return (
      <div className="split-page">
        <Bar lang={lang} onBack={toList} title={say(lang, "name")} />
        {seen === "loading" ? (
          <div className="split-arriving">
            <Skeleton lang={lang} shape="block" />
            <Skeleton lang={lang} lines={3} slowText={say(lang, "slow")} />
          </div>
        ) : seen === "away" ? (
          <EmptyState
            tone="error"
            icon={WifiOff}
            title={say(lang, "joinAway")}
            body={say(lang, "joinAwayBody")}
            action={{
              label: say(lang, "retry"),
              onClick: () => {
                setSeen("loading");
                void look();
              },
            }}
          />
        ) : (
          <EmptyState tone="error" icon={FileQuestion} title={say(lang, "viewGone")} body={say(lang, "viewGoneBody")} action={{ label: say(lang, "myLedgers"), onClick: toList }} />
        )}
      </div>
    );

  return (
    <div className="split-page split-viewing">
      <Bar lang={lang} onBack={toList} title={ledger.name} />
      <Tabs<View>
        label={say(lang, "views")}
        value={tab}
        onChange={setTab}
        items={[
          { key: "list", label: say(lang, "expenses"), panelId: "split-list" },
          { key: "settle", label: say(lang, "settle"), panelId: "split-settle" },
        ]}
      />
      <p className="split-sync">
        <Eye aria-hidden="true" />
        {say(lang, "viewOnly")}
      </p>
      {tab === "list" ? (
        <section className="split-panel" id="split-list" role="tabpanel" aria-labelledby="split-list-tab">
          {expensesOf(ledger).length > 0 && <Standing ledger={ledger} me={undefined} lang={lang} rollFrom={null} />}
          <Crew ledger={ledger} lang={lang} />
          <ExpenseList ledger={ledger} me={undefined} lang={lang} landed={null} onLanded={() => {}} />
        </section>
      ) : (
        <section className="split-panel" id="split-settle" role="tabpanel" aria-labelledby="split-settle-tab">
          <SettleView ledger={ledger} me={undefined} lang={lang} plan={plan} viewing />
        </section>
      )}
    </div>
  );
}
