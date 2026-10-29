// A city's real photo, laid over its poster in the same frame. It comes in only once it has loaded, it
// says whose it is, and if it can't load the poster simply stays. In a city's sheet you switch between
// the two (the photo comes in by itself first); on the big screen's arrival card the photo comes in a
// moment after the poster, with its credit in the corner. The full credits are on the credits page.
import { useEffect, useState } from "preact/hooks";
import { CityPoster } from "../art/posters";
import { getLang, t } from "../i18n";
import { PHOTOS, creditLine, photoSrc, type Photo } from "../media";
import { reducedMotion } from "./Board";

const srcSet = (id: string) => `${photoSrc(id)} 640w, ${photoSrc(id, true)} 1280w`;

/** What's in the photo, in the page's language. */
const altOf = (p: Photo) => p.alt[getLang() === "zh" ? "zh" : "en"];

function usePhotoLoad() {
  const [ready, setReady] = useState(false);
  const [broken, setBroken] = useState(false);
  return { ready, broken, onLoad: () => setReady(true), onError: () => setBroken(true) };
}

function PhotoImg({ id, p, sizes, load }: { id: string; p: Photo; sizes: string; load: ReturnType<typeof usePhotoLoad> }) {
  return (
    <img
      class="photo"
      src={photoSrc(id)!}
      srcset={srcSet(id)}
      sizes={sizes}
      alt={altOf(p)}
      decoding="async"
      draggable={false}
      onLoad={load.onLoad}
      onError={load.onError}
    />
  );
}

/** The top of a city's sheet: the poster, the photo, and the switch between them. */
export function SheetFrame({ id }: { id: string }) {
  const p = PHOTOS[id];
  const load = usePhotoLoad();
  const [view, setView] = useState<"auto" | "poster" | "photo">("auto");
  // Once it has loaded, the photo comes in by itself, unless someone has picked one already.
  useEffect(() => {
    if (!load.ready || view !== "auto") return;
    const timer = window.setTimeout(() => setView((v) => (v === "auto" ? "photo" : v)), reducedMotion() ? 0 : 650);
    return () => clearTimeout(timer);
  }, [load.ready, view]);
  const ok = !!p && !load.broken;
  const on = ok && load.ready && view === "photo";
  return (
    <figure class="cityframe">
      <div class={`poster sheet-poster${on ? " photo-on" : ""}`}>
        <CityPoster id={id} />
        {ok && <PhotoImg id={id} p={p} sizes="(min-width: 560px) 524px, calc(100vw - 36px)" load={load} />}
      </div>
      {ok && (
        <figcaption class="frame-bar">
          <div class="seg" role="group" aria-label={t("pictureKind")}>
            <button type="button" aria-pressed={!on} onClick={() => setView("poster")}>
              {t("poster")}
            </button>
            <button type="button" aria-pressed={on} onClick={() => setView("photo")}>
              {t("photo")}
            </button>
          </div>
          {on && (
            <a class="photo-credit" href={p.page} target="_blank" rel="noopener noreferrer">
              <span>{altOf(p)}</span> <small>{t("photoBy", { who: creditLine(p) })}</small>
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** The poster on the big screen's arrival card: the city's photo comes in over it after a moment. */
export function ArrivalFrame({ id, big }: { id: string; big?: boolean }) {
  const p = big ? PHOTOS[id] : undefined;
  const load = usePhotoLoad();
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!p) return;
    const timer = window.setTimeout(() => setDue(true), reducedMotion() ? 0 : 2600);
    return () => clearTimeout(timer);
  }, [id]);
  const ok = !!p && !load.broken;
  const on = ok && load.ready && due;
  return (
    <div class={`poster arrival-poster${on ? " photo-on" : ""}`}>
      <CityPoster id={id} />
      {ok && (
        <>
          <PhotoImg id={id} p={p} sizes="(min-width: 1280px) 640px, 50vw" load={load} />
          <span class="frame-credit" aria-hidden={!on}>
            {t("photoBy", { who: creditLine(p) })}
          </span>
        </>
      )}
    </div>
  );
}
