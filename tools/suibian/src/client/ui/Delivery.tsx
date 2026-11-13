// "Order delivery" on a card: a fold with the four apps (see delivery.ts for how each link works).
import { DELIVERY_APPS } from "../delivery";
import { t, tx } from "../i18n";
import { toast } from "../store";

export function Delivery({ name }: { name: string }) {
  const copy = (text: string) => {
    // Inside the tap, so the browser allows it; the app's site opens in a new tab either way.
    navigator.clipboard?.writeText(text).then(
      () => toast(t("nameCopied")),
      () => {},
    );
  };
  return (
    <details class="delivery">
      <summary>{t("delivery")}</summary>
      <p class="links">
        {DELIVERY_APPS.map((a) => (
          <a key={a.id} data-app={a.id} href={a.href(name)} target="_blank" rel="noopener noreferrer" onClick={a.copy ? () => copy(a.copy!(name)) : undefined}>
            {tx(a.label)}
          </a>
        ))}
      </p>
      <p class="muted small">{t("deliveryHint")}</p>
    </details>
  );
}
