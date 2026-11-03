/**
 * 打碟 · DJ Booth: 报幕, the plan's "偶尔用语音报幕「下面这首来自 Jackie」". As the countdown into a
 * song asked for starts, the big screen says who it's from, over the build-up, with the music
 * dipping under its voice. The browser's own voice, in the screen's language; with no voice for that
 * language the screen stays quiet (another language's voice would read it wrong). Once a song; the
 * host can turn it off from their phone (`voice`).
 */
import { useEffect, useRef } from "react";
import { onAir } from "../../shared/dj/deck";
import type { DjView } from "../../shared/protocol";
import type { Speaker } from "./speaker/speaker";

/** What the screen says. */
export const announceText = (name: string, zh: boolean) => (zh ? `下面这首来自 ${name}` : `Next up, a request from ${name}`);

/** The browser's voice for the language: Mandarin first (a Cantonese voice reads it differently), any English. */
function voiceFor(zh: boolean): SpeechSynthesisVoice | null {
  const all = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  const tag = (x: SpeechSynthesisVoice) => x.lang.replace("_", "-").toLowerCase();
  if (!zh) return all.find((x) => tag(x).startsWith("en")) ?? null;
  return all.find((x) => tag(x) === "zh-cn") ?? all.find((x) => tag(x) === "zh-tw") ?? all.find((x) => tag(x).startsWith("zh") && !/hk|yue/.test(tag(x))) ?? null;
}

/** A tap on the screen lets it speak later (Safari and Chrome only let a page talk after one). */
export function primeVoice() {
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* no voice here: nothing to say later either */
  }
}

/** The screen says who the song coming in is from, as the countdown into it starts. */
export function useAnnounce(v: DjView, speaker: Speaker | null, nameOf: (pid: string) => string, zh: boolean, on: boolean) {
  const said = useRef(new Set<string>());
  const d = v.deck;
  const up = d?.up ?? null;
  // the drop lands on the deck the song is on (one still loading: the drop stays where it is)
  const into = !!d?.drop && !!up && d.drop.to !== onAir(d);
  const id = up?.id ?? "";
  useEffect(() => {
    if (!on || !into || !up || said.current.has(up.id)) return;
    said.current.add(up.id);
    const text = announceText(nameOf(up.by), zh);
    const voice = voiceFor(zh);
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
}
