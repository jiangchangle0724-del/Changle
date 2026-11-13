// Home: how it works, the orders placed from this phone, and a way to open an order by its code.
// (A list of shops with group buys open comes when the tool is public; until then a buyer arrives
// by a merchant's link.) /tuan/preview is the same page, saying it is a preview.
import { useState } from "preact/hooks";
import { BASE } from "../../base";
import { ORDER_RE, tidyOrderCode } from "../../engine/ids";
import { myOrders } from "../api";
import { t, whenText } from "../i18n";
import { IconNext, TopBar, useLang, useTitle } from "./common";

export function Home({ preview }: { preview: boolean }) {
  useLang();
  const orders = myOrders();
  const [code, setCode] = useState("");
  const tidy = tidyOrderCode(code);
  return (
    <div class="page">
      <TopBar />
      <section class="hero">
        <h1>{t("brand")}</h1>
        <p>{t("homeLine")}</p>
        {preview && <p class="state state-shut">{t("previewNote")}</p>}
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("homeHow")}</h2>
        <ol class="steps">
          <li>{t("homeHow1")}</li>
          <li>{t("homeHow2")}</li>
          <li>{t("homeHow3")}</li>
        </ol>
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("myOrders")}</h2>
        {orders.length === 0 ? (
          <p class="hint">{t("noOrders")}</p>
        ) : (
          <ul class="mine">
            {orders.map((order) => (
              <li key={order.code}>
                <a href={`${BASE}/o/${order.code}`}>
                  <span class="mine-what">
                    <strong>{order.title}</strong>
                    <span class="hint">
                      {order.shop} · {order.code} · {whenText(order.at)}
                    </span>
                  </span>
                  <IconNext />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        class="panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (ORDER_RE.test(tidy)) location.assign(`${BASE}/o/${tidy}`);
        }}
      >
        <h2 class="panel-title">{t("findOrder")}</h2>
        <label class="field">
          <span class="field-label">{t("codeLabel")}</span>
          <input type="text" name="code" maxLength={8} autocomplete="off" autocapitalize="characters" class="code-input" value={code} onInput={(event) => setCode(event.currentTarget.value)} />
          <span class="hint">{t("findHint")}</span>
        </label>
        <button type="submit" class="btn btn-quiet" disabled={!ORDER_RE.test(tidy)}>
          {t("open")}
        </button>
      </form>

      <p class="foot">{t("footMoney")}</p>
    </div>
  );
}

export function NotFound() {
  useLang();
  useTitle(t("notFoundTitle"));
  return (
    <div class="page">
      <TopBar />
      <div class="empty">
        <h1>{t("notFoundTitle")}</h1>
        <p>{t("notFoundBody")}</p>
        <a class="btn btn-quiet" href={`${BASE}/`}>
          {t("brand")}
        </a>
      </div>
    </div>
  );
}
