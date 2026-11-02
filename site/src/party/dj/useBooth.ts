import { useCallback, useEffect, useRef, useState } from "react";
import { FAKE_MIX, mixFor, playing } from "../../shared/dj/curve";
import type { DjPhase, Mix, Source } from "../../shared/dj/types";
import { FakeDj } from "./fake/FakeDj";
import { FINAL, LyriaDj, type LyriaWhy } from "./lyria/LyriaDj";
import { Speaker } from "./speaker/speaker";

export type BoothStatus = "idle" | "starting" | "on" | "error";

/** How the playing has gone since the last report (sent to the room once a minute). */
export type BoothReport = { stalls: number; resets: number; seconds: number };

/** Whichever DJ is playing, as the screens read it: the beat, the stretch being heard. */
export type BoothDj = {
  /** the stand-in has music recorded (it always starts the night) */
  readonly ready: boolean;
  beat(): number;
  heardSection(): { id: string; phase: DjPhase } | null;
  holdFor(ms: number): void;
};

/**
 * One booth per page: the speaker (with the tap that woke its sound), the stand-in DJ (with the
 * sections it has recorded) and, at one of the owner's tables, the Lyria DJ outlive the screen
 * that shows them. When the host closes the booth and opens it again, the music comes back
 * without anyone walking over to the TV to tap again.
 */
type PageBooth = {
  fake: FakeDj;
  lyria: LyriaDj | null;
  /** which one the speaker is playing */
  using: Source;
  /** Lyria said no for good at this table (not the owner's, no key, the month's cap) */
  blocked: { key: string; why: LyriaWhy } | null;
  speaker: Speaker | null;
  starting: boolean;
  error: boolean;
  listeners: Set<() => void>;
  dj: BoothDj;
};
let page: PageBooth | null = null;
function pageBooth(): PageBooth {
  if (!page) {
    const b = { fake: new FakeDj(), lyria: null, using: "fake", blocked: null, speaker: null, starting: false, error: false, listeners: new Set() } as unknown as PageBooth;
    const now = () => (b.using === "lyria" && b.lyria ? b.lyria : b.fake);
    b.dj = {
      get ready() {
        return b.fake.ready;
      },
      beat: () => now().beat(),
      heardSection: () => now().heardSection(),
      holdFor: (ms) => now().holdFor(ms),
    };
    page = b;
  }
  return page;
}
const statusOf = (b: PageBooth): BoothStatus => (b.speaker ? "on" : b.starting ? "starting" : b.error ? "error" : "idle");
const tell = (b: PageBooth) => b.listeners.forEach((fn) => fn());

/** Where the speaker may stream Lyria from (the table's relay), when the table may (`v.lab`). */
export type LyriaAt = { url: string; key: string };

/**
 * The speaker's side of the booth: the sound chain, the DJ following the night's phase, and the
 * clocks the dancers and lights read. `start()` must run inside a tap. The stand-in always starts
 * the music; at one of the owner's tables Lyria takes over once it has a few seconds in hand, and
 * if it stops for good the stand-in comes back.
 */
