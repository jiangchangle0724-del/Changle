// 谁在看: the line at the top of a gathering's page saying who else has it open right now, and,
// for a few seconds when one of the others has just filled in, saying that instead.
import { useEffect, useRef, useState } from "preact/hooks";
import { hereLine } from "../../engine";
import type { Here, Person } from "../../engine";
import { Finished, type Finish } from "../finished";
import { t } from "../i18n";
import { IconCheck, useLang } from "./common";

/** How long "阿May 填好了" stays up. */
const SHOWN_MS = 4000;

export type Done = Finish & { n: number };

/** Who of the others has just filled in, while it is being said. `skip`: the rows this phone fills in itself. */
export function useFinished(people: readonly Person[] | undefined, skip: readonly (string | null | undefined)[]): Done | null {
  const [done, setDone] = useState<Done | null>(null);
  const count = useRef(0);
  const finished = useRef<Finished | null>(null);
  if (!finished.current) {
    finished.current = new Finished((finish) => {
      const n = ++count.current;
      setDone({ ...finish, n });
      setTimeout(() => setDone((now) => (now?.n === n ? null : now)), SHOWN_MS);
    });
  }
  useEffect(() => () => finished.current?.stop(), []);
  useEffect(() => {
    if (people) finished.current!.look(people, skip);
  }, [people]);
  return done;
}

/** One line, always there (nothing below it moves when people come and go): its dot is lit while anyone else has the page open. */
export function HereLine({ here, people, done }: { here: Here | null; people: readonly Person[]; done: Done | null }) {
  const lang = useLang();
  const anyone = !!here && (here.ids.length + here.others > 0 || here.host);
  return (
    <p class="here" data-on={anyone || done ? "" : undefined} aria-live="polite">
      {done ? (
        // a new key each time, so the tick pops again for the next one
        <span class="here-done" key={done.n}>
          <IconCheck size={16} />
          <span>{t(done.first ? "hereDone" : "hereChanged", { name: done.name })}</span>
        </span>
      ) : (
        <span class="here-who">{here ? hereLine(here, people, lang) : ""}</span>
      )}
    </p>
  );
}
