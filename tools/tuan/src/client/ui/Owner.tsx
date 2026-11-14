// The site's owner, by hand: set a shop up (or change one), and start a group buy in a shop from
// a document. A stopgap until merchants apply and edit their own group buys: plain forms, and the
// server's own word when something is wrong. Shown on a merchant's home to the owner alone; the
// server checks who's asking either way.
// A file can fill the forms in: a group buy's document, or { "shop": {…}, "offer": {…} } for a
// shop and a group buy in it at once (a merchant's catalogue made ready somewhere else).
import { useState } from "preact/hooks";
import type { MyHome } from "../../api";
import { BASE } from "../../base";
import { fromField, toField } from "../../engine/time";
import { ApiFail, saveShop, startOffer } from "../api";
import { t } from "../i18n";

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

/** The most a file to fill the forms from may be: a group buy of 200 goods is well under it. */
const FILE_MAX = 400_000;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
/** A moment the date-and-time field can show: this century. */
const moment = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 4_102_444_800_000;

/** What the server said, as the owner needs it: the error's code, and which item or place when it names one. */
const why = (e: unknown): string => (e instanceof ApiFail ? `${e.code}${e.detail.at === undefined ? "" : ` #${e.detail.at + 1}`}` : "failed");

/** What a step came to, in words: with the shop's address when it saved one, or the group buy's when it started one. */
type Said = { ok: boolean; text: string; slug?: string; offerId?: string };

function SaidLine({ said }: { said: Said }) {
  return (
    <p class={said.ok ? "hint" : "problem"} role="status">
      {said.text}{" "}
      {said.offerId && (
        <a class="link-btn" href={`${BASE}/t/${said.offerId}`}>
          {t("viewPublic")}
        </a>
      )}
    </p>
  );
}

export function OwnerPanel({ home, onChange }: { home: MyHome; onChange: () => void }) {
  const [shop, setShop] = useState({ slug: "", name: "", kind: "leader", about: "", contact: "", pay: "", members: home.me.email });
  const [shopSaid, setShopSaid] = useState<Said | null>(null);
  const [slug, setSlug] = useState(home.shops[0]?.slug ?? "");
  const [closes, setCloses] = useState(() => `${toField(Date.now() + 7 * 86_400_000).slice(0, 11)}20:00`);
  const [doc, setDoc] = useState("");
  const [offerSaid, setOfferSaid] = useState<Said | null>(null);
  const [busy, setBusy] = useState(false);
  /** what the last file held, and then what its one button came to; `both` while that button is still to press: the file brought a shop along with its group buy */
  const [fileSaid, setFileSaid] = useState<{ said: Said[]; both: boolean } | null>(null);

  /** Save the shop as the form has it. */
  async function keepShop(): Promise<Said> {
    setBusy(true);
    try {
      const made = await saveShop({ ...shop, slug: shop.slug.trim(), members: shop.members.split(/[\s,;]+/).filter(Boolean) });
      setSlug(made.id);
      onChange();
      return { ok: true, text: t("ownerSaved"), slug: made.id };
    } catch (e) {
      return { ok: false, text: t("ownerErr", { why: why(e) }) };
    } finally {
      setBusy(false);
    }
  }

  /** Start the group buy the document describes, in this shop. */
  async function start(into: string): Promise<Said> {
    let offer: unknown;
    try {
      offer = JSON.parse(doc);
    } catch {
      return { ok: false, text: t("ownerBadJson") };
    }
    const closesAt = fromField(closes);
    setBusy(true);
    try {
      const made = await startOffer(into, { ...(offer as object), ...(closesAt === null ? {} : { closesAt }) });
      onChange();
      return { ok: true, text: t("ownerStarted"), offerId: made.id };
    } catch (e) {
      return { ok: false, text: t("ownerErr", { why: why(e) }) };
    } finally {
      setBusy(false);
    }
  }

  /** The file's one button: the shop, then the group buy in it. Said where the button is; it goes once both went in. */
  async function both(): Promise<void> {
    const kept = await keepShop();
    const started = kept.slug ? await start(kept.slug) : null;
    setFileSaid({ said: started ? [kept, started] : [kept], both: !started?.ok });
  }

  /** A file fills the forms in; nothing is sent until the owner presses a button. */
  async function fromFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setOfferSaid(null);
    setShopSaid(null);
    const bad = (line: string) => setFileSaid({ said: [{ ok: false, text: line }], both: false });
    if (file.size > FILE_MAX) return bad(t("ownerFileBig"));
    let whole: Record<string, unknown> | null = null;
    try {
      whole = record(JSON.parse(await file.text()));
    } catch {
      // not a document: said below
    }
    if (!whole) return bad(t("ownerBadJson"));
    const offer = record(whole.offer) ?? whole;
    const from = record(whole.shop);
    if (from) setShop({ slug: text(from.slug), name: text(from.name), kind: text(from.kind) || "leader", about: text(from.about), contact: text(from.contact), pay: text(from.pay), members: Array.isArray(from.members) ? from.members.map(text).join("\n") : home.me.email });
    setDoc(JSON.stringify(offer));
    // when the file says when it closes, the field says so too: the field is what's sent
    if (moment(offer.closesAt)) setCloses(toField(offer.closesAt));
    setFileSaid({ said: [{ ok: true, text: t("ownerFileRead", { shop: from ? text(from.name) : "—", title: text(offer.title), n: count(offer.items), p: count(offer.points), r: count(offer.rules) }) }], both: from !== null });
  }

  return (
    <section class="panel">
      <h2 class="panel-title">{t("ownerTitle")}</h2>

      <div class="stack">
        <label class="btn btn-quiet file-pick">
          {t("ownerFile")}
          {/* any file may be picked: a phone can grey a .json out when the field asks for a kind */}
          <input type="file" name="file" onChange={fromFile} />
        </label>
        {fileSaid?.said.map((said) => <SaidLine key={said.text} said={said} />)}
        {fileSaid?.both && (
          <button type="button" class="btn btn-primary" disabled={busy || !shop.slug.trim() || !shop.name.trim() || !doc.trim()} onClick={() => void both()}>
            {t("ownerBoth")}
          </button>
        )}
      </div>

      <form
        class="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setShopSaid(await keepShop());
        }}
      >
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
        {shopSaid && <SaidLine said={shopSaid} />}
        <button type="submit" class="btn btn-quiet" disabled={busy || !shop.slug.trim() || !shop.name.trim()}>
          {t("ownerSave")}
        </button>
      </form>

      <form
        class="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setOfferSaid(await start(slug));
        }}
      >
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
        {offerSaid && <SaidLine said={offerSaid} />}
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
