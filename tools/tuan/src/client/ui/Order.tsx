// An order's own page: what was ordered, where it goes, how to pay (with the order code to put in
// the payment note), and, while the group buy is open, changing or cancelling it. It opens with
// the last four digits of the phone number it was placed with: this phone remembers them for its
// own orders, anyone else is asked.
import { useEffect, useState } from "preact/hooks";
import type { OrderPage } from "../../api";
import { BASE } from "../../base";
import { TAIL_RE } from "../../engine/phone";
import { weighed } from "../../engine/types";
import { ApiFail, cancelOrder, getOrder, rememberOrder, tailOf } from "../api";
import { t, unitName, whenText } from "../i18n";
import { Copyable, CopyButton, emailIn, IconCheck, Lines, money, qtyText, Sheet, Toast, TopBar, useLang, useTitle } from "./common";

export function OrderView({ code, fresh }: { code: string; fresh: boolean }) {
  useLang();
  const [tail, setTail] = useState(tailOf(code) ?? "");
  const [typed, setTyped] = useState("");
  const [page, setPage] = useState<OrderPage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useTitle(t("orderTitle", { code }));

  async function open(withTail: string) {
    setBusy(true);
    setProblem(null);
    try {
      const got = await getOrder(code, withTail);
      setPage(got);
      setTail(withTail);
      rememberOrder({ code, tail: withTail, offerId: got.offer.id, title: got.offer.title, shop: got.shop.name, at: got.order.createdAt });
    } catch (e) {
      const why = e instanceof ApiFail ? e.code : "failed";
      setProblem(t(why === "notfound" ? "tailWrong" : why === "locked" ? "tailLocked" : why === "limit" ? "limit" : why === "network" ? "netDown" : "failed"));
      if (why === "notfound") setTail("");
    }
    setBusy(false);
  }

  useEffect(() => {
    // ("just placed" is said once: the address loses its ?new=1, so a reload or a shared link doesn't say it again)
    if (fresh) history.replaceState(history.state, "", location.pathname);
    if (tail) void open(tail);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!page) {
    return (
      <div class="page">
        <TopBar />
        {tail && !problem ? (
          <p class="loading">{t("loading")}</p>
        ) : (
          <form
            class="panel"
            onSubmit={(event) => {
              event.preventDefault();
              if (TAIL_RE.test(typed)) void open(typed);
              else setProblem(t("tailWrong"));
            }}
          >
            <h1 class="panel-title">{t("tailTitle", { code })}</h1>
            <label class="field">
              <span class="field-label">{t("tailLabel")}</span>
              <input type="text" name="tail" inputMode="numeric" pattern="[0-9]*" maxLength={4} autocomplete="off" class="code-input" value={typed} aria-invalid={problem ? "true" : undefined} onInput={(event) => setTyped(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
            {problem && (
              <p class="problem" role="alert">
                {problem}
              </p>
            )}
            <button type="submit" class="btn btn-primary" disabled={busy || typed.length !== 4}>
              {t("open")}
            </button>
          </form>
        )}
      </div>
    );
  }

  const { order, offer, shop, point, rule } = page;
  const gone = order.status === "cancelled";
  const waits = order.final === null;
  const due = order.final ?? order.goods + order.fee;
  const payee = emailIn(shop.pay);

  return (
    <div class="page">
      <TopBar />

      <section class={`hero${gone ? " receipt-gone" : ""}`}>
        {fresh && !gone && (
          <p class="placed">
            <IconCheck /> {t("placed")}
          </p>
        )}
        <h1>
          <span class="code">{order.code}</span>
        </h1>
        <p class="hint">
          {shop.name} · {offer.title}
        </p>
        <p class="chips">
          <span class={`chip${gone ? " chip-bad" : order.status === "confirmed" ? " chip-good" : ""}`}>{t(gone ? "statusCancelled" : order.status === "confirmed" ? "statusConfirmed" : "statusNew")}</span>
          {!gone && <span class="chip">{t("seq", { n: order.seq })}</span>}
          {!gone && <span class={`chip${order.paid ? " chip-good" : ""}`}>{t(order.paid ? "paidYes" : "paidNo")}</span>}
          {order.picked && <span class="chip chip-good">{t("pickedYes")}</span>}
        </p>
        {fresh && !gone && <p>{t("placedLine")}</p>}
      </section>

      {!gone && (
        <section class="panel">
          <h2 class="panel-title">{t("payTitle")}</h2>
          <dl class="sums">
            <div class="sums-total">
              <dt>{t(waits ? "totalEstimate" : order.lines.some((line) => weighed(line.unit)) ? "finalAmount" : "total")}</dt>
              <dd>{money(due)}</dd>
            </div>
          </dl>
          {waits && <p class="hint">{t("payWait")}</p>}
          {shop.pay && (
            <div class="pay-how">
              <Copyable text={shop.pay} copy={payee ?? shop.pay} label={t(payee ? "copyEmail" : "copyPay")} />
            </div>
          )}
          <div class="fact">
            <h3>{t("payMemo")}</h3>
            <div class="row-between">
              <strong class="code-inline">{order.code}</strong>
              <CopyButton text={order.code} label={t("copyCode")} />
            </div>
          </div>
          {shop.contact && (
            <div class="fact">
              <h3>{t("contact")}</h3>
              <Copyable text={shop.contact} label={t("copyContact")} />
            </div>
          )}
        </section>
      )}

      <section class="panel">
        <h2 class="panel-title">{t("whereTitle")}</h2>
        {order.how === "pickup" ? (
          <div class="fact">
            <h3>
              {t("pickup")} · {point?.name ?? ""}
            </h3>
            {point?.address && <Lines text={point.address} />}
            {point?.hours && <p class="hint">{point.hours}</p>}
          </div>
        ) : (
          <div class="fact">
            <h3>
              {t("delivery")} · {rule?.label ?? ""}
            </h3>
            <Lines text={order.address} />
            {rule?.hours && <p class="hint">{rule.hours}</p>}
          </div>
        )}
        <p class="hint">
          {order.name} · ···· {order.tail}
          {order.wechat ? ` · ${order.wechat}` : ""}
        </p>
        {order.note && <Lines text={order.note} class="hint" />}
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("itemsTitle")}</h2>
        <ul class="sum-lines">
          {order.lines.map((line) => (
            <li key={line.itemId}>
              <span>
                {line.name}{" "}
                <span class="hint">
                  × {qtyText(line.unit, line.qty)}
                  {weighed(line.unit) ? "" : ` ${unitName(line.unit)}`}
                  {line.actual !== null && ` · ${t("weighed", { w: qtyText(line.unit, line.actual) })}`}
                </span>
              </span>
              <span>{money(line.amount)}</span>
            </li>
          ))}
        </ul>
        <dl class="sums">
          <div>
            <dt>{t(waits ? "goodsEstimate" : "goods")}</dt>
            <dd>{money(order.final === null ? order.goods : order.final - order.fee)}</dd>
          </div>
          {order.how === "delivery" && (
            <div>
              <dt>{t("fee")}</dt>
              <dd>{order.fee ? money(order.fee) : t("free")}</dd>
            </div>
          )}
        </dl>
        <p class="hint">{t("orderedAt", { when: whenText(order.createdAt) })}</p>
      </section>

      {!gone &&
        (page.mayChange ? (
          <div class="row">
            <a class="btn btn-quiet grow" href={`${BASE}/t/${offer.id}?change=${order.code}`}>
              {t("change")}
            </a>
            <button type="button" class="btn btn-quiet" onClick={() => setAsking(true)}>
              {t("cancel")}
            </button>
          </div>
        ) : (
          <p class="hint">{t("noChange")}</p>
        ))}
      <a class="link-btn center" href={`${BASE}/t/${offer.id}`}>
        {t("toOffer")}
      </a>
      <p class="foot">{t("footMoney")}</p>

      {asking && (
        <Sheet
          title={t("cancelAsk")}
          onClose={() => setAsking(false)}
          footer={
            <div class="row">
              <button type="button" class="btn btn-quiet grow" onClick={() => setAsking(false)}>
                {t("cancelNo")}
              </button>
              <button
                type="button"
                class="btn btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPage(await cancelOrder(code, tail));
                    setToast(t("cancelled"));
                  } catch (e) {
                    const why = e instanceof ApiFail ? e.code : "failed";
                    setToast(t(why === "paid" ? "errPaid" : why === "closed" ? "noChange" : why === "network" ? "netDown" : "failed"));
                  }
                  setBusy(false);
                  setAsking(false);
                }}
              >
                {t("cancelYes")}
              </button>
            </div>
          }
        >
          <p>{t("cancelBody")}</p>
        </Sheet>
      )}
      <Toast text={toast} />
    </div>
  );
}
