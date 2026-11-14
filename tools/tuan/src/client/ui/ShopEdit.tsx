// What a shop says about itself, for its own people to change (/tuan/my/s/<shop>): its name, what
// kind of shop it is, about it, how to reach it and pay it, its permit. Its address, who runs it
// and whether it's taking orders stay the site owner's to change.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ShopCard } from "../../api";
import { BASE } from "../../base";
import type { ShopKind } from "../../engine/types";
import { ApiFail, getMyShop, saveMyShop, session } from "../api";
import { t } from "../i18n";
import { IconBack, useLang, useTitle } from "./common";
import { onReturn, shutOut, troubleOf, TroublePanel, type Trouble } from "./My";

type Words = Omit<ShopCard, "slug">;
const wordsOf = ({ slug: _slug, ...words }: ShopCard): Words => words;

export function ShopEdit({ slug }: { slug: string }) {
  useLang();
  useTitle(t("shopEditTitle"));
  const [typed, setTyped] = useState<Words | null>(null);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const loaded = useRef(false);

  async function load() {
    if (!session()) return setTrouble("signin");
    try {
      setTyped(wordsOf((await getMyShop(slug)).shop));
      loaded.current = true;
      setTrouble(null);
    } catch (e) {
      setTrouble(troubleOf(e));
    }
  }
  useEffect(() => {
    void load();
    // back from signing in: read it then, but never over what's being typed
    return onReturn(() => void (loaded.current || load()));
  }, []);

  async function save() {
    if (!typed) return;
    if (!typed.name.trim()) return setSaid({ ok: false, text: t("editErrName") });
    setBusy(true);
    setSaid(null);
    try {
      setTyped(wordsOf((await saveMyShop(slug, typed)).shop));
      setSaid({ ok: true, text: t("shopSaved") });
    } catch (e) {
      const why = troubleOf(e);
      if (shutOut(why)) setTrouble(why);
      else setSaid({ ok: false, text: e instanceof ApiFail && e.code === "name" ? t("editErrName") : e instanceof ApiFail && e.code === "network" ? t("netDown") : t("editErrFailed") });
    }
    setBusy(false);
  }

  const set = (more: Partial<Words>) => {
    if (typed) setTyped({ ...typed, ...more });
    setSaid(null);
  };
  return (
    <div class="page">
      <header class="bar">
        <a class="bar-back" href={`${BASE}/my`}>
          <IconBack />
          {t("myTitle")}
        </a>
      </header>
      <section class="hero">
        <h1>{t("shopEditTitle")}</h1>
      </section>

      {trouble === "forbidden" || trouble === "notfound" ? (
        <div class="empty">
          <p>{t("editNoShop")}</p>
          <a class="btn btn-quiet" href={`${BASE}/my`}>
            {t("myTitle")}
          </a>
        </div>
      ) : trouble ? (
        <TroublePanel trouble={trouble} onRetry={() => void load()} />
      ) : !typed ? (
        <p class="loading">{t("loading")}</p>
      ) : (
        <section class="panel">
          <form
            class="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label class="field">
              <span class="field-label">{t("ownerName")}</span>
              <input type="text" name="shopname" maxLength={40} autocomplete="off" value={typed.name} onInput={(event) => set({ name: event.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="field-label">{t("ownerKind")}</span>
              <select name="kind" value={typed.kind} onChange={(event) => set({ kind: event.currentTarget.value as ShopKind })}>
                <option value="leader">{t("kindLeader")}</option>
                <option value="kitchen">{t("kindKitchen")}</option>
                <option value="farm">{t("kindFarm")}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{t("ownerAbout")}</span>
              <textarea name="about" rows={3} maxLength={600} value={typed.about} onInput={(event) => set({ about: event.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="field-label">{t("ownerContact")}</span>
              <textarea name="contact" rows={2} maxLength={300} value={typed.contact} onInput={(event) => set({ contact: event.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="field-label">{t("ownerPay")}</span>
              <textarea name="pay" rows={3} maxLength={600} value={typed.pay} onInput={(event) => set({ pay: event.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="field-label">{t("shopPermitField")}</span>
              <input type="text" name="permit" maxLength={200} autocomplete="off" value={typed.permit} onInput={(event) => set({ permit: event.currentTarget.value })} />
              <span class="hint">{t("shopPermitHint")}</span>
            </label>
            <p class="hint">{t("shopEditNote")}</p>
            {said && (
              <p class={said.ok ? "hint" : "problem"} role="status">
                {said.text}
              </p>
            )}
            <button type="submit" class="btn btn-primary btn-block" disabled={busy}>
              {t("editSave")}
            </button>
            <a class="btn btn-quiet btn-block" href={`${BASE}/s/${slug}`}>
              {t("shopViewPublic")}
            </a>
          </form>
        </section>
      )}
    </div>
  );
}
