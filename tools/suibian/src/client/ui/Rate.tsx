// After the meal: three taps, under ten seconds.
import { useEffect, useState } from "preact/hooks";
import type { Rating } from "../../engine";
import { t } from "../i18n";
import { api } from "../net";
import { identity, prefs } from "../prefs";
import { Btn, LangToggle } from "./common";

interface Info {
  exists: boolean;
  winner?: string;
  ratings?: { n: number; liked: number };
}

export function Rate({ code, home }: { code: string; home: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [overall, setOverall] = useState<Rating["overall"] | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [wait, setWait] = useState<Rating["wait"] | null>(null);
  const [sent, setSent] = useState(prefs.rated(code));
  const load = () => api<Info>(`/api/rooms/${code}`).then((r) => setInfo(r.data));
  useEffect(() => void load(), [code]);

  const submit = async () => {
    const res = await api<{ ok?: boolean }>(`/api/rooms/${code}/rate`, { method: "POST", body: JSON.stringify({ cid: identity().cid, overall, liked, wait }) });
    if (res.ok && res.data.ok) {
      prefs.markRated(code);
      setSent(true);
      void load();
    }
  };

  return (
    <main class="page rate">
      <header class="bar">
        <a
          href="/"
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
        <p class="muted">{t("rateNotYet")}</p>
      ) : (
        <>
          <h2>{t("rateTitle", { name: info.winner })}</h2>
          {sent ? (
            <p class="big center">{t("thanks")}</p>
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
