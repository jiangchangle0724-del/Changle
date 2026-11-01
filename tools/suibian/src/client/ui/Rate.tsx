// After the meal: three taps, under ten seconds. For a table (/eat/r/1234/rate) or for one person's
// last solo pick (/eat/rate, signed in).
import { useEffect, useState } from "preact/hooks";
import { BASE } from "../../base";
import type { Rating } from "../../engine";
import { t } from "../i18n";
import { api } from "../net";
import { identity, prefs } from "../prefs";
import { toast, update, useApp } from "../store";
import { Btn, LangToggle } from "./common";

interface Info {
  exists: boolean;
  winner?: string;
  ratings?: { n: number; liked: number };
}

export function Rate({ code, home }: { code?: string; home: () => void }) {
  const { me } = useApp();
  // Without a table code this is the solo pick kept on the account.
  const pick = !code && me?.last?.place ? me.last : null;
  const key = code ?? (pick ? `p:${pick.place}` : "");
  const [roomInfo, setInfo] = useState<Info | null>(null);
  const [overall, setOverall] = useState<Rating["overall"] | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [wait, setWait] = useState<Rating["wait"] | null>(null);
  const [sentNow, setSent] = useState(false);
  // The account loads after the page, so whether it was rated is worked out on every render.
  const sent = sentNow || (!!key && prefs.rated(key)) || !!pick?.rated;
  const load = () => code && api<Info>(`/api/rooms/${code}`).then((r) => setInfo(r.data));
  useEffect(() => void load(), [code]);
  const info: Info | null = code ? roomInfo : !me ? null : pick ? { exists: true, winner: pick.name } : { exists: true };

  const submit = async () => {
    const rating = JSON.stringify({ cid: identity().cid, overall, liked, wait });
    const res = code
      ? await api<{ ok?: boolean }>(`/api/rooms/${code}/rate`, { method: "POST", body: rating })
      : await api<{ ok?: boolean }>(`/api/places/${encodeURIComponent(pick!.place!)}/rate`, { method: "POST", body: rating });
    // A table says ok: false when this phone already rated it; a solo pick answers 403 when it was
    // already rated (maybe on another phone) or is no longer the last pick. Either way, done.
    const done = res.ok || (!code && res.status === 403);
    if (!done) return toast(t("offline"));
    prefs.markRated(key);
    setSent(true);
    if (code) void load();
    else if (me?.last) update({ me: { ...me, last: { ...me.last, rated: true } } });
  };

  return (
    <main class="page rate">
      <header class="bar">
        <a
          href={`${BASE}/`}
          class="brand"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
        >
          🥢 {t("title")}
        </a>
        <LangToggle />
      </header>
      {!info ? (
        <p class="muted center">{t("connecting")}</p>
      ) : !info.exists ? (
        <p class="error">{t("noRoom")}</p>
      ) : !info.winner ? (
        <p class="muted">{t(code ? "rateNotYet" : "rateNoPick")}</p>
      ) : (
        <>
          <h2>{t("rateTitle", { name: info.winner })}</h2>
          {sent ? (
            <>
              <p class="big center">{t("thanks")}</p>
              <Btn kind="quiet" wide onClick={home}>
                {t("home")}
              </Btn>
            </>
          ) : (
            <>
              <h3>{t("overall")}</h3>
              <div class="seg big">
                {(["up", "mid", "down"] as const).map((o) => (
                  <button key={o} type="button" aria-pressed={overall === o} onClick={() => setOverall(o)}>
                    {o === "up" ? "👍" : o === "mid" ? "😐" : "👎"}
                  </button>
                ))}
              </div>
              <h3>{t("likedQ")}</h3>
              <div class="seg">
                <button type="button" aria-pressed={liked === true} onClick={() => setLiked(true)}>
                  {t("yes")}
                </button>
                <button type="button" aria-pressed={liked === false} onClick={() => setLiked(false)}>
                  {t("no")}
                </button>
              </div>
              <h3>{t("waitedQ")}</h3>
              <div class="seg">
                {([0, 15, 30, 45] as const).map((w) => (
                  <button key={w} type="button" aria-pressed={wait === w} onClick={() => setWait(w)}>
                    {w === 45 ? t("waited45") : t("min", { n: w })}
                  </button>
                ))}
              </div>
              <Btn kind="primary" wide disabled={overall === null || liked === null || wait === null} onClick={() => void submit()}>
                {t("submit")}
              </Btn>
            </>
          )}
          {info.ratings && info.ratings.n > 0 && <p class="center">{t("tableScore", { n: info.ratings.liked, m: info.ratings.n })}</p>}
        </>
      )}
    </main>
  );
}
