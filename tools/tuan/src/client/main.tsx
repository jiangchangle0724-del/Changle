// 跟一单 · Count Me In: the phone pages. One script for all of them:
//   /tuan/ and /tuan/preview     home: how it works, and the orders placed from this phone
//   /tuan/t/<group buy>          a group buy: pick, check out (…?change=<order> changes that order)
//   /tuan/o/<order code>         an order
//   /tuan/my                     a merchant's home: their shops and group buys (signed in)
//   /tuan/my/t/<group buy>       a group buy's orders and sheets, for its merchant
//   /tuan/my/t/<group buy>/edit  changing it
//   /tuan/my/new/<shop>          starting one in a shop (…?from=<group buy> starts from that one)
import { render } from "preact";
import { BASE } from "../base";
import { OFFER_RE, ORDER_RE, SLUG_RE, tidyOrderCode } from "../engine/ids";
import { Editor } from "./ui/Editor";
import { Home, NotFound } from "./ui/Home";
import { My } from "./ui/My";
import { MyOfferView } from "./ui/MyOffer";
import { OfferView } from "./ui/Offer";
import { OrderView } from "./ui/Order";

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
  if (parts.length === 0 || (parts.length === 1 && a === "preview")) return <Home preview={a === "preview"} />;
  if (parts.length === 2 && a === "t" && OFFER_RE.test(b)) {
    const change = tidyOrderCode(query.get("change") ?? "");
    return <OfferView offerId={b} changeCode={ORDER_RE.test(change) ? change : null} />;
  }
  if (parts.length === 2 && a === "o" && ORDER_RE.test(tidyOrderCode(b))) return <OrderView code={tidyOrderCode(b)} fresh={query.get("new") === "1"} />;
  if (parts.length === 1 && a === "my") return <My />;
  if (parts.length === 3 && a === "my" && b === "t" && OFFER_RE.test(parts[2])) return <MyOfferView offerId={parts[2]} />;
  if (parts.length === 4 && a === "my" && b === "t" && OFFER_RE.test(parts[2]) && parts[3] === "edit") return <Editor slug={null} from={null} offerId={parts[2]} />;
  if (parts.length === 3 && a === "my" && b === "new" && SLUG_RE.test(parts[2])) {
    const from = query.get("from") ?? "";
    return <Editor slug={parts[2]} from={OFFER_RE.test(from) ? from : null} offerId={null} />;
  }
  return <NotFound />;
}

render(<Page />, document.getElementById("app")!);
