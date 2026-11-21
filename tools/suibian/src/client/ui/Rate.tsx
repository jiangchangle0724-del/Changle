// After the meal: three taps, under ten seconds (/eat/r/1234/rate).
import { useEffect, useState } from "preact/hooks";
import type { Rating } from "../../engine";
import { t } from "../i18n";
import { api } from "../net";
import { identity, prefs } from "../prefs";
import { toast } from "../store";
import { Btn, Dock, Message, TopBar } from "./common";

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
  const [sentNow, setSent] = useState(false);
  const sent = sentNow || prefs.rated(code);
  const load = () => api<Info>(`/api/rooms/${code}`).then((r) => setInfo(r.data));
  useEffect(() => void load(), [code]);

  const submit = async () => {
    const rating = JSON.stringify({ cid: identity().cid, overall, liked, wait });
    const res = await api<{ ok?: boolean }>(`/api/rooms/${code}/rate`, { method: "POST", body: rating });
    // Already rated counts as done: the table answers 409 for this phone's second rating. A table
    // that answers 410 has nothing left to rate, or as many ratings as people.
    const done = res.ok || res.status === 409;
    if (!done) return toast(t(res.status === 410 ? "rateClosed" : "offline"));
    prefs.markRated(code);
    setSent(true);
    void load();
  };

  return (
    <main class="page rate">
      <TopBar title="title" home={home} />
      {!info ? (
        <p class="muted center">{t("connecting")}</p>
      ) : !info.exists ? (
        <Message error>{t("noRoom")}</Message>
      ) : !info.winner ? (
        <p class="muted">{t("rateNotYet")}</p>
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
              <section class="card">
                <h3>{t("overall")}</h3>
                <div class="seg big">
                  {(["up", "mid", "down"] as const).map((o) => (
                    <button class="press" key={o} type="button" aria-pressed={overall === o} onClick={() => setOverall(o)}>
                      {o === "up" ? "👍" : o === "mid" ? "😐" : "👎"}
                    </button>
                  ))}
                </div>
              </section>
              <section class="card">
                <h3>{t("likedQ")}</h3>
                <div class="seg">
                  <button class="press" type="button" aria-pressed={liked === true} onClick={() => setLiked(true)}>
                    {t("yes")}
                  </button>
                  <button class="press" type="button" aria-pressed={liked === false} onClick={() => setLiked(false)}>
                    {t("no")}
                  </button>
                </div>
              </section>
              <section class="card">
                <h3>{t("waitedQ")}</h3>
                <div class="seg">
                  {([0, 15, 30, 45] as const).map((w) => (
                    <button class="press" key={w} type="button" aria-pressed={wait === w} onClick={() => setWait(w)}>
                      {w === 45 ? t("waited45") : t("min", { n: w })}
                    </button>
                  ))}
                </div>
              </section>
              <Dock>
                <Btn kind="primary" wide disabled={overall === null || liked === null || wait === null} onClick={() => void submit()}>
                  {t("submit")}
                </Btn>
              </Dock>
            </>
          )}
          {info.ratings && info.ratings.n > 0 && <p class="center">{t("tableScore", { n: info.ratings.liked, m: info.ratings.n })}</p>}
        </>
      )}
    </main>
  );
}
