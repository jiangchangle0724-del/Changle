# party-server · changle.ca/party

The room server and pages of 一起跳 · Dance Along (and later 打碟 · DJ Booth). It wires the shared
base in `games/party-base` (types, clock sync, calibration, scoring, the room state machine: pure
functions, read its `CONTRACTS.md`) to a Cloudflare Worker, one Durable Object per room, and two
pages. The plan is `docs/dance-along.md`; this folder is its task A1.

## What's here (A1)

- **Rooms**: `src/server/worker.ts` (the Worker and the `PartyRoom` Durable Object) around
  `src/server/session.ts` (the session: pure, tested). Every page message from the host becomes a
  party-base `RoomEvent`, stamped in speaker time, through `reduce()`; the new state is stored and
  sent to every page. A page that drops gets a grace period (speaker 8 s, phone 45 s) before it
  counts as gone. What the pages and the room say: `src/shared/protocol.ts`.
- **The room's one clock** is the speaker page's `performance.now()`. The speaker pings the room
  every second, works out its offset to the room's clock (party-base's `estimateClockOffset`) and
  reports it; the room answers every phone's ping with `{ speakerAt }`. Phones send 8 pings on
  joining, 3 more every 15 s, and count their clock as set after 6.
- **`/party/screen`**, the speaker (`src/client/screen.ts`): Start (starts the audio and keeps the
  screen on), the room code and QR code, the players (a phone's 我在 lights its name), the 120 BPM
  clicks made with an oscillator (no audio files), scheduled on the audio clock. Calibration: 8
  clicks 1.2 s apart, the host's taps in speaker time, `calibrateFromTaps()`; three tries.
- **`/party/join`**, a phone (`src/client/join.ts`): code and name, clock sync, a flash on every
  beat the room hears (the speaker's grid plus the TV's delay), 我在, and for the host: calibrate
  (a big button to tap with the TV), start the 120 BPM metronome, dance, restart, end the room.
- **测量 / Timing** on both pages: the speaker's clock in big digits, for the field test (a photo
  of the two screens side by side shows the error).

A1 has one routine: a 2-minute 120 BPM click track (`METRONOME` in `src/shared/protocol.ts`).
Sensors (A2, A3), the coach and the music don't exist yet.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck && npm test          # the session: 18 tests
npm run dev                            # http://127.0.0.1:8787/party/screen and /party/join
BASE=http://127.0.0.1:8787 node scripts/timing-check.cjs
```

`scripts/timing-check.cjs` plays a whole session in Chromium on one machine (a speaker page, three
phones): each phone's clock error against the truth, calibration with taps 180 ms after the
clicks, the flashes against the beats, 我在, a phone reloaded mid-dance, the end. It prints the
numbers and OK or FAILED. Results: `docs/field-notes/`.

## Going live (once, by Steve)

Like 随便: merging into `main` deploys it once Cloudflare is connected.

1. Cloudflare dashboard > Workers & Pages > Create > Import a repository > `changle-ca`.
   Project name `party` (it must match `name` in `wrangler.jsonc`), root directory
   `games/party-server`, build command `npm run build`,
   deploy command `npx wrangler deploy`, build watch paths `games/party-server/*` and
   `games/party-base/*`.
2. Nothing else: no secrets, no database to make (the Durable Object comes with the deploy).

It runs on the free plan (SQLite-backed Durable Objects). The speaker's clock report every second
stays in memory; the room writes to storage only when something changes.
