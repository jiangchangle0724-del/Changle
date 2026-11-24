// 跟一单 · Count Me In: the phone pages. A buyer's are in this script:
//   /tuan/                       home: how it works, the orders placed from this phone, the way in for merchants
//   /tuan/t/<group buy>          a group buy: pick, check out (…?change=<order> changes that order)
//   /tuan/o/<order code>         an order
//   /tuan/s/<shop>               a shop: who they are, and their group buys
// and a merchant's (/tuan/my…) in one of their own, src/client/my.tsx, loaded only for them.
import { render } from "preact";
import { BASE } from "../base";
import { OFFER_RE, ORDER_RE, SLUG_RE, tidyOrderCode } from "../engine/ids";
import { t } from "./i18n";
import { Home, NotFound } from "./ui/Home";
import { OfferView } from "./ui/Offer";
import { OrderView } from "./ui/Order";
import { ShopView } from "./ui/Shop";

// A double tap never zooms. iPhone Safari honours touch-action (the stylesheet gives it to every
// element) only on a tap near something that listens for clicks, so the page itself listens.
document.documentElement.addEventListener("click", () => {});

const parts = location.pathname
  .slice(BASE.length)
  .split("/")
  .filter(Boolean)
  .map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
const query = new URLSearchParams(location.search);

// A sheet or checkout that was open when the page was last left or reloaded marked this step of
// the history; the page starts without them, so the mark goes.
if (history.state?.sheet || history.state?.checkout) history.replaceState(null, "");

function Page() {
  const [a, b] = parts;
  if (parts.length === 0) return <Home />;
  if (parts.length === 2 && a === "t" && OFFER_RE.test(b)) {
    const change = tidyOrderCode(query.get("change") ?? "");
    return <OfferView offerId={b} changeCode={ORDER_RE.test(change) ? change : null} />;
  }
  if (parts.length === 2 && a === "o" && ORDER_RE.test(tidyOrderCode(b))) return <OrderView code={tidyOrderCode(b)} fresh={query.get("new") === "1"} />;
  if (parts.length === 2 && a === "s" && SLUG_RE.test(b)) return <ShopView slug={b} />;
  return <NotFound />;
}

const root = document.getElementById("app")!;
if (parts[0] === "my") {
  render(
    <div class="page">
      <p class="loading">{t("loading")}</p>
    </div>,
    root,
  );
  import("./my").then(
    ({ MyPage }) => render(<MyPage parts={parts} query={query} />, root),
    () =>
      render(
        <div class="page">
          <div class="empty">
            <p>{t("netDown")}</p>
            <button type="button" class="btn btn-quiet" onClick={() => location.reload()}>
              {t("retry")}
            </button>
          </div>
        </div>,
        root,
      ),
  );
} else render(<Page />, root);
