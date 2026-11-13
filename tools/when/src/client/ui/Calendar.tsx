// "Add to calendar", on the banner of the time that was set, for everyone. An iPhone, an iPad or a
// Mac opens the gathering's calendar file in its own Calendar; everything else goes to Google
// Calendar, where most Android phones keep theirs. The other way is the line beside the button.
// Inside WeChat neither opens, so there the button says how to get to a browser.
import { useState } from "preact/hooks";
import { BASE } from "../../base";
import { googleCalendarUrl } from "../../engine";
import type { EventState } from "../../engine";
import { t } from "../i18n";
import { IconCalendar, inWeChat, useLang } from "./common";

/** iPadOS calls itself a Mac; a Mac opens the file in Calendar too. */
const onApple = (): boolean => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

export function AddToCalendar({ state }: { state: EventState }) {
  useLang();
  const [stuck, setStuck] = useState(false);
  if (!state.settled) return null;
  const { day, part, at } = state.settled;
  const file = `${BASE}/api/e/${state.code}/calendar.ics`;
  const google = googleCalendarUrl({ code: state.code, title: state.title, day, part, setAt: at });

  if (inWeChat())
    return (
      <>
        <div class="set-actions">
          <button type="button" class="btn btn-on-gel" onClick={() => setStuck(true)}>
            <IconCalendar />
            {t("calAdd")}
          </button>
        </div>
        {stuck && <p role="status">{t("calWeChat")}</p>}
      </>
    );

  const apple = onApple();
  const elsewhere = { target: "_blank", rel: "noopener" };
  return (
    <div class="set-actions">
      <a class="btn btn-on-gel" href={apple ? file : google} {...(apple ? {} : elsewhere)}>
        <IconCalendar />
        {t("calAdd")}
      </a>
      <a class="link-btn on-gel" href={apple ? google : file} {...(apple ? elsewhere : {})}>
        {t(apple ? "calGoogle" : "calFile")}
      </a>
    </div>
  );
}
