import { CreditCard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../store";
import { useToast } from "../ui/Toast";

type Status = { mode: "test" | "live"; prices: Record<"month" | "year" | "life", boolean>; portal: boolean; hook: boolean; tax: boolean; ready: boolean };
type Reply = { key: boolean; status: Status | null };

/**
 * 付款 in the back office, above 会员 (worker/stripe.ts): whether Stripe's key is in, test or live,
 * and one button that makes what's missing in Stripe (the prices, the billing page, the webhook).
 */
export function AdminStripe() {
  const toast = useToast();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [data, setData] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Reply>("/admin/stripe"));
    } catch {
      setData(null);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const why = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "";
    if (code === "no-key" || code === "bad-key") return zh ? "钥匙不对：要 sk_ 或 rk_ 开头的" : "That key isn't right: it starts with sk_ or rk_";
    if (code === "stripe-key") return zh ? "Stripe 不认这把钥匙，可能过期或者被换掉了" : "Stripe doesn't accept this key; it may have been rolled";
    if (code === "stripe-permission") return zh ? "这把钥匙权限不够，见 docs/membership.md 的权限清单" : "This key can't do that; see the permissions in docs/membership.md";
    return zh ? "没连上 Stripe，再试一次" : "Couldn't reach Stripe. Try again";
  };
  const setup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<Reply>("/admin/stripe/setup", { body: {} });
      setData(r);
      toast(r.status?.ready ? (zh ? "付款设置好了" : "Payments are set up") : zh ? "还差一点，看下面" : "Not all there yet; see below");
    } catch (e) {
      toast(why(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const s = data.status;
  const yes = (v: boolean) => (v ? "✓" : "✗");
  return (
    <div className="adm-pay">
      <h3 className="adm-pay-h">
        <CreditCard size={17} aria-hidden="true" /> {zh ? "付款（Stripe）" : "Payments (Stripe)"}
      </h3>
      {!data.key ? (
        <p className="hint">{zh ? "还没放钥匙：Cloudflare 里 changle-rooms 的 STRIPE_SECRET_KEY。" : "No key yet: STRIPE_SECRET_KEY on changle-rooms in Cloudflare."}</p>
      ) : !s ? (
        <p className="hint">{why(new ApiError(400, "bad-key"))}</p>
      ) : (
        <>
          <p className="hint">
            {s.mode === "test"
              ? zh
                ? "测试模式（沙盒）：只有你和管理员看得见付款按钮，用测试卡，不扣真钱。"
                : "Test mode (sandbox): only you and the admins see the buy buttons; test cards, no real money."
              : zh
                ? "正式模式：所有人都能买。"
                : "Live: anyone can buy."}
            {s.ready ? (zh ? " 已经开通。" : " Open.") : zh ? " 还没设置好。" : " Not set up yet."}
          </p>
          <p className="hint tabular">
            {zh
              ? `价格 月 ${yes(s.prices.month)} 年 ${yes(s.prices.year)} 终身 ${yes(s.prices.life)} · 账单页 ${yes(s.portal)} · 付款通知 ${yes(s.hook)} · 税 ${s.tax ? "开" : "关"}`
              : `Prices month ${yes(s.prices.month)} year ${yes(s.prices.year)} life ${yes(s.prices.life)} · Billing page ${yes(s.portal)} · Webhook ${yes(s.hook)} · Tax ${s.tax ? "on" : "off"}`}
          </p>
          <button type="button" className={`btn btn-sm ${s.ready ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => void setup()}>
            {busy ? (zh ? "正在设置" : "Setting up") : s.ready ? (zh ? "再检查一遍" : "Check again") : zh ? "设置付款" : "Set up payments"}
          </button>
        </>
      )}
    </div>
  );
}
