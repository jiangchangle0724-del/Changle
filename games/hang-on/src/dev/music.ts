/**
 * 背景音乐的试听页（`/hang-on/music.html`，11-13）：选场景、拖紧张、点事件，听音乐怎么变。
 * 和主机页同一套（`src/audio/music.ts`）；`hangOnMusic.renderWav` 离线导出一段 WAV（检查脚本和给 Steve 听的样本用）。
 */
import { Music } from '../audio/music';
import { bpmFor } from '../audio/composer';
import { seedOf, THEMES, type Theme } from '../audio/themes';
import { applyStatic, langButton, onLang, pickLang } from '../i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const music = new Music();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let theme: Theme = THEMES.table as Theme;
let playing = false;
let demoAt: number | null = null;

langButton($<HTMLButtonElement>('langBtn'));
applyStatic();

function renderThemes(): void {
  const box = $('themes');
  box.innerHTML = '';
  for (const t of Object.values(THEMES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(t === theme));
    b.textContent = pickLang(t.name);
    b.addEventListener('click', () => {
      theme = t;
      music.scene(t, seedOf(t.id));
      renderThemes();
    });
    box.append(b);
  }
}
renderThemes();
onLang(() => {
  renderThemes();
  renderPlay();
});

function renderPlay(): void {
  const b = $('playBtn');
  b.setAttribute('aria-pressed', String(playing));
  b.textContent = playing ? pickLang({ zh: '停', en: 'Stop' }) : pickLang({ zh: '放', en: 'Play' });
}

async function ensure(): Promise<void> {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp).connect(ctx.destination);
    music.connect(ctx, master);
    music.scene(theme, seedOf(theme.id));
  }
  if (ctx.state !== 'running') await ctx.resume();
}

function tick(): void {
  if (!ctx) return;
  if (demoAt !== null) {
    const t = ctx.currentTime - demoAt;
    setTension(demoCurve(t));
    if (t > 34 && t < 34.1) music.win();
    if (t > 38) demoAt = null;
  }
  music.pump(ctx.currentTime, ctx.currentTime + 0.18);
  $('bpm').textContent = `${Math.round(bpmFor(theme, music.intensity))} bpm`;
  $('level').style.width = `${Math.round(music.intensity * 100)}%`;
}

function setTension(v: number): void {
  music.intensity = v;
  $<HTMLInputElement>('tension').value = String(v);
}

/** 40 秒演示：平常 → 危险 → 危机 → 平常 → 到顶。 */
function demoCurve(t: number): number {
  if (t < 10) return 0.35;
  if (t < 17) return 0.35 + ((t - 10) / 7) * 0.4;
  if (t < 25) return 0.97;
  if (t < 28) return 0.97 - ((t - 25) / 3) * 0.55;
  return 0.42;
}

$('playBtn').addEventListener('click', async () => {
  await ensure();
  playing = !playing;
  if (playing) {
    music.setPhase('countdown');
    music.setPhase('playing');
    music.intensity = Number($<HTMLInputElement>('tension').value);
    if (!timer) timer = setInterval(tick, 40);
  } else {
    music.setPhase('off');
    demoAt = null;
  }
  renderPlay();
});

$<HTMLInputElement>('tension').addEventListener('input', (e) => {
  demoAt = null;
  music.intensity = Number((e.target as HTMLInputElement).value);
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-i]'))
  b.addEventListener('click', () => {
    demoAt = null;
    setTension(Number(b.dataset.i));
  });
$('cpBtn').addEventListener('click', () => music.flourish());
$('fallBtn').addEventListener('click', () => {
  music.duck();
  setTension(Math.min(1, music.intensity + 0.3));
});
$('winBtn').addEventListener('click', () => {
  music.win();
  setTimeout(() => {
    if (playing) {
      music.setPhase('results');
      music.setPhase('countdown');
      music.setPhase('playing');
    }
  }, 4000);
});
$('demoBtn').addEventListener('click', async () => {
  await ensure();
  playing = true;
  music.setPhase('countdown');
  music.setPhase('playing');
  if (!timer) timer = setInterval(tick, 40);
  demoAt = (ctx as AudioContext).currentTime;
  renderPlay();
});

/** 离线导出一段（检查脚本、给人听的样本）：返回 16 位 PCM 的 WAV（base64）。 */
async function renderWav(themeId: string, seconds: number, curve: 'demo' | number, sampleRate = 44100): Promise<string> {
  const off = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  const bus = off.createGain();
  bus.gain.value = 0.8;
  bus.connect(comp).connect(off.destination);
  const m = new Music();
  m.connect(off, bus);
  const t = THEMES[themeId] as Theme;
  m.scene(t, seedOf(t.id));
  m.setPhase('countdown');
  m.setPhase('playing');
  const fn = curve === 'demo' ? demoCurve : () => curve;
  m.render(seconds, fn, curve === 'demo' ? [{ t: 14, do: 'flourish' }, { t: 21, do: 'duck' }, { t: 34, do: 'win' }] : []);
  const buf = await off.startRendering();
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, s: string): void => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * 4, true);
  w(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * 4, true);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i] as number)) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i] as number)) * 32767, true);
  }
  let s = '';
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as { hangOnMusic: unknown }).hangOnMusic = { music, renderWav, THEMES };
