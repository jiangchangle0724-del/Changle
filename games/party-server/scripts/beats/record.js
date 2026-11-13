// A song's beat, measured in its YouTube video, step 1 of 2: record how loud it is, silently.
// Every song's beat is measured this way before it goes into src/shared/songs.ts (there's no
// finding it at a party any more). In a desktop browser that can play YouTube (a data centre's
// can't: error 150):
//   1. open https://www.youtube-nocookie.com/robots.txt (the embedded player is then the same
//      site as the page, so the page can listen to its video);
//   2. set VID below to the video's id and run this whole file in the page's console;
//   3. let the video play to its end (nothing is heard: its sound goes only to the measuring);
//   4. run fit.js in the same page.
// One tab per song; several songs can be measured at once in several tabs (not the same video
// twice). What it keeps: the loudness of every 256 samples, all of them and under 150 Hz (the
// kick), and where the video was at each moment, so stalls and buffering don't matter.
const VID = "__VID__";
document.body.innerHTML = "";
const f = document.createElement("iframe");
f.id = "yt";
f.width = 640;
f.height = 360;
f.allow = "autoplay";
f.src = `https://www.youtube-nocookie.com/embed/${VID}?mute=1&autoplay=0&enablejsapi=1`;
document.body.appendChild(f);
await new Promise((r) => setTimeout(r, 5000));
const w = f.contentWindow;
const d = w.document;
const v = d.querySelector("video");
const ctx = new w.AudioContext();
const src = ctx.createMediaElementSource(v);
const sp = ctx.createScriptProcessor(1024, 2, 1);
// (silent: the video's sound goes through the measuring into a gain of 0)
const zero = ctx.createGain();
zero.gain.value = 0;
src.connect(sp);
sp.connect(zero);
zero.connect(ctx.destination);
const sr = ctx.sampleRate;
const SUB = 256;
const a = Math.exp((-2 * Math.PI * 150) / sr);
let lp = 0;
const S = { vid: VID, sr, rows: [], pairs: [], ctx, v, events: 0 };
sp.onaudioprocess = (e) => {
  S.events++;
  const L = e.inputBuffer.getChannelData(0);
  const R = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : L;
  const t0 = e.playbackTime;
  S.pairs.push([ctx.currentTime, v.currentTime, v.paused ? 1 : 0, t0, v.duration || 0]);
  if (v.paused) return;
  for (let i = 0; i < L.length; i += SUB) {
    let eAll = 0;
    let eLow = 0;
    for (let j = i; j < i + SUB; j++) {
      const x = (L[j] + R[j]) * 0.5;
      lp = (1 - a) * x + a * lp;
      eAll += x * x;
      eLow += lp * lp;
    }
    S.rows.push(t0 + i / sr, eAll / SUB, eLow / SUB);
  }
};
window.__an = S;
const p = d.getElementById("movie_player");
p.unMute();
p.setVolume(100);
p.playVideo();
await new Promise((r) => setTimeout(r, 4000));
// (playing, its sound on, no ad: then wait for its end; `ad: true` means wait for the ad, then check again)
({ vid: VID, ctx: ctx.state, state: p.getPlayerState(), t: v.currentTime, dur: v.duration, muted: v.muted, rows: S.rows.length / 3, ad: !!d.querySelector(".ad-showing"), err: (d.querySelector(".ytp-error") || {}).textContent || null });
