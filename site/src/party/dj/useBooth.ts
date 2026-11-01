import { useCallback, useEffect, useRef, useState } from "react";
import type { DjPhase } from "../../shared/dj/types";
import { FakeDj } from "./fake/FakeDj";
import { Speaker } from "./speaker/speaker";

export type BoothStatus = "idle" | "starting" | "on" | "error";

/** How the playing has gone since the last report (sent to the room once a minute). */
export type BoothReport = { stalls: number; resets: number; seconds: number };

/**
 * One booth per page: the speaker (with the tap that woke its sound) and the stand-in DJ (with the
 * sections it has recorded) outlive the screen that shows them. When the host closes the booth and
 * opens it again, the music comes back without anyone walking over to the TV to tap again.
 */
type PageBooth = { dj: FakeDj; speaker: Speaker | null; starting: boolean; error: boolean; listeners: Set<() => void> };
let page: PageBooth | null = null;
function pageBooth(): PageBooth {
  if (!page) page = { dj: new FakeDj(), speaker: null, starting: false, error: false, listeners: new Set() };
  return page;
}
const statusOf = (b: PageBooth): BoothStatus => (b.speaker ? "on" : b.starting ? "starting" : b.error ? "error" : "idle");

/**
 * The speaker's side of the booth: the sound chain, the stand-in DJ following the night's phase,
 * and the clocks the dancers and lights read. `start()` must run inside a tap.
 */
export function useBooth({ phase, muted, onReport }: { phase: DjPhase; muted: boolean; onReport?: (r: BoothReport) => void }) {
  const booth = pageBooth();
  const { dj } = booth;
  const [status, setStatus] = useState<BoothStatus>(() => statusOf(booth));
  const [prepared, setPrepared] = useState(dj.ready);
  const speaker = status === "on" ? booth.speaker : null;
  const report = useRef(onReport);
  report.current = onReport;

  useEffect(() => {
    const sync = () => setStatus(statusOf(booth));
    booth.listeners.add(sync);
    sync();
    return () => {
      booth.listeners.delete(sync);
    };
  }, [booth]);

  // record the sections straight away: no tap needed, and the music can start the moment it's asked for
  useEffect(() => {
    dj.onReady = () => setPrepared(true);
    if (dj.ready) setPrepared(true);
    dj.prepare(phase);
    return () => {
      dj.onReady = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dj]);

  const start = useCallback(() => {
    if (booth.speaker || booth.starting) return;
    let sp: Speaker;
    try {
      // made and woken inside the tap
      sp = new Speaker();
    } catch {
      booth.error = true;
      booth.listeners.forEach((fn) => fn());
      return;
    }
    booth.starting = true;
    booth.error = false;
    booth.listeners.forEach((fn) => fn());
    sp.ready()
      .then(() => {
        booth.speaker = sp;
        dj.attach(sp);
      })
      .catch(() => {
        sp.close();
        booth.error = true;
      })
      .finally(() => {
        booth.starting = false;
        booth.listeners.forEach((fn) => fn());
      });
  }, [booth, dj]);

  // the music follows the night while this screen is up; when it goes (the booth closed), quiet
  useEffect(() => dj.setPhase(phase), [dj, phase]);
  useEffect(() => () => dj.setPhase("wait"), [dj]);
  useEffect(() => speaker?.setVolume(muted ? 0 : 1), [speaker, muted]);

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
    let playing = 0;
    let lastAt = performance.now();
    const sample = window.setInterval(() => {
      const now = performance.now();
      if (speaker.stats().state === "playing") playing += (now - lastAt) / 1000;
      lastAt = now;
    }, 1000);
    const send = window.setInterval(() => {
      const st = speaker.stats().stalls;
      const r = { stalls: Math.max(0, st - stalls), resets: wakes.current - woke, seconds: Math.round(playing) };
      stalls = st;
      woke = wakes.current;
      playing = 0;
      if (r.seconds > 0 || r.stalls > 0 || r.resets > 0) report.current?.(r);
    }, 60_000);
    return () => {
      window.clearInterval(sample);
      window.clearInterval(send);
    };
  }, [speaker]);

  return { start, status, prepared, speaker, dj, stopped, wake };
}
