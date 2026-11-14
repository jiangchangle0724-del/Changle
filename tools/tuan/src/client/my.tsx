// 跟一单 · Count Me In: the merchant's pages, in a script of their own that src/client/main.tsx
// loads only for these addresses, so a buyer's phone never downloads them:
//   /tuan/my                     a merchant's home: their shops and group buys (signed in)
//   /tuan/my/t/<group buy>       a group buy's orders and sheets, for its merchant
//   /tuan/my/t/<group buy>/edit  changing it
//   /tuan/my/new/<shop>          starting one in a shop (…?from=<group buy> starts from that one)
//   /tuan/my/s/<shop>            what a shop says about itself
import { OFFER_RE, SLUG_RE } from "../engine/ids";
import "./i18n-my";
import { Editor } from "./ui/Editor";
import { NotFound } from "./ui/Home";
import { My } from "./ui/My";
import { MyOfferView } from "./ui/MyOffer";
import { ShopEdit } from "./ui/ShopEdit";

/** `parts`: the address after /tuan, the first being "my". */
export function MyPage({ parts, query }: { parts: string[]; query: URLSearchParams }) {
  const [, b, c, d] = parts;
  if (parts.length === 1) return <My />;
  if (parts.length === 3 && b === "t" && OFFER_RE.test(c)) return <MyOfferView offerId={c} />;
  if (parts.length === 4 && b === "t" && OFFER_RE.test(c) && d === "edit") return <Editor slug={null} from={null} offerId={c} />;
  if (parts.length === 3 && b === "s" && SLUG_RE.test(c)) return <ShopEdit slug={c} />;
  if (parts.length === 3 && b === "new" && SLUG_RE.test(c)) {
    const from = query.get("from") ?? "";
    return <Editor slug={c} from={OFFER_RE.test(from) ? from : null} offerId={null} />;
  }
  return <NotFound />;
}
