import { ChevronRight, Crown } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { Lang } from "../i18n";
import { api } from "../lib/api";
import { leftText, tierName, untilText } from "../member/words";
import type { Standing } from "../shared/member";
import type { SelfUser } from "./AccountContext";

/** On your page: your membership and when it ends, or the free uses you have left; both lead to /member. */
export function MemberRow({ me, lang }: { me: SelfUser; lang: Lang }) {
  const zh = lang === "zh";
  const [standing, setStanding] = useState<Standing | null>(null);
  useEffect(() => {
    if (me.member || me.master) return;
    const stop = new AbortController();
    api<{ standing: Standing }>("/me/member", { signal: stop.signal })
      .then((r) => setStanding(r.standing))
      .catch(() => {});
    return () => stop.abort();
  }, [me.member, me.master]);
  const title = me.member ? `${zh ? "会员" : "Member"} · ${tierName(me.member.tier, lang)}` : me.master ? (zh ? "站长：工具不限次" : "Owner: tools without limit") : zh ? "开会员" : "Become a member";
  const sub = me.member
    ? untilText(me.member.until, lang)
    : me.master
      ? zh
        ? "看会员页"
        : "See the member page"
      : standing
        ? leftText(standing.left, lang)
        : zh
          ? "随便、两清、MoneyLens 各送 3 次"
          : "3 free uses each of Whatever's Fine, All Square and MoneyLens";
  return (
    <a className="me-3d me-member" href="/member" style={{ "--gel": "var(--gel-amber)" } as CSSProperties}>
      <span className="me-3d-icon" aria-hidden="true">
        <Crown size={20} />
      </span>
      <span className="me-3d-text">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  );
}