export function useBooth({ phase, mix, muted, onReport, lyria }: { phase: DjPhase; mix?: Mix; muted: boolean; onReport?: (r: BoothReport) => void; lyria?: LyriaAt | null }) {
  const booth = pageBooth();
  const { fake } = booth;
  const [status, setStatus] = useState<BoothStatus>(() => statusOf(booth));
  const [source, setSource] = useState<Source>(booth.using);
  const [prepared, setPrepared] = useState(fake.ready);
  const speaker = status === "on" ? booth.speaker : null;
  const report = useRef(onReport);
  report.current = onReport;
  const theMix = mix ?? mixFor(phase, FAKE_MIX);

  useEffect(() => {
    const sync = () => {
      setStatus(statusOf(booth));
      setSource(booth.using);
    };
    booth.listeners.add(sync);
    sync();
    return () => {
      booth.listeners.delete(sync);
    };
  }, [booth]);

  // record the sections straight away: no tap needed, and the music can start the moment it's asked for
  useEffect(() => {
    fake.onReady = () => setPrepared(true);
    if (fake.ready) setPrepared(true);
    fake.prepare(phase);
    return () => {
      fake.onReady = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fake]);

  const start = useCallback(() => {
    if (booth.speaker || booth.starting) return;
    let sp: Speaker;
    try {
      // made and woken inside the tap
      sp = new Speaker();
    } catch {
      booth.error = true;
      tell(booth);
      return;
    }
    booth.starting = true;
    booth.error = false;
    tell(booth);
    sp.ready()
      .then(() => {
        booth.speaker = sp;
        fake.attach(sp);
      })
      .catch(() => {
        sp.close();
        booth.error = true;
      })
      .finally(() => {
        booth.starting = false;
        tell(booth);
      });
  }, [booth, fake]);

  // the music follows the night while this screen is up; when it goes (the booth closed), quiet
  const mixKey = JSON.stringify(theMix);
  useEffect(() => {
    fake.setPhase(phase);
    booth.lyria?.setPhase(phase, theMix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fake, booth, phase, mixKey]);
  useEffect(() => () => fake.setPhase("wait"), [fake]);
  useEffect(() => speaker?.setVolume(muted ? 0 : 1), [speaker, muted]);

  // Lyria, at one of the owner's tables, while music plays: the stand-in starts the night and
  // hands over once Lyria has a few seconds in hand; back to the stand-in if Lyria stops for good
  const lyriaKey = lyria?.key ?? "";
  useEffect(() => {
    // the table stopped being one of the owner's: a later return may try Lyria again
    if (!lyria) booth.blocked = null;
    const blocked = !!booth.blocked && booth.blocked.key === lyriaKey;
    const want = !!speaker && !!lyria && playing(phase) && !blocked;
    if (want && lyria && !booth.lyria) {
      const l = new LyriaDj(lyria.url);
      booth.lyria = l;
      l.onReady = () => {
        if (booth.lyria !== l || !booth.speaker) return;
        fake.detach();
        l.go(booth.speaker);
        booth.using = "lyria";
        tell(booth);
      };
      l.onFail = (why) => {
        if (booth.lyria !== l) return;
        booth.lyria = null;
        if (FINAL.includes(why)) booth.blocked = { key: lyriaKey, why };
        if (booth.using === "lyria" && booth.speaker) {
          booth.using = "fake";
          fake.attach(booth.speaker);
        }
        tell(booth);
      };
      l.onFiltered = (text, why) => console.warn("Lyria turned down a prompt", text, why);
      l.begin(phase, theMix);
    } else if (!want && booth.lyria) {
      const l = booth.lyria;
      booth.lyria = null;
      l.stop();
      if (booth.using === "lyria") {
        booth.using = "fake";
        const sp = booth.speaker;
        if (sp) {
          // the set ended on Lyria: fade it as the stand-in's end fades, and leave the stand-in
          // ready for the next set
          if (!playing(phase)) {
            sp.fadeOut(3);
            window.setTimeout(() => {
              if (booth.using === "fake" && !playing(phase)) sp.flush();
            }, 3500);
          }
          fake.attach(sp);
        }
      }
      tell(booth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth, fake, speaker, phase, lyriaKey]);

  // the screen goes (the booth closed, another table): Lyria goes with it, the stand-in stays
  // quiet until a booth is up again
  useEffect(
    () => () => {
      booth.blocked = null;
      const l = booth.lyria;
      if (!l) return;
      booth.lyria = null;
      l.stop();
      if (booth.using === "lyria") {
        booth.using = "fake";
        fake.setPhase("wait");
        if (booth.speaker) {
          booth.speaker.fadeOut(1);
          fake.attach(booth.speaker);
        }
      }
      tell(booth);
    },
    [booth, fake],
  );

  // the phone or tablet stopped the sound (the screen locked, a call): it takes a tap to wake it
  const [stopped, setStopped] = useState(false);
  const wakes = useRef(0);
  useEffect(() => {
    if (!speaker) return;
    const id = window.setInterval(() => setStopped(!speaker.running), 1000);
    return () => window.clearInterval(id);
  }, [speaker]);
  const wake = useCallback(() => {
    speaker?.resume();
    wakes.current += 1;
    setStopped(false);
  }, [speaker]);

  // once a minute: stalls since the last report, times the sound had to be woken, seconds played
  useEffect(() => {
    if (!speaker) return;
    let stalls = speaker.stats().stalls;
    let woke = wakes.current;
    let played = 0;
    let lastAt = performance.now();
    const sample = window.setInterval(() => {
      const now = performance.now();
      if (speaker.stats().state === "playing") played += (now - lastAt) / 1000;
      lastAt = now;
    }, 1000);
    const send = window.setInterval(() => {
      const st = speaker.stats().stalls;
      const r = { stalls: Math.max(0, st - stalls), resets: wakes.current - woke, seconds: Math.round(played) };
      stalls = st;
      woke = wakes.current;
      played = 0;
      if (r.seconds > 0 || r.stalls > 0 || r.resets > 0) report.current?.(r);
    }, 60_000);
    return () => {
      window.clearInterval(sample);
      window.clearInterval(send);
    };
  }, [speaker]);

  return { start, status, prepared, speaker, dj: booth.dj, source, stopped, wake };
}
