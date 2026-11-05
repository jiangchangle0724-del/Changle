// The round's penalty, the way changle.ca shows every penalty (site/src/ui/PenaltyCard.tsx): the
// names, one huge word slammed down in Stop Red, how much, a glass that drains to it, and Continue.
// With the table's own penalty, that penalty is the word and nothing anywhere says drink.
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { PenaltyView } from "../../room/protocol";
import { currentLang, t } from "../i18n";
import { reducedNow } from "../prefs";

export function PenaltyStamp(props: { penalty: PenaltyView; custom: string; onDone?: () => void; tv?: boolean }) {
  const { penalty, custom } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [drained, setDrained] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDrained(true), reducedNow() ? 0 : 400);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!node || props.tv) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof node.showModal === "function" && !node.open) node.showModal();
    return () => {
      if (node.open) node.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [props.tv]);
  const everyone = penalty.kind === "everyone";
  const names = everyone ? t("everyone") : penalty.who.join(currentLang() === "zh" ? "、" : ", ");
  const word = custom || t("drink");
  const detail = custom ? null : everyone ? t("everyoneSip") : t("sip");
  const note = everyone ? t("nobodySpotted") : t("spottedMost", { n: penalty.times });
  const content = (
    <>
      <div class="stamp-flash" aria-hidden="true" />
      <div class="stamp-stage">
        <div class="stamp-names">{names}</div>
        <div class={`stamp-seal${custom ? " is-custom" : ""}`} id={id}>
          {word}
        </div>
        {detail && <div class="stamp-detail">{detail}</div>}
        {!custom && (
          <div class="stamp-glass" aria-hidden="true">
            <span class="stamp-glass__beer" style={{ height: `${(drained ? 0.72 : 1) * 100}%` }} />
          </div>
        )}
        <p class="stamp-note">{note}</p>
        {props.onDone && (
          <div class="stamp-actions">
            <button type="button" class="btn btn-moon btn-lg" onClick={props.onDone}>
              {t("continue")}
            </button>
          </div>
        )}
      </div>
    </>
  );
  if (props.tv)
    return (
      <div class="stamp stamp-tv" role="status" aria-labelledby={id}>
        {content}
      </div>
    );
  return (
    <dialog
      ref={dialog}
      class="stamp"
      aria-modal="true"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        props.onDone?.();
      }}
    >
      {content}
    </dialog>
  );
}
