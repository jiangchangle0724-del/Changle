import { CalendarDays, Clock, CreditCard, Crown, FlaskConical, Infinity as Forever, Store, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";
import { go as goTo } from "../router";
import { COUNTED, FREE_USES, LIFE_SLOTS, PRICES, type Standing } from "../shared/member";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { ToastProvider, useToast } from "../ui/Toast";
import { cad, leftText, payWhy, renewText, tierName, TOOL_NAMES, TOOL_USE, untilText } from "./words";
import "./member.css";

type Plan = "month" | "year" | "life";
/** "live": anyone can buy; "test": a sandbox key, only the owner's people see the buttons; null: not open */
type PayMode = "live" | "test" | null;
type Sub = { plan: "month" | "year"; status: string; periodEnd: number | null; cancelAtEnd: boolean };
type Mine = { standing: Standing; lifeLeft: number; pay: PayMode; sub: Sub | null; billing: boolean };
/** back from Stripe's Checkout (?paid=): checking it, in, paid by a slow method, or not confirmed yet */
type Back = "checking" | "paid" | "pending" | "slow" | null;

/**
 * changle.ca/member (docs/membership.md, Steve 2026-11-26): what a member gets, the three ways to
 * pay, how the free uses are counted, and where you stand. Paying goes to Stripe's own pages
 * (worker/stripe.ts): Checkout to buy, the billing page to change a card, switch or cancel.
 */
export function MemberPage({ onBack, paid }: { onBack: () => void; paid?: string }) {
  return (
    <ToastProvider>
      <Member onBack={onBack} paid={paid} />
    </ToastProvider>
  );
}

/** `paid`: back from Stripe's Checkout with this session (/member?paid=…) */
function Member({ onBack, paid }: { onBack: () => void; paid?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const toast = useToast();
  const { me, status, openSignIn, refresh } = useAccount();
  const [lifeLeft, setLifeLeft] = useState<number | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [pay, setPay] = useState<PayMode>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [busy, setBusy] = useState<Plan | "portal" | null>(null);
  const [back, setBack] = useState<Back>(paid ? "checking" : null);

  const took = (r: Mine) => {
    setMine(r);
    setStanding(r.standing);
    setLifeLeft(r.lifeLeft);
    setPay(r.pay);
  };
  useEffect(() => {
    const stop = new AbortController();
    api<{ lifeLeft: number; pay: PayMode }>("/member", { signal: stop.signal })
      .then((r) => {
        setLifeLeft(r.lifeLeft);
        setPay((p) => p ?? r.pay);
      })
      .catch(() => {});
    return () => stop.abort();
  }, []);
  useEffect(() => {
    if (!me) return setStanding(null);
    const stop = new AbortController();
    api<Mine>("/me/member", { signal: stop.signal })
      .then(took)
      .catch(() => {});
    return () => stop.abort();
  }, [me]);

  // back from paying: asked at once (the hub checks with Stripe), then again while the payment lands
  const uid = me?.id;
  useEffect(() => {
    if (!paid || !uid) return;
    let stopped = false;
    let tries = 0;
    let timer = 0;
    const settle = (b: Back) => {
      setBack(b);
      // (the address loses ?paid=, so coming back to the page later doesn't ask again)
      goTo({ kind: "member" }, true);
    };
    const ask = async () => {
      try {
        const r = await api<Mine & { paid: boolean; pending: boolean }>(`/stripe/done?id=${encodeURIComponent(paid)}`);
        if (stopped) return;
        took(r);
        if (r.standing.member) {
          settle("paid");
          void refresh();
          return;
        }
        if (r.pending) return settle("pending");
      } catch (e) {
        if (e instanceof ApiError && e.status < 500 && e.status !== 429) return settle("slow");
      }
      if (stopped) return;
      if (++tries < 8) timer = window.setTimeout(() => void ask(), 2500);
      else settle("slow");
    };
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paid, uid, refresh]);

  const go = async (what: Plan | "portal") => {
    if (!me) return openSignIn();
    if (busy) return;
    setBusy(what);
    try {
      const body = { lang, site: location.origin, ...(what === "portal" ? {} : { plan: what }) };
      const r = await api<{ url: string }>(what === "portal" ? "/stripe/portal" : "/stripe/checkout", { body });
      // (busy stays on: the page is leaving for Stripe's)
      location.assign(r.url);
    } catch (e) {
      toast(payWhy(e instanceof ApiError ? e.code : "", lang));
      setBusy(null);
    }
  };
  const member = mine?.standing.member ?? me?.member ?? null;
  const sub = mine?.sub ?? null;
  /** the button under a plan, when buying is open */
  const action = (k: Plan) => {
    if (!pay || (k === "life" && lifeLeft === 0)) return null;
    if (!me)
      return (
        <Button tone="quiet" size="sm" block icon={UserRound} onClick={() => openSignIn()}>
          {zh ? "登录后开通" : "Sign in to join"}
        </Button>
      );
    if (member?.tier === "life") return null;
    if (k !== "life" && sub) return sub.plan === k ? <Pill tone="tool">{zh ? "你现在的方案" : "Your plan"}</Pill> : null;
    return (
      <Button tone="primary" size="sm" block onClick={() => void go(k)} disabled={busy !== null}>
        {busy === k ? (zh ? "正在打开付款页" : "Opening checkout") : k === "life" ? (zh ? "买终身" : "Buy") : zh ? "开通" : "Join"}
      </Button>
    );
  };
  const manage = pay && mine?.billing && (
    <Button tone="quiet" size="sm" icon={CreditCard} onClick={() => void go("portal")} disabled={busy !== null}>
      {busy === "portal" ? (zh ? "正在打开" : "Opening") : zh ? "管理付款" : "Manage payments"}
    </Button>
  );

  const plans = [
    { k: "month", icon: CalendarDays, price: PRICES.month, per: zh ? "每月" : "a month", line: zh ? "每月自动续，随时取消" : "Renews monthly, cancel any time", tag: null },
    { k: "year", icon: Clock, price: PRICES.year, per: zh ? "每年" : "a year", line: zh ? "等于 10 个月的钱" : "The price of 10 months", tag: zh ? "省 2 个月" : "2 months free" },
    {
      k: "life",
      icon: Forever,
      price: PRICES.life,
      per: zh ? "一次付清" : "once",
      line: zh ? `全站只有 ${LIFE_SLOTS} 个` : `Only ${LIFE_SLOTS} ever`,
      tag: lifeLeft === null ? null : lifeLeft > 0 ? (zh ? `还剩 ${lifeLeft} 个` : `${lifeLeft} left`) : zh ? "没有了" : "All taken",
    },
  ] as const;

  return (
    <div className="screen member-page">
      <TopBar title={{ zh: "会员", en: "Membership" }} onBack={onBack} />
      <header className="member-hero">
        <span className="member-hero-icon" aria-hidden="true">
          <Crown size={26} />
        </span>
        <h1>{zh ? "开会员，工具不限次" : "Members use the tools without limit"}</h1>
        <p>
          {zh
            ? `${COUNTED.map((t) => TOOL_NAMES[t].zh).join("、")}每个账号各送 ${FREE_USES} 次；会员不限次，还能在跟一单开店。玩什么一直免费。`
            : `Every account gets ${FREE_USES} free uses of each of ${COUNTED.map((t) => TOOL_NAMES[t].en).join(", ")}. Members use them without limit and can open a shop on 跟一单. What's On stays free.`}
        </p>
      </header>

      <section className="member-you" aria-live="polite">
        {status === "loading" ? null : !me ? (
          <>
            <p>{zh ? "登录以后，能看到自己还剩几次。" : "Sign in to see the free uses you have left."}</p>
            <Button tone="quiet" size="sm" icon={UserRound} onClick={() => openSignIn()}>
              {zh ? "登录 / 注册" : "Sign in or sign up"}
            </Button>
          </>
        ) : member ? (
          <>
            <p>
              <strong>{zh ? `你是会员（${tierName(member.tier, lang)}）` : `You're a member (${tierName(member.tier, lang)})`}</strong>
              {" · "}
              {untilText(member.until, lang)}
              {sub && member.tier !== "life" && ` · ${renewText(sub, lang)}`}
            </p>
            {manage}
          </>
        ) : me.master ? (
          <>
            <p>
              <strong>{zh ? "站长账号：工具不限次" : "The owner's account: tools without limit"}</strong>
            </p>
            {manage}
          </>
        ) : (
          <>
            <p>{sub?.status === "past_due" ? renewText(sub, lang) : standing ? leftText(standing.left, lang) : zh ? "正在看你还剩几次" : "Checking your free uses"}</p>
            {manage}
          </>
        )}
      </section>

      {back && (
        <p className={`member-back${back === "paid" ? " is-in" : ""}`} role="status">
          {back === "checking"
            ? zh
              ? "正在确认付款…"
              : "Checking your payment…"
            : back === "paid"
              ? zh
                ? "开通好了，欢迎！收据 Stripe 会发到你的邮箱。"
                : "You're in. Welcome! Stripe emails you the receipt."
              : back === "pending"
                ? zh
                  ? "付款交上去了。银行确认以后会员就开通，可能要几天。"
                  : "Your payment is on its way. Membership starts once the bank confirms it, which can take a few days."
                : zh
                  ? "付款还没确认。过一会儿再打开这一页看看。"
                  : "Your payment isn't confirmed yet. Open this page again in a little while."}
        </p>
      )}

      <ul className="member-plans">
        {plans.map((p) => (
          <li key={p.k} className={`member-plan member-plan-${p.k}`}>
            <span className="member-plan-icon" aria-hidden="true">
              <p.icon size={20} />
            </span>
            <div className="member-plan-text">
              <h2>{tierName(p.k, lang)}</h2>
              <p>{p.line}</p>
            </div>
            <div className="member-plan-price">
              <strong className="tabular">{cad(p.price)}</strong>
              <span>{p.per}</span>
            </div>
            {p.tag && (
              <span className="member-plan-tag">
                <Pill tone="tool">{p.tag}</Pill>
              </span>
            )}
            {pay && <div className="member-plan-go">{action(p.k)}</div>}
          </li>
        ))}
      </ul>
      {pay === "test" ? (
        <p className="member-soon member-test">
          <FlaskConical size={16} aria-hidden="true" />
          {zh
            ? "测试模式：只有站长和管理员看得见付款按钮。付款页用测试卡 4242 4242 4242 4242，日期填将来任何一天，CVC 随便填，不会真扣钱。"
            : "Test mode: only the owner and admins see these buttons. On the payment page use the test card 4242 4242 4242 4242, any future date and any CVC. No real money moves."}
        </p>
      ) : pay ? (
        <p className="member-soon">
          <CreditCard size={16} aria-hidden="true" />
          {zh ? "在 Stripe 的付款页付，卡号不经过 changle.ca。" : "You pay on Stripe's own page; your card never touches changle.ca."}
        </p>
      ) : (
        <p className="member-soon">
          <Clock size={16} aria-hidden="true" />
          {zh ? "付款很快开通，到时候在这里直接买。" : "Payments open soon, right here."}
        </p>
      )}

      <section className="member-more">
        <h2>{zh ? `免费的 ${FREE_USES} 次怎么算` : `How the ${FREE_USES} free uses count`}</h2>
        <ul>
          {COUNTED.map((t) => (
            <li key={t}>
              <strong>{zh ? TOOL_NAMES[t].zh : TOOL_NAMES[t].en}</strong>
              {zh ? `：${TOOL_USE[t].zh}算一次` : `: ${TOOL_USE[t].en} is one use`}
            </li>
          ))}
        </ul>
        <p>{zh ? "被拉进桌子、账本里的人不算次数，也不用登录。用完不再送。" : "People who join a table or a ledger are never counted and don't need to sign in. Used-up free uses don't come back."}</p>

        <h2>
          <Store size={18} aria-hidden="true" /> {zh ? "跟一单开店" : "A shop on 跟一单"}
        </h2>
        <p>{zh ? "在跟一单开店要会员，开店还是要站长审核。会员到期，店先暂停接单，续了就恢复，订单和资料都留着。" : "Opening a shop on 跟一单 needs a membership, and the owner still approves each shop. If a membership ends, the shop pauses new orders; renew and it opens again, with its orders and details kept."}</p>

        <h2>{zh ? "规则" : "The rules"}</h2>
        <ul>
          <li>{zh ? "月付和年付自动续，随时取消；取消以后用到这一期结束。" : "Monthly and yearly renew by themselves; cancel any time and keep it to the end of what you paid for."}</li>
          <li>{zh ? "退款：月付不退；年付和终身付款 7 天内可以全额退。" : "Refunds: monthly isn't refunded; yearly and lifetime are refunded in full within 7 days of paying."}</li>
          <li>{zh ? "终身：只给本人，不能转让；changle.ca 开着就一直有效。" : "Lifetime: for you alone, not transferable, for as long as changle.ca runs."}</li>
          <li>{zh ? "价钱是加元，现在不另外加税。" : "Prices are in Canadian dollars, with no tax added for now."}</li>
        </ul>
      </section>
    </div>
  );
}
