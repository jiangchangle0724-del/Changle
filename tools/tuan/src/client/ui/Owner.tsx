// The site's owner, by hand: set a shop up (or change one), and start a group buy in a shop from
// a document. A stopgap until merchants apply and edit their own group buys: plain forms, and the
// server's own word when something is wrong. Shown on a merchant's home to the owner alone; the
// server checks who's asking either way.
import { useState } from "preact/hooks";
import type { MyHome } from "../../api";
import { BASE } from "../../base";
import { vancouverClock, vancouverTime } from "../../engine/time";
import { ApiFail, saveShop, startOffer } from "../api";
import { t } from "../i18n";

/** Vancouver's clock as a date-and-time field writes it ("2026-11-20T20:00"), and back: whatever time zone the phone is set to. */
const toField = (ms: number): string => vancouverClock(ms).replace(" ", "T");
function fromField(text: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(text);
  return m ? vancouverTime(m[1], Number(m[2]), Number(m[3])) : null;
}

/** A made-up group buy to try the pages with: a few counted things and one by weight. */
const SAMPLE = {
  title: "测试团 · 样例",
  note: "这是测试用的团，商品是编的。\nA test group buy: the goods are made up.",
  roster: "names",
  items: [
    { section: "米面", name: "样例大米 10kg", detail: "当季新米", price: 3800, unit: "bag", stock: 20000 },
    { section: "米面", name: "样例挂面 1kg", price: 699, unit: "pack", perBuyer: 3000, allergens: "小麦" },
    { section: "蛋肉", name: "样例鸡蛋 30 枚", price: 1350, unit: "box", stock: 5000, allergens: "蛋" },
    { section: "蛋肉", name: "样例羊肉片", detail: "按磅称重", price: 1699, unit: "lb", least: 1000 },
  ],
  points: [
    { name: "样例自提点 A", address: "下单后发具体地址", hours: "周五 4–7pm" },
    { name: "样例自提点 B", address: "下单后发具体地址", hours: "周六 11am–1pm" },
  ],
  rules: [{ label: "样例送货区", min: 5000, fee: 500, freeFrom: 8000, hours: "周五 6–9pm" }],
};

/** What the server said, as the owner needs it: the error's code, and which item or place when it names one. */
const why = (e: unknown): string => (e instanceof ApiFail ? `${e.code}${e.detail.at === undefined ? "" : ` #${e.detail.at + 1}`}` : "failed");

export function OwnerPanel({ home, onChange }: { home: MyHome; onChange: () => void }) {
  const [shop, setShop] = useState({ slug: "", name: "", kind: "leader", about: "", contact: "", pay: "", members: home.me.email });
  const [shopSaid, setShopSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [slug, setSlug] = useState(home.shops[0]?.slug ?? "");
  const [closes, setCloses] = useState(() => `${toField(Date.now() + 7 * 86_400_000).slice(0, 11)}20:00`);
  const [doc, setDoc] = useState("");
  const [offerSaid, setOfferSaid] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function keepShop(event: Event) {
    event.preventDefault();
    setBusy(true);
    try {
      const made = await saveShop({ ...shop, slug: shop.slug.trim(), members: shop.members.split(/[\s,;]+/).filter(Boolean) });
      setShopSaid({ ok: true, text: t("ownerSaved") });
      setSlug(made.id);
      onChange();
    } catch (e) {
      setShopSaid({ ok: false, text: t("ownerErr", { why: why(e) }) });
    }
    setBusy(false);
  }

  async function start(event: Event) {
    event.preventDefault();
    let offer: unknown;
    try {
      offer = JSON.parse(doc);
    } catch {
      return setOfferSaid({ ok: false, text: t("ownerBadJson") });
    }
    const closesAt = fromField(closes);
    setBusy(true);
    try {
      const made = await startOffer(slug, { ...(offer as object), ...(closesAt === null ? {} : { closesAt }) });
      setOfferSaid({ ok: true, text: t("ownerStarted"), id: made.id });
      onChange();
    } catch (e) {
      setOfferSaid({ ok: false, text: t("ownerErr", { why: why(e) }) });
    }
    setBusy(false);
  }

  return (
    <section class="panel">
      <h2 class="panel-title">{t("ownerTitle")}</h2>

      <form class="stack" onSubmit={keepShop}>
        <h3 class="field-label">{t("ownerShopTitle")}</h3>
        <p class="hint">{t("ownerNote")}</p>
        <label class="field">
          <span class="field-label">{t("ownerSlug")}</span>
          <input type="text" name="slug" maxLength={32} autocomplete="off" autocapitalize="off" spellcheck={false} value={shop.slug} onInput={(event) => setShop({ ...shop, slug: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerName")}</span>
          <input type="text" name="shopname" maxLength={40} autocomplete="off" value={shop.name} onInput={(event) => setShop({ ...shop, name: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerKind")}</span>
          <select name="kind" value={shop.kind} onChange={(event) => setShop({ ...shop, kind: event.currentTarget.value })}>
            <option value="leader">{t("kindLeader")}</option>
            <option value="kitchen">{t("kindKitchen")}</option>
            <option value="farm">{t("kindFarm")}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">{t("ownerAbout")}</span>
          <textarea name="about" rows={2} maxLength={600} value={shop.about} onInput={(event) => setShop({ ...shop, about: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerContact")}</span>
          <textarea name="contact" rows={2} maxLength={300} value={shop.contact} onInput={(event) => setShop({ ...shop, contact: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerPay")}</span>
          <textarea name="pay" rows={2} maxLength={600} value={shop.pay} onInput={(event) => setShop({ ...shop, pay: event.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerMembers")}</span>
          <textarea name="members" rows={2} maxLength={800} autocapitalize="off" spellcheck={false} value={shop.members} onInput={(event) => setShop({ ...shop, members: event.currentTarget.value })} />
        </label>
        {shopSaid && (
          <p class={shopSaid.ok ? "hint" : "problem"} role="status">
            {shopSaid.text}
          </p>
        )}
        <button type="submit" class="btn btn-quiet" disabled={busy || !shop.slug.trim() || !shop.name.trim()}>
          {t("ownerSave")}
        </button>
      </form>

      <form class="stack" onSubmit={start}>
        <h3 class="field-label">{t("ownerOfferTitle")}</h3>
        <label class="field">
          <span class="field-label">{t("ownerShop")}</span>
          <select name="shop" value={slug} onChange={(event) => setSlug(event.currentTarget.value)}>
            {home.shops.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="field-label">{t("ownerCloses")}</span>
          <input type="datetime-local" name="closes" value={closes} onInput={(event) => setCloses(event.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">{t("ownerDoc")}</span>
          <textarea name="doc" rows={6} maxLength={200000} autocapitalize="off" spellcheck={false} value={doc} onInput={(event) => setDoc(event.currentTarget.value)} />
        </label>
        {offerSaid && (
          <p class={offerSaid.ok ? "hint" : "problem"} role="status">
            {offerSaid.text}{" "}
            {offerSaid.id && (
              <a class="link-btn" href={`${BASE}/t/${offerSaid.id}`}>
                {t("viewPublic")}
              </a>
            )}
          </p>
        )}
        <div class="row">
          <button type="button" class="btn btn-quiet" onClick={() => setDoc(JSON.stringify(SAMPLE, null, 1))}>
            {t("ownerSample")}
          </button>
          <button type="submit" class="btn btn-primary grow" disabled={busy || !slug || !doc.trim()}>
            {t("ownerStart")}
          </button>
        </div>
      </form>
    </section>
  );
}
