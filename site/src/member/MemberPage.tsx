import { CalendarDays, Clock, Crown, Infinity as Forever, Store, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
import { COUNTED, FREE_USES, LIFE_SLOTS, PRICES, type Standing } from "../shared/member";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { cad, leftText, tierName, TOOL_NAMES, TOOL_USE, untilText } from "./words";
import "./member.css";

/**
 * changle.ca/member (docs/membership.md, Steve 2026-11-26): what a member gets, the three ways to
 * pay, how the free uses are counted, and where you stand. Payments open in step 2 (Stripe);
 * until then the page says so, and the owner gives memberships in the back office.
 */
export function MemberPage({ onBack }: { onBack: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const { me, status, openSignIn } = useAccount();
  const [lifeLeft, setLifeLeft] = useState<number | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);

  useEffect(() => {
    const stop = new AbortController();
    api<{ lifeLeft: number }>("/member", { signal: stop.signal })
      .then((r) => setLifeLeft(r.lifeLeft))
      .catch(() => {});
    return () => stop.abort();
  }, []);
  useEffect(() => {
    if (!me) return setStanding(null);
    const stop = new AbortController();
    api<{ standing: Standing; lifeLeft: number }>("/me/member", { signal: stop.signal })
      .then((r) => {
        setStanding(r.standing);
        setLifeLeft(r.lifeLeft);
      })
      .catch(() => {});
    return () => stop.abort();
  }, [me]);

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
        ) : me.member ? (
          <p>
            <strong>{zh ? `你是会员（${tierName(me.member.tier, lang)}）` : `You're a member (${tierName(me.member.tier, lang)})`}</strong>
            {" · "}
            {untilText(me.member.until, lang)}
          </p>
        ) : me.master ? (
          <p>
            <strong>{zh ? "站长账号：工具不限次" : "The owner's account: tools without limit"}</strong>
          </p>
        ) : (
          <p>{standing ? leftText(standing.left, lang) : zh ? "正在看你还剩几次" : "Checking your free uses"}</p>
        )}
      </section>

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
          </li>
        ))}
      </ul>
      <p className="member-soon">
        <Clock size={16} aria-hidden="true" />
        {zh ? "付款很快开通，到时候在这里直接买。" : "Payments open soon, right here."}
      </p>

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
