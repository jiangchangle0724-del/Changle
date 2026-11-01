import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DjPhase } from "../../shared/dj/types";
import { FakeDj } from "./fake/FakeDj";
import { Speaker } from "./speaker/speaker";

export type BoothStatus = "idle" | "starting" | "on" | "error";

/** How the playing has gone since the last report (sent to the room once a minute). */
export type BoothReport = { stalls: number; resets: number; seconds: number };

/**
 * The speaker's side of the booth: the sound chain, the stand-in DJ following the night's phase,
 * and the clocks the dancers and lights read. `start()` must run inside a tap.
 */
export function useBooth({ phase, muted, onReport }: { phase: DjPhase; muted: boolean; onReport?: (r: BoothReport) => void }) {
  const dj = useMemo(() => new FakeDj(), []);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [status, setStatus] = useState<BoothStatus>("idle");
  const [prepared, setPrepared] = useState(false);
  const report = useRef(onReport);
  report.current = onReport;

  // record the sections straight away: no tap needed, and the music can start the moment it's asked for
  useEffect(() => {
    dj.onReady = () => setPrepared(true);
    dj.prepare(phase);
    return () => dj.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dj]);

  const start = useCallback(() => {
    if (status === "starting" || status === "on") return;
    let sp: Speaker;
    try {
      // made and woken inside the tap
      sp = new Speaker();
    } catch {
      setStatus("error");
      return;
    }
    setStatus("starting");
    sp.ready()
      .then(() => {
        dj.attach(sp);
        setSpeaker(sp);
        setStatus("on");
      })
      .catch(() => {
        sp.close();
        setStatus("error");
      });
  }, [dj, status]);

  useEffect(() => dj.setPhase(phase), [dj, phase]);

  // the phone or tablet stopped the sound (the screen locked, a call): it takes a tap to wake it
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!speaker) return;
    const id = window.setInterval(() => setStopped(!speaker.running), 1000);
    return () => window.clearInterval(id);
  }, [speaker]);
  useEffect(() => speaker?.setVolume(muted ? 0 : 1), [speaker, muted]);
  useEffect(() => () => speaker?.close(), [speaker]);

  // once a minute: stalls since the last report and seconds played
  useEffect(() => {
    if (!speaker) return;
    let stalls = speaker.stats().stalls;
    let playing = 0;
    let lastAt = performance.now();
    const sample = window.setInterval(() => {
      const now = performance.now();
      if (speaker.stats().state === "playing") playing += (now - lastAt) / 1000;
      lastAt = now;
    }, 1000);
    const send = window.setInterval(() => {
      const st = speaker.stats().stalls;
      const r = { stalls: Math.max(0, st - stalls), resets: 0, seconds: Math.round(playing) };
      stalls = st;
      playing = 0;
      if (r.seconds > 0 || r.stalls > 0) report.current?.(r);
    }, 60_000);
    return () => {
      window.clearInterval(sample);
      window.clearInterval(send);
    };
  }, [speaker]);

  const wake = useCallback(() => {
    speaker?.resume();
    setStopped(false);
  }, [speaker]);

  return { start, status, prepared, speaker, dj, stopped, wake };
}
