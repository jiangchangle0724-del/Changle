import { Crown } from "lucide-react";
import type { Lang } from "../i18n";

/** A member's mark beside their face or name (docs/membership.md): a small crown on amber. */
export function MemberMark({ lang, className = "" }: { lang: Lang; className?: string }) {
  const label = lang === "zh" ? "会员" : "Member";
  return (
    <span className={`member-mark ${className}`} role="img" aria-label={label} title={label}>
      <Crown size={11} strokeWidth={2.6} aria-hidden="true" />
    </span>
  );
}
