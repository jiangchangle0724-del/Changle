/**
 * 打碟 · DJ Booth: 报幕, the plan's "偶尔用语音报幕「下面这首来自 Jackie」". As the countdown into a
 * song asked for starts, the big screen says who it's from, over the build-up, with the music
 * dipping under its voice, and shows it across the floor. The browser's own voice, in the screen's
 * language; with no voice for that language the screen only shows it (another language's voice
 * would read it wrong). Once a song; the host can turn it off from their phone (`voice`).
 *
 * An iPhone or iPad never speaks it, only shows it (Steve on Nov 14: on the shared phone the music
 * stopped by itself and a tap didn't bring it back). There the page's voice stops the page's other
 * sound (WebKit bug 218815), and the sound can stay stopped whatever the page does after (bug
 * 273511).
 */
import { useEffect, useRef, useState } from "react";
import { onAir } from "../../shared/dj/deck";
import type { DjView } from "../../shared/protocol";
import type { Speaker } from "./speaker/speaker";

/** What the screen says. */
export const announceText = (name: string, zh: boolean) => (zh ? `下面这首来自 ${name}` : `Next up, a request from ${name}`);
/** How long the words stay on the floor. */
const SHOWN_MS = 3200;

/** The browser's voice for the language: Mandarin first (a Cantonese voice reads it differently), any English. */
function voiceFor(zh: boolean): SpeechSynthesisVoice | null {
  const all = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  const tag = (x: SpeechSynthesisVoice) => x.lang.replace("_", "-").toLowerCase();
  if (!zh) return all.find((x) => tag(x).startsWith("en")) ?? null;
  return all.find((x) => tag(x) === "zh-cn") ?? all.find((x) => tag(x) === "zh-tw") ?? all.find((x) => tag(x).startsWith("zh") && !/hk|yue/.test(tag(x))) ?? null;
}

/** Whether this device's voice can speak over the music: not on an iPhone or iPad (above). */
export function voiceSafe(): boolean {
  if (typeof navigator === "undefined" || typeof speechSynthesis === "undefined") return false;
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return !apple;
}

/** A tap on the screen lets it speak later (Safari and Chrome only let a page talk after one). */
export function primeVoice() {
  if (!voiceSafe()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* no voice here: nothing to say later either */
  }
}

/**
 * The screen says who the song coming in is from, as the countdown into it starts (where its voice
 * can: above), and shows it: what to show now, numbered so the same words again show again.
 */
export function useAnnounce(v: DjView, speaker: Speaker | null, nameOf: (pid: string) => string, zh: boolean, on: boolean): { text: string; n: number } | null {
  const said = useRef(new Set<string>());
  const [shown, setShown] = useState<{ text: string; n: number } | null>(null);
  const d = v.deck;
  const up = d?.up ?? null;
  // the drop lands on the deck the song is on (one still loading: the drop stays where it is)
  const into = !!d?.drop && !!up && d.drop.to !== onAir(d);
  const id = up?.id ?? "";
  useEffect(() => {
    if (!on || !into || !up || said.current.has(up.id)) return;
    said.current.add(up.id);
    const text = announceText(nameOf(up.by), zh);
    setShown((x) => ({ text, n: (x?.n ?? 0) + 1 }));
    const voice = voiceSafe() ? voiceFor(zh) : null;
    if (import.meta.env.DEV) ((window as unknown as { __said?: unknown[] }).__said ??= []).push({ text, voice: voice?.name ?? null, at: Date.now() });
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    let back = 0;
    const done = () => {
      window.clearTimeout(back);
      speaker?.duck(false);
    };
    u.onstart = () => speaker?.duck(true);
    u.onend = done;
    u.onerror = done;
    // (a voice that never says it's done: the music comes back anyway)
    back = window.setTimeout(done, 8000);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, into, id]);
  // shown for a few seconds
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(null), SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [shown]);
  return shown;
}

