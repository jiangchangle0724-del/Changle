// A stand-in for Google's Lyria RealTime, for local runs and checks (no key, no network): it speaks
// the same WebSocket protocol (BidiGenerateMusic: setup, weighted prompts, config, playback) and
// streams 16-bit stereo PCM at 48 kHz, faster than real time as Lyria does, with a kick on every
// beat at the asked tempo (the first beat OFFSET_MS into the stream) so the beat can be found.
//
//   node scripts/fake_lyria.mjs            # ws://127.0.0.1:8790
//   PORT=8790 SPEED=2 CHUNK_S=2 OFFSET_MS=137 node scripts/fake_lyria.mjs
//
// Its JSON goes out in binary frames, as Google's may (its SDK reads both); TEXT=1 sends text.
//
// For checks, over plain HTTP on the same port: GET /state (what it was sent), GET /drop (close
// every stream, as a dropped connection), GET /reset. In site/worker/.dev.vars, point the rooms
// server at it: DEV_LYRIA_URL=ws://127.0.0.1:8790 (and DEV_LYRIA_ANYONE=1 to let any table try).
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8790);
const SPEED = Number(process.env.SPEED || 2);
const CHUNK_S = Number(process.env.CHUNK_S || 2);
const OFFSET_MS = Number(process.env.OFFSET_MS || 137);
const TEXT = process.env.TEXT === "1";
const emit = (ws, o) => ws.send(TEXT ? JSON.stringify(o) : Buffer.from(JSON.stringify(o)), { binary: !TEXT });
const RATE = 48000;

const state = { connections: 0, open: 0, setups: 0, prompts: null, config: null, plays: {}, seconds: 0, filtered: 0, drops: 0 };

function chunk(s, frames) {
  // s: the stream's state; returns interleaved Int16 stereo for the next `frames` frames
  const bpm = s.config?.bpm || 120;
  const density = s.config?.density ?? 0.5;
  const beat = (RATE * 60) / bpm;
  const off = Math.round((OFFSET_MS / 1000) * RATE);
  // a chord whose root follows the prompts: a change of prompts is a change you can hear
  const words = (s.prompts || []).map((p) => p.text).join("|");
  let h = 0;
  for (const c of words) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const root = 110 * Math.pow(2, (h % 7) / 12);
  const out = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const f = s.pos + i;
    const sinceBeat = (((f - off) % beat) + beat) % beat;
    const t = sinceBeat / RATE;
    // the kick: a falling sine, loud and short
    const kick = f >= off ? Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 0.8 : 0;
    // offbeat hats: a burst of noise half a beat after the kick
    const tHat = (((f - off - beat / 2) % beat) + beat) % beat;
    const hat = tHat < 0.03 * RATE ? (Math.random() * 2 - 1) * 0.12 * Math.exp((-tHat / RATE) * 120) : 0;
    const time = f / RATE;
    const pad = (Math.sin(2 * Math.PI * root * time) + Math.sin(2 * Math.PI * root * 1.5 * time) + Math.sin(2 * Math.PI * root * 2 * time)) * 0.05 * (0.4 + density);
    const l = kick + hat + pad;
    const r = kick + hat * 0.8 + pad;
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l * 30000)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r * 30000)));
  }
  s.pos += frames;
  return Buffer.from(out.buffer).toString("base64");
}

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  state.connections += 1;
  state.open += 1;
  const s = { setup: false, playing: false, pos: 0, prompts: null, config: null, timer: null };
  const stopTimer = () => {
    clearInterval(s.timer);
    s.timer = null;
  };
  const startTimer = () => {
    if (s.timer) return;
    s.timer = setInterval(() => {
      if (!s.playing || ws.readyState !== 1) return;
      const frames = Math.round(CHUNK_S * RATE);
      const data = chunk(s, frames);
      state.seconds += CHUNK_S;
      emit(ws, { serverContent: { audioChunks: [{ data, mimeType: "audio/l16;rate=48000;channels=2" }] } });
    }, (CHUNK_S * 1000) / SPEED);
  };
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.close(1007, "bad json");
      return;
    }
    if (!s.setup) {
      if (!msg.setup?.model) {
        ws.close(1008, "setup first");
        return;
      }
      s.setup = true;
      state.setups += 1;
      setTimeout(() => ws.readyState === 1 && emit(ws, { setupComplete: {} }), 80);
      return;
    }
    if (msg.clientContent?.weightedPrompts) {
      s.prompts = msg.clientContent.weightedPrompts;
      state.prompts = s.prompts;
      for (const p of s.prompts)
        if (/forbidden/i.test(p.text)) {
          state.filtered += 1;
          emit(ws, { filteredPrompt: { text: p.text, filteredReason: "a test filter" } });
        }
    } else if (msg.musicGenerationConfig) {
      s.config = { ...s.config, ...msg.musicGenerationConfig };
      state.config = s.config;
    } else if (msg.playbackControl) {
      const c = msg.playbackControl;
      state.plays[c] = (state.plays[c] || 0) + 1;
      if (c === "PLAY") {
        s.playing = true;
        startTimer();
      } else if (c === "PAUSE") s.playing = false;
      else if (c === "STOP") {
        s.playing = false;
        s.pos = 0;
      } else if (c === "RESET_CONTEXT") s.pos = 0;
    }
  });
  ws.on("close", () => {
    state.open -= 1;
    stopTimer();
  });
});

const server = createServer((req, res) => {
  const json = (o) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(o));
  };
  if (req.url === "/state") return json(state);
  if (req.url === "/drop") {
    state.drops += 1;
    for (const c of wss.clients) c.close(1011, "dropped");
    return json({ dropped: true });
  }
  if (req.url === "/reset") {
    Object.assign(state, { connections: 0, setups: 0, prompts: null, config: null, plays: {}, seconds: 0, filtered: 0, drops: 0 });
    return json({ reset: true });
  }
  res.writeHead(404);
  res.end();
});
server.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)));
server.listen(PORT, "127.0.0.1", () => console.log(`fake Lyria on ws://127.0.0.1:${PORT} (x${SPEED}, ${CHUNK_S} s chunks, first beat at ${OFFSET_MS} ms)`));
