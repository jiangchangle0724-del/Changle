// One game room: who is here, which team they're on, and the running game.
// It knows nothing about networks. The Cloudflare Durable Object (server/worker.ts) and the
// single-device demo (local/) both wrap it: they pass messages in, call tick() when nextWake()
// comes due, and send each person their view().
import * as E from "../engine";
import {
  MAX_TEAMS,
  MAX_TEAM_SIZE,
  TIMING,
  TRIVIA_PRIZE,
  TRIVIA_WRONG,
  type ClientMsg,
  type FeedItem,
  type GameView,
  type Lang,
  type Role,
  type RoomView,
  type ServerMsg,
  type Settings,
  type PartyWhy,
  type TeamView,
  type TriviaView,
} from "./protocol";
import { FORFEITS } from "./party";
import { LEGACY_ORDER, SEEN_KEEP, TRIVIA_BY_ID, cleanSeen, pickTrivia } from "./trivia";

export interface RoomEnv {
  now(): number;
  /** Unpredictable numbers in [0, 1) for seat order, quiz items, seeds. */
  random(): number;
}

interface Member {
  id: string;
  key: string;
  name: string;
  team: string | null;
  role: Role;
  /** Open connections right now. */
  online: number;
  lastSeen: number;
  joinedAt: number;
  lang: Lang;
  /** Spectator betting score. */
  score: number;
  /** The waiting teams' questions this phone has been asked (ids, oldest first): what it sent when it joined, and those asked here since. */
  seen?: string[];
}

interface Team {
  id: string;
  name: string;
  bot: E.StyleId | null;
  autoplay: boolean;
  color: number;
}

interface LiveAuction {
  id: number;
  at: number;
  price: number;
  leader: number | null;
  endsAt: number;
  botAt: number;
  bids: number;
}

interface Quiz {
  id: number;
  visitor: number;
  owner: number;
  item: number;
  endsAt: number;
  botAt: number;
}

/** The waiting players' quiz in progress (see trivia.ts). */
interface Trivia {
  id: number;
  /** The question's id in the bank (TRIVIA_BY_ID). */
  qid: string;
  /** Option order shown; the bank's options[0] is the right one. */
  order: number[];
  /**
   * Seats the question is for: everyone in the game but the team on turn when it came up, and that
   * team too once its turn is over (if there's time left to answer; see joinTrivia).
   */
  eligible: number[];
  /** Seat → the option it picked (as shown). */
  answers: Record<number, number>;
  /** Seat → when a computer team answers. */
  botAt: Record<number, number>;
  endsAt: number;
  winner: number | null;
  closed: boolean;
  revealUntil: number;
  /** Phones (member ids) that said 这题不答. Missing in rooms from before skipping. */
  skipped: string[];
}

interface Trade {
  id: number;
  from: number;
  to: number;
  give: E.Offer;
  get: E.Offer;
  createdAt: number;
  byBot?: boolean;
}

interface Bets {
  turns: number;
  seat: number;
  open: boolean;
  bets: Record<string, boolean>;
  paidRent: boolean;
}

/** A party forfeit: who does it, why, which one (an index into FORFEITS), and when it came up. */
interface HeldForfeit {
  id: number;
  seat: number;
  why: PartyWhy;
  dare: number;
  at: number;
}

interface Game {
  s: E.GameState;
  seats: string[];
  brains: E.Brain[];
  startedAt: number;
  endsAt: number | null;
  timeUp: boolean;
  /** The host paused the game. */
  paused: boolean;
  /** When the game stopped (paused, or held by a forfeit), or null while it runs. */
  pausedAt: number | null;
  /** The party forfeit holding the game until it's done (see party()), and the ones waiting their turn. Missing in older rooms. */
  forfeit?: HeldForfeit | null;
  forfeits?: HeldForfeit[];
  /** Bumped whenever the game waits on a new decision; actions must quote it. */
  decision: number;
  sig: string;
  progress: number;
  pendingSince: number;
  /** The turn clock counts from here: the decision's start, or the last move of the team it waits for (see turnClock). */
  idleFrom?: number;
  /** When the last throw or move was made (its ride and landing play before the turn clock starts). */
  moveAt?: number;
  deadline: number | null;
  silenceUntil: number | null;
  /** Rio: when the dance started (the judges wait for TIMING.dance after it). Missing in older saves. */
  danceAt?: number | null;
  auction: LiveAuction | null;
  quiz: Quiz | null;
  trivia: Trivia | null;
  /** Questions asked this game (ids): never again in it (see openTrivia). */
  triviaAsked: string[];
  /** Turn number at the last check for a team joining the question that is up (see joinTrivia). */
  triviaTurn: number;
  /**
   * When the last question came up (the game's start, before its first): the next one is at least
   * TIMING.triviaEvery after it (TIMING.triviaFirst for the first). Missing in rooms from before
   * questions came with landings.
   */
  triviaAt?: number;
  /**
   * A landing that brings a question: the city, the team that landed there, and when its move has
   * played and the question may come up (see landedOn). `busy`: teams that are waiting have had a
   * part in what the game has been busy with since (an auction, a vote, Rio's scores): when that is
   * over, the question gives them a moment to see how it came out (see afterMove). `nobody`: its
   * time came with nobody there to answer it (see dueTrivia), so a newer landing takes its place.
   */
  triviaDue?: { city: string; seat: number; at: number; busy?: boolean; nobody?: boolean } | null;
  trades: Trade[];
  bets: Bets | null;
  /** When each human seat's last phone went away. */
  awaySince: Record<number, number>;
  /** Seats the computer was covering at the last check (to announce changes). */
  covered: Record<number, boolean>;
}

export interface RoomState {
  v: 1;
  code: string;
  createdAt: number;
  lastActive: number;
  hostId: string | null;
  /** Until when a host chosen at the start keeps the role before they arrive (see claimHost). */
  hostHold?: number;
  /** The changle.ca table this game was started from: where everyone goes back to. */
  table?: string | null;
  settings: Settings;
  members: Record<string, Member>;
  teams: Team[];
  game: Game | null;
  nextId: number;
  feed: FeedItem[];
  /** The last few party forfeits dealt (FORFEITS indices), so they don't come round again soon. */
  dares?: number[];
}

export interface SaveFile {
  v: 1;
  savedAt: number;
  settings: Settings;
  teams: Team[];
  game: (Omit<Game, "awaySince" | "covered" | "trades"> & { remaining: number | null }) | null;
}

export interface Flush {
  /** Direct messages for particular people (toasts, save codes). */
  direct: [string, ServerMsg][];
  /** Something changed: persist and send everyone a fresh view. */
  changed: boolean;
  /** The host asked to save; store this and answer them with a code. */
  save: { member: string; file: SaveFile } | null;
}

const FEED_KEEP = 120;
/** How long a room opened from a changle.ca table keeps the host role for the table's host. */
export const HOST_HOLD = 90_000;
const TABLE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
const ID_RE = /^[0-9a-f]{8,64}$/;

/** Who opened the room from a changle.ca table, and which table. Anything that doesn't look right is ignored. */
export interface Opening {
  host?: unknown;
  table?: unknown;
}
const FEED_SEND = 60;
const QUIZ_ITEMS = E.TRASH_QUIZ.flatMap((b, bin) => b.items.map((_, item) => ({ bin, item })));
export const quizItem = (i: number) => QUIZ_ITEMS[i];

const clampName = (x: unknown, fallback: string) => {
  const s = typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 16) : "";
  return s || fallback;
};
/** Deep copy of plain data (JSON is enough, and works in every browser). */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function validOffer(o: unknown): o is E.Offer {
  if (!o || typeof o !== "object") return false;
  const { cash, deeds, cards } = o as E.Offer;
  return (
    isInt(cash) &&
    cash >= 0 &&
    cash <= 1_000_000 &&
    Array.isArray(deeds) &&
    deeds.length <= 28 &&
    new Set(deeds).size === deeds.length &&
    deeds.every((at) => isInt(at) && at >= 0 && at < E.BOARD_SIZE && E.OWNABLE[at]) &&
    Array.isArray(cards) &&
    cards.length <= 8 &&
    new Set(cards).size === cards.length &&
    cards.every((c) => typeof c === "string" && c.length <= 16)
  );
}
const emptyOffer = (o: E.Offer) => o.cash === 0 && !o.deeds.length && !o.cards.length;
/** The questions asked in a room or save from before ids, which counted them by their place in the list of 22. */
const askedBefore = (used: number[] | undefined): string[] => (used ?? []).map((i) => LEGACY_ORDER[i]).filter((id): id is string => !!id);

export class Room {
  st: RoomState;
  private env: RoomEnv;
  private direct: [string, ServerMsg][] = [];
  private dirty = false;
  private saveReq: Flush["save"] = null;

  constructor(st: RoomState, env: RoomEnv) {
    this.st = st;
    this.env = env;
    // Bot styles hold Infinity, which JSON turns into null: always restore them by id.
    if (st.game) for (const b of st.game.brains) b.style = E.STYLES[b.style.id] ?? E.STYLES.balanced;
    // Rooms and saves from before the waiting players' quiz, and from before its questions had ids.
    if (st.game) {
      const g = st.game as Game & { triviaUsed?: number[] };
      g.triviaAsked ??= askedBefore(g.triviaUsed);
      delete g.triviaUsed;
      g.triviaTurn ??= -1;
      // …and from before travel news.
      g.s.news ??= null;
      g.s.newsSeen ??= [];
      // A question from an older list of questions: drop it rather than show the wrong one.
      if (g.trivia && !TRIVIA_BY_ID.has(g.trivia.qid)) g.trivia = null;
      if (g.trivia) g.trivia.skipped ??= [];
    }
  }

  static create(code: string, env: RoomEnv, settings: Partial<Settings> = {}, opening: Opening = {}): Room {
    const now = env.now();
    const host = typeof opening.host === "string" && ID_RE.test(opening.host) ? opening.host : null;
    const table = typeof opening.table === "string" && TABLE_RE.test(opening.table) ? opening.table : null;
    const room = new Room(
      {
        v: 1,
        code,
        createdAt: now,
        lastActive: now,
        hostId: host,
        ...(host ? { hostHold: now + HOST_HOLD } : {}),
        table,
        settings: { mode: "target", party: false, news: false, trivia: true, hotseat: false, ...settings },
        members: {},
        teams: [],
        game: null,
        nextId: 1,
        feed: [],
      },
      env,
    );
    // Not saved yet: the server must store it now, not wait for the first phone. (If the room's
    // server process were unloaded before anyone joined, the code would lead nowhere.)
    room.dirty = true;
    return room;
  }

  /** A new room continuing a saved game. It starts paused so people can take their seats again. */
  static fromSave(code: string, save: SaveFile, env: RoomEnv, opening: Opening = {}): Room {
    const room = Room.create(code, env, { ...save.settings, hotseat: false }, opening);
    const now = env.now();
    room.st.teams = save.teams.map((t) => ({ ...t, autoplay: false }));
    room.st.nextId = 1000;
    if (save.game) {
      const { remaining, ...g } = save.game;
      room.st.game = {
        ...g,
        endsAt: remaining === null ? null : now + remaining,
        paused: true,
        pausedAt: now,
        forfeit: null,
        forfeits: [],
        trades: [],
        awaySince: {},
        covered: {},
        // A question that was up when the game was saved has long timed out; saves from before the quiz lack these.
        trivia: null,
        triviaAsked: g.triviaAsked ?? askedBefore((g as { triviaUsed?: number[] }).triviaUsed),
        triviaTurn: g.triviaTurn ?? -1,
        // (the next question waits its time from here: the save's times are another room's)
        triviaAt: now,
        triviaDue: null,
        // (the turn clock starts afresh: the save's times are another room's)
        idleFrom: now,
        moveAt: undefined,
      };
      delete (room.st.game as { triviaUsed?: unknown }).triviaUsed;
      room.st.game.s.news ??= null;
      room.st.game.s.newsSeen ??= [];
      room.refreshAway();
    }
    return room;
  }

  private get now() {
    return this.env.now();
  }

  private speed() {
    return this.st.settings.speed ?? 1;
  }

  private ms(k: keyof typeof TIMING) {
    return TIMING[k] * this.speed();
  }

  /** Rio's dance is still on (the judges wait for it). */
  private dancing() {
    const g = this.st.game;
    return !!g?.danceAt && this.now < g.danceAt + this.ms("dance");
  }

  // ---------- output ----------

  private toast(member: string, key: string, vars?: Record<string, string | number>) {
    this.direct.push([member, { t: "toast", key, vars }]);
  }

  private push(item: Omit<FeedItem, "id" | "at"> & Record<string, unknown>) {
    this.st.feed.push({ ...(item as object), id: this.st.nextId++, at: this.now } as FeedItem);
    if (this.st.feed.length > FEED_KEEP) this.st.feed.splice(0, this.st.feed.length - FEED_KEEP);
    this.dirty = true;
  }

  /** Collect what happened since the last flush. */
  flush(): Flush {
    const out: Flush = { direct: this.direct, changed: this.dirty, save: this.saveReq };
    if (this.dirty) this.st.lastActive = this.now;
    this.direct = [];
    this.dirty = false;
    this.saveReq = null;
    return out;
  }

  // ---------- people ----------

  /** Someone opened a connection. `id` and `key` come from their phone's storage; the key proves the id is theirs. */
  join(id: string, key: string, opts: { name?: string; lang?: Lang; role?: Role } = {}): boolean {
    if (typeof id !== "string" || id.length < 8 || id.length > 64 || typeof key !== "string" || key.length < 8 || key.length > 128)
      return false;
    let m = this.st.members[id];
    if (m && m.key !== key) return false;
    const now = this.now;
    if (!m) {
      // A phone that didn't say its name gets one in its own language.
      const n = Object.keys(this.st.members).length + 1;
      const en = opts.lang === "en";
      m = {
        id,
        key,
        name: clampName(opts.name, opts.role === "screen" ? (en ? "Big screen" : "大屏") : en ? `Player ${n}` : `玩家${n}`),
        team: null,
        role: opts.role === "screen" ? "screen" : "player",
        online: 0,
        lastSeen: now,
        joinedAt: now,
        lang: opts.lang === "en" ? "en" : "zh",
        score: 0,
      };
      this.st.members[id] = m;
      if (m.role === "player") this.push({ t: "joined", name: m.name });
    } else {
      if (opts.role) m.role = opts.role === "screen" ? "screen" : "player";
      if (opts.lang) m.lang = opts.lang === "en" ? "en" : "zh";
    }
    m.online += 1;
    m.lastSeen = now;
    this.claimHost();
    this.refreshAway();
    // (a phone of the team the game waits for, back: someone's there)
    if (this.st.game) this.stir(this.seatsFor(m));
    this.dirty = true;
    return true;
  }

  leave(id: string) {
    const m = this.st.members[id];
    if (!m) return;
    m.online = Math.max(0, m.online - 1);
    m.lastSeen = this.now;
    this.refreshAway();
    this.dirty = true;
  }

  /** After a server restart: these are the people actually connected. */
  presence(ids: string[]) {
    for (const m of Object.values(this.st.members)) m.online = 0;
    for (const id of ids) if (this.st.members[id]) this.st.members[id].online += 1;
    this.claimHost();
    this.refreshAway();
    this.dirty = true;
  }

  /**
   * The host is the first person in; if they've been gone two minutes, the next person who joins takes
   * over. A room opened from a changle.ca table keeps the role for the table's host for a while, in
   * case another phone gets here before theirs.
   */
  private claimHost() {
    const host = this.st.hostId ? this.st.members[this.st.hostId] : null;
    if (this.st.hostId && !host && this.now < (this.st.hostHold ?? 0)) return;
    if (host && host.role === "player" && (host.online > 0 || this.now - host.lastSeen < 120_000)) return;
    const candidate = Object.values(this.st.members)
      .filter((m) => m.role === "player" && m.online > 0)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (candidate) this.st.hostId = candidate.id;
    else if (!host) this.st.hostId = Object.values(this.st.members).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? null;
  }

  private teamMembers(teamId: string) {
    return Object.values(this.st.members).filter((m) => m.team === teamId && m.role === "player");
  }

  private seatOf(teamId: string | null): number {
    if (!teamId || !this.st.game) return -1;
    return this.st.game.seats.indexOf(teamId);
  }

  private teamAt(seat: number): Team | undefined {
    const id = this.st.game?.seats[seat];
    return this.st.teams.find((t) => t.id === id);
  }

  /** Seats this person may act for. */
  private seatsFor(m: Member | undefined): number[] {
    const g = this.st.game;
    if (!g || !m || m.role !== "player") return [];
    if (this.st.settings.hotseat)
      return g.seats.map((_, i) => i).filter((i) => !this.teamAt(i)?.bot && !g.s.ps[i].out);
    const seat = this.seatOf(m.team);
    return seat >= 0 && !g.s.ps[seat].out ? [seat] : [];
  }

  private refreshAway() {
    const g = this.st.game;
    if (!g) return;
    const now = this.now;
    g.seats.forEach((teamId, seat) => {
      const team = this.st.teams.find((t) => t.id === teamId);
      if (!team || team.bot) return;
      const here = this.st.settings.hotseat
        ? Object.values(this.st.members).some((m) => m.role === "player" && m.online > 0)
        : this.teamMembers(teamId).some((m) => m.online > 0);
      if (here) delete g.awaySince[seat];
      else if (g.awaySince[seat] === undefined) g.awaySince[seat] = now;
    });
  }

  /** Is the computer making this seat's decisions right now? */
  private botControlled(seat: number): boolean {
    const g = this.st.game!;
    const team = this.teamAt(seat);
    if (!team || team.bot || team.autoplay) return true;
    const away = g.awaySince[seat];
    return away !== undefined && this.now - away >= this.ms("takeover");
  }

  // ---------- messages ----------

  handle(id: string, msg: ClientMsg) {
    const m = this.st.members[id];
    if (!m || !msg || typeof msg !== "object") return;
    m.lastSeen = this.now;
    this.claimHost();
    const host = this.st.hostId === id;
    const g = this.st.game;
    switch (msg.t) {
      case "ping":
        this.direct.push([id, { t: "pong", now: this.now }]);
        return;
      case "name": {
        const name = clampName(msg.name, m.name);
        if (name !== m.name) {
          m.name = name;
          this.dirty = true;
        }
        return;
      }
      case "lang":
        m.lang = msg.lang === "en" ? "en" : "zh";
        this.dirty = true;
        return;
      case "team":
        return this.teamOp(m, msg);
      case "bot":
        if (!host) return this.toast(id, "hostOnly");
        return this.botOp(msg);
      case "settings":
        if (!host) return this.toast(id, "hostOnly");
        if (g) return;
        if (msg.mode === "target" || msg.mode === 15 || msg.mode === 60) this.st.settings.mode = msg.mode;
        if (typeof msg.party === "boolean") this.st.settings.party = msg.party;
        if (typeof msg.news === "boolean") this.st.settings.news = msg.news;
        if (typeof msg.trivia === "boolean") this.st.settings.trivia = msg.trivia;
        this.dirty = true;
        return;
      case "seen": {
        const ids = cleanSeen(msg.ids);
        if (ids) {
          m.seen = ids;
          this.dirty = true;
        }
        return;
      }
      case "trivia-skip":
        return this.skipTrivia(m, msg.id);
      case "start":
        if (!host) return this.toast(id, "hostOnly");
        return this.start(id);
      case "again":
        if (!host) return this.toast(id, "hostOnly");
        if (!g || !g.s.over) return;
        this.st.game = null;
        this.st.teams = this.st.teams.filter((t) => t.bot || this.teamMembers(t.id).length > 0).map((t) => ({ ...t, autoplay: false }));
        this.dirty = true;
        return;
      case "pause":
        if (!host) return this.toast(id, "hostOnly");
        return this.pause(!!msg.on);
      case "save":
        if (!host) return this.toast(id, "hostOnly");
        this.saveReq = { member: id, file: this.exportSave() };
        return;
      case "autoplay": {
        if (!g || g.s.over) return;
        const seat = isInt(msg.seat) ? msg.seat : this.seatOf(m.team);
        const team = this.teamAt(seat);
        if (!team || team.bot) return;
        if (!host && !this.seatsFor(m).includes(seat)) return this.toast(id, "notYours");
        team.autoplay = !!msg.on;
        this.push({ t: "autoplay", seat, on: team.autoplay, why: "chosen" });
        g.covered[seat] = this.botControlled(seat);
        this.stir([seat]);
        return;
      }
      case "bet":
        return this.bet(m, !!msg.yes);
      case "forfeit": {
        const f = g?.forfeit;
        if (!g || !f || f.id !== msg.id) return;
        // Its own team says when it's done; the host can move the game on.
        if (msg.op === "skip" ? !host : !this.seatsFor(m).includes(f.seat)) return this.toast(id, msg.op === "skip" ? "hostOnly" : "notYours");
        return this.endForfeit(msg.op === "skip" ? "skip" : "done");
      }
    }
    // Everything below is a move in the running game.
    if (!g || g.s.over) return;
    if (g.forfeit) return this.toast(id, "forfeitWait");
    if (g.paused) return this.toast(id, "paused");
    const mine = this.seatsFor(m);
    this.stir(mine);
    const pickSeat = (want: unknown, fallback: number[]) => (isInt(want) ? (mine.includes(want) ? want : -1) : (fallback[0] ?? -1));
    switch (msg.t) {
      case "act": {
        if (msg.d !== g.decision) return this.toast(id, "tooLate");
        const pd = g.s.pending;
        if (!pd) return;
        const waiting = E.whoMustAct(g.s);
        const seat = pickSeat(
          msg.seat,
          mine.filter((x) => waiting.includes(x)),
        );
        if (seat < 0 || !waiting.includes(seat)) return this.toast(id, "notYourTurn");
        if (pd.k === "auction" || pd.k === "quiz") return;
        if (pd.k === "silence" && g.silenceUntil !== null && this.now < g.silenceUntil) return this.toast(id, "stillQuiet");
        if (pd.k === "scores" && this.dancing()) return this.toast(id, "stillDancing");
        const a = msg.a && typeof msg.a === "object" ? msg.a : {};
        if (!E.act(g.s, seat, a)) return this.toast(id, "cantDoThat");
        return this.afterMove();
      }
      case "manage": {
        const seat = pickSeat(msg.seat, mine);
        if (seat < 0 || !isInt(msg.at)) return;
        if (!["build", "sell", "mortgage", "unmortgage"].includes(msg.k)) return;
        if (!E.manage(g.s, seat, { k: msg.k, at: msg.at })) return this.toast(id, "cantDoThat");
        return this.afterMove();
      }
      case "bid": {
        const seat = pickSeat(msg.seat, mine);
        if (seat < 0) return this.toast(id, "notYours");
        return this.bid(id, seat, msg.aid, msg.amount);
      }
      case "quiz": {
        const q = g.quiz;
        if (!q || q.id !== msg.qid || !mine.includes(q.visitor)) return;
        if (this.now > q.endsAt + 1500) return this.toast(id, "tooLate");
        return this.answerQuiz(isInt(msg.choice) ? msg.choice : -1);
      }
      case "trivia": {
        const tv = g.trivia;
        if (!tv || tv.id !== msg.id || tv.closed) return this.toast(id, "tooLate");
        if (!isInt(msg.choice) || msg.choice < 0 || msg.choice >= tv.order.length) return;
        if (tv.skipped.includes(m.id)) return;
        const can = (x: number) => tv.eligible.includes(x) && !(x in tv.answers) && !g.s.ps[x].out;
        const seat = pickSeat(msg.seat, mine.filter(can));
        if (seat < 0 || !can(seat)) return;
        return this.answerTrivia(seat, msg.choice);
      }
      case "offer": {
        const seat = pickSeat(msg.seat, mine);
        if (seat < 0) return this.toast(id, "notYours");
        return this.offer(id, seat, msg.to, msg.give, msg.get);
      }
      case "offer-reply":
        return this.offerReply(id, mine, msg.id, !!msg.accept);
      case "offer-cancel": {
        const t = g.trades.find((x) => x.id === msg.id);
        if (!t || !mine.includes(t.from)) return;
        g.trades = g.trades.filter((x) => x !== t);
        this.push({ t: "offer-done", from: t.from, to: t.to, accepted: false, why: "cancelled" });
        return;
      }
    }
  }

  private teamOp(m: Member, msg: Extract<ClientMsg, { t: "team" }>) {
    const g = this.st.game;
    if (m.role !== "player") return;
    if (msg.op === "create") {
      if (g) return this.toast(m.id, "gameRunning");
      if (this.st.teams.length >= MAX_TEAMS) return this.toast(m.id, "tableFull");
      const used = new Set(this.st.teams.map((t) => t.color));
      const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? 0;
      // Single-device demo: one person plays several human teams, so extra teams start empty.
      const extra = this.st.settings.hotseat && m.team !== null;
      const n = this.st.teams.filter((t) => !t.bot).length + 1;
      const name = extra ? (m.lang === "en" ? `Team ${n}` : `第 ${n} 队`) : m.name;
      const team: Team = { id: `t${this.st.nextId++}`, name, bot: null, autoplay: false, color };
      this.st.teams.push(team);
      if (!extra) this.moveTo(m, team.id);
    } else if (msg.op === "join") {
      const team = this.st.teams.find((t) => t.id === msg.team);
      if (!team || team.bot) return;
      if (g && this.seatOf(team.id) < 0) return;
      if (m.team === team.id) return;
      if (this.teamMembers(team.id).length >= MAX_TEAM_SIZE) return this.toast(m.id, "teamFull");
      this.moveTo(m, team.id);
    } else if (msg.op === "leave") {
      this.moveTo(m, null);
    } else if (msg.op === "rename") {
      const teamId = typeof msg.team === "string" && this.st.hostId === m.id ? msg.team : m.team;
      const team = this.st.teams.find((t) => t.id === teamId);
      if (!team || team.bot) return;
      team.name = clampName(msg.name, team.name);
    }
    this.dirty = true;
  }

  private moveTo(m: Member, teamId: string | null) {
    const old = m.team;
    m.team = teamId;
    if (old && !this.st.game && !this.st.settings.hotseat) {
      const team = this.st.teams.find((t) => t.id === old);
      if (team && !team.bot && this.teamMembers(old).length === 0) this.st.teams = this.st.teams.filter((t) => t.id !== old);
    }
    this.refreshAway();
  }

  private botOp(msg: Extract<ClientMsg, { t: "bot" }>) {
    if (this.st.game) return;
    const styles = Object.keys(E.STYLES) as E.StyleId[];
    if (msg.op === "add") {
      if (this.st.teams.length >= MAX_TEAMS) return;
      const used = new Set(this.st.teams.map((t) => t.color));
      const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? 0;
      const style = msg.style && styles.includes(msg.style) ? msg.style : "balanced";
      this.st.teams.push({ id: `t${this.st.nextId++}`, name: "", bot: style, autoplay: false, color });
    } else if (msg.op === "remove") {
      this.st.teams = this.st.teams.filter((t) => !(t.id === msg.team && t.bot));
    } else if (msg.op === "style") {
      const team = this.st.teams.find((t) => t.id === msg.team && t.bot);
      if (team && styles.includes(msg.style)) team.bot = msg.style;
    }
    this.dirty = true;
  }

  // ---------- starting, pausing, saving ----------

  private start(id: string) {
    if (this.st.game) return;
    const teams = this.st.teams.filter((t) => t.bot || this.st.settings.hotseat || this.teamMembers(t.id).length > 0);
    if (teams.length < 2) return this.toast(id, "needTwo");
    // Random seat order (a test can keep the order the teams were made); later seats get the step-3 catch-up cash.
    const order = [...teams];
    if (!this.st.settings.inOrder)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(this.env.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    const { mode, testRounds } = this.st.settings;
    const cfg = E.defaultConfig(order.length);
    if (mode !== "target") {
      // Timed games end on the clock (see tick); 15-minute games deal two cities each.
      cfg.end = { kind: "rounds", rounds: 9999 };
      cfg.dealCities = mode === 15 ? 2 : 0;
    }
    if (testRounds) cfg.end = { kind: "rounds", rounds: testRounds };
    cfg.news = !!this.st.settings.news;
    const seed = Math.floor(this.env.random() * 2 ** 31);
    const s = E.newGame(
      cfg,
      order.map((t) => t.id),
      seed,
      { events: true },
    );
    if (this.st.settings.dice?.length) s.forced = [...this.st.settings.dice];
    const now = this.now;
    this.st.teams = [...order, ...this.st.teams.filter((t) => !order.includes(t))];
    this.st.game = {
      s,
      seats: order.map((t) => t.id),
      brains: order.map((t) => E.newBrain(E.STYLES[t.bot ?? "balanced"], Math.floor(this.env.random() * 2 ** 31))),
      startedAt: now,
      endsAt: mode === "target" || testRounds ? null : now + mode * 60_000 * this.speed(),
      timeUp: false,
      paused: false,
      pausedAt: null,
      forfeit: null,
      forfeits: [],
      decision: 0,
      sig: "",
      progress: 0,
      pendingSince: now,
      idleFrom: now,
      deadline: null,
      silenceUntil: null,
      auction: null,
      quiz: null,
      trivia: null,
      triviaAsked: [],
      triviaTurn: -1,
      triviaAt: now,
      triviaDue: null,
      trades: [],
      bets: null,
      awaySince: {},
      covered: {},
    };
    this.refreshAway();
    this.afterMove();
  }

  private pause(on: boolean) {
    const g = this.st.game;
    if (!g || g.s.over || g.paused === on) return;
    this.stopping(g, () => (g.paused = on));
    this.push({ t: on ? "paused" : "resumed" });
  }

  /** Is the game standing still: paused by the host, or held by a party forfeit? */
  private stopped(g: Game) {
    return g.paused || !!g.forfeit;
  }

  /**
   * Make a change that may stop or restart the game. The clock stops when the first reason to stand
   * still comes (a pause, a forfeit) and starts again when the last one goes; then every timer moves
   * on by the time stood still, once, however the reasons overlapped.
   */
  private stopping(g: Game, change: () => void) {
    const was = this.stopped(g);
    change();
    const is = this.stopped(g);
    if (!was && is) g.pausedAt = this.now;
    else if (was && !is) {
      this.shiftTimers(g, this.now - (g.pausedAt ?? this.now));
      g.pausedAt = null;
    }
  }

  private shiftTimers(g: Game, shift: number) {
    const later = (x: number | null) => (x === null ? null : x + shift);
    g.endsAt = later(g.endsAt);
    g.deadline = later(g.deadline);
    g.silenceUntil = later(g.silenceUntil);
    g.danceAt = later(g.danceAt ?? null);
    g.pendingSince += shift;
    if (g.idleFrom !== undefined) g.idleFrom += shift;
    if (g.moveAt !== undefined) g.moveAt += shift;
    if (g.auction) {
      g.auction.endsAt += shift;
      g.auction.botAt += shift;
    }
    if (g.quiz) {
      g.quiz.endsAt += shift;
      g.quiz.botAt += shift;
    }
    if (g.trivia) {
      g.trivia.endsAt += shift;
      g.trivia.revealUntil += shift;
      for (const k of Object.keys(g.trivia.botAt)) g.trivia.botAt[Number(k)] += shift;
    }
    // (time stood still doesn't count toward the next question)
    if (g.triviaAt !== undefined) g.triviaAt += shift;
    if (g.triviaDue) g.triviaDue.at += shift;
    for (const t of g.trades) t.createdAt += shift;
    for (const k of Object.keys(g.awaySince)) g.awaySince[Number(k)] += shift;
  }

  private exportSave(): SaveFile {
    const g = this.st.game;
    let game: SaveFile["game"] = null;
    if (g) {
      const { awaySince: _a, covered: _c, trades: _t, forfeit: _f, forfeits: _q, ...rest } = g;
      const now = this.stopped(g) && g.pausedAt ? g.pausedAt : this.now;
      game = { ...clone(rest), remaining: g.endsAt === null ? null : Math.max(0, g.endsAt - now) };
    }
    return { v: 1, savedAt: this.now, settings: { ...this.st.settings }, teams: clone(this.st.teams), game };
  }

  // ---------- the running game ----------

  /** Call after anything changed the engine state: log events, notice new decisions, start sub-steps. */
  private afterMove() {
    const g = this.st.game;
    if (!g) return;
    const s = g.s;
    const now = this.now;
    // Where the team on turn has come to rest in this step, if it landed anywhere: a city, or null for
    // any other space; and whether it's the team's first time there (a new stamp: its landing scene plays).
    let landed: string | null | undefined;
    let firstVisit = false;
    for (const e of s.events ?? []) {
      this.push({ t: "game", e });
      // Side events don't make anyone's pending decision stale.
      if (e.t !== "manage" && e.t !== "trade" && e.t !== "bonus" && e.t !== "fine") g.progress += 1;
      // (every screen plays a throw's ride and landing from now: the turn clock waits for them)
      if (e.t === "roll" || e.t === "move") g.moveAt = now;
      if (e.t === "land" && e.p === s.turn) {
        const sp = E.BOARD[e.at];
        landed = sp.k === "city" && s.ps[e.p].pos === e.at ? sp.id : null;
        firstVisit = false;
      } else if (e.t === "stamp" && e.p === s.turn && e.city === landed) firstVisit = true;
      else if (e.t === "jail" && e.p === s.turn) landed = null; // (sent to Immigration from wherever it stood)
      this.watch(e);
    }
    if (s.events) s.events = [];
    const pd = s.pending;
    const who = pd ? ("who" in pd ? pd.who : pd.k === "scores" ? pd.dancer : -1) : -1;
    const sig = pd ? `${pd.k}|${who}|${g.progress}` : `none|${g.progress}`;
    if (sig !== g.sig) {
      g.sig = sig;
      g.decision += 1;
      g.pendingSince = now;
      g.idleFrom = now;
      g.deadline = null;
      g.silenceUntil = null;
      g.danceAt = null;
      if (pd?.k !== "auction") g.auction = null;
      if (pd?.k !== "quiz") g.quiz = null;
      if (pd?.k === "auction") {
        g.auction = {
          id: this.st.nextId++,
          at: pd.at,
          price: 0,
          leader: null,
          endsAt: now + this.ms("auctionOpen"),
          botAt: now + (1200 + this.env.random() * 1200) * this.speed(),
          bids: 0,
        };
      } else if (pd?.k === "quiz") {
        g.quiz = {
          id: this.st.nextId++,
          visitor: pd.visitor,
          owner: pd.who,
          item: Math.floor(this.env.random() * QUIZ_ITEMS.length),
          endsAt: now + this.ms("quiz"),
          botAt: now + (1500 + this.env.random() * 1500) * this.speed(),
        };
      } else if (pd?.k === "silence") g.silenceUntil = now + this.ms("silence");
      else if (pd?.k === "scores") {
        // Rio: every screen plays the dance first; the judges' time starts when it's over.
        g.danceAt = now;
        g.deadline = now + this.ms("dance") + this.ms("vote");
      } else if (pd && E.SIMULTANEOUS.has(pd.k)) g.deadline = now + this.ms("vote");
    }
    // A new turn: settle the spectators' bets on the last one and open betting on this one.
    if (!s.over && (!g.bets || g.bets.turns !== s.turns)) {
      this.settleBets();
      g.bets = { turns: s.turns, seat: s.turn, open: true, bets: {}, paidRent: false };
    }
    // …and if a quiz question is still up, the team that was on turn when it came up is one of the
    // waiting teams now: it joins in.
    if (!s.over && g.triviaTurn !== s.turns) {
      g.triviaTurn = s.turns;
      if (g.trivia && !g.trivia.closed) this.joinTrivia(g.trivia);
    }
    // A landing on a city may bring the waiting teams a question about it. If the team then moves on
    // before the question is up (doubles, a card, a tango), the question follows it: the one on its
    // way for the city it left is dropped.
    if (!s.over && landed !== undefined) {
      if (g.triviaDue?.seat === s.turn) g.triviaDue = null;
      if (landed) this.landedOn(landed, firstVisit);
    }
    // What a landing asks of the table comes before its question. When teams that are waiting have a
    // part in it (an auction, a vote, Rio's dance to watch and score), the question also leaves them
    // time to see how it came out, once the game is back to a team ending its turn or about to throw.
    const due = g.triviaDue;
    if (!s.over && due) {
      if (this.othersBusy(s)) due.busy = true;
      else if (due.busy && !this.busy(s)) {
        due.busy = false;
        due.at = Math.max(due.at, now + this.ms("triviaLand"));
      }
    }
    // …and one that was waiting (for that, or for someone to answer it) comes up when it can: a
    // decision has been made, a turn has passed.
    if (!s.over) this.dueTrivia();
    if (s.over) {
      this.settleBets();
      g.bets = null;
      g.trades = [];
      g.auction = null;
      g.quiz = null;
      g.trivia = null;
      g.triviaDue = null;
    }
    // Drop trade offers that can no longer happen.
    g.trades = g.trades.filter((t) => {
      const ok = E.canTrade(s, t.from, t.to, t.give, t.get);
      if (!ok) this.push({ t: "offer-done", from: t.from, to: t.to, accepted: false, why: "invalid" });
      return ok;
    });
    this.dirty = true;
  }

  /** Room-level reactions to game events: spectator bets and party forfeits. */
  private watch(e: E.GameEvent) {
    const g = this.st.game!;
    if (g.bets) {
      if (e.t === "roll" && e.p === g.bets.seat) g.bets.open = false;
      if (e.t === "rent" && e.p === g.bets.seat) g.bets.paidRent = true;
    }
    if (!this.st.settings.party) return;
    if (e.t === "rent" && e.amount >= 500) this.party(e.p, "rent");
    else if (e.t === "jail") this.party(e.p, "jail");
    else if (e.t === "bankrupt") this.party(e.p, "broke");
    else if (e.t === "rule" && e.city === "seoul" && typeof e.sound === "number" && e.sound >= 0) this.party(e.sound, "sound");
    else if (e.t === "rule" && e.city === "shanghai" && e.right === false) this.party(e.p, "quiz");
  }

  /**
   * A party forfeit, not one of the last few: half the time one about what just happened. It holds
   * the game (every clock stops) until the team has done it and says so, or the host skips it; one
   * that comes up meanwhile waits its turn. (The computer's own teams don't do forfeits.)
   */
  private party(seat: number, why: PartyWhy) {
    const g = this.st.game!;
    if (this.teamAt(seat)?.bot) return;
    const recent = this.st.dares ?? [];
    const all = FORFEITS.map((_, i) => i);
    const own = all.filter((i) => FORFEITS[i].why === why && !recent.includes(i));
    const any = all.filter((i) => !FORFEITS[i].why);
    const fresh = any.filter((i) => !recent.includes(i));
    const pool = own.length && this.env.random() < 0.5 ? own : fresh.length ? fresh : any;
    const dare = pool[Math.floor(this.env.random() * pool.length)];
    this.st.dares = [...recent, dare].slice(-8);
    this.push({ t: "party", seat, why, dare });
    const held: HeldForfeit = { id: this.st.nextId++, seat, why, dare, at: this.now };
    if (g.forfeit) (g.forfeits ??= []).push(held);
    else this.stopping(g, () => (g.forfeit = held));
  }

  /** The forfeit holding the game is over: the next one waiting comes up, or the game goes on. */
  private endForfeit(how: "done" | "skip" | "timeout") {
    const g = this.st.game!;
    const f = g.forfeit;
    if (!f) return;
    this.push({ t: "party-done", seat: f.seat, how });
    const next = g.forfeits?.shift();
    this.stopping(g, () => (g.forfeit = next ? { ...next, at: this.now } : null));
    this.dirty = true;
  }

  private bet(m: Member, yes: boolean) {
    const g = this.st.game;
    if (!g || g.s.over || !g.bets || !g.bets.open) return;
    if (this.seatsFor(m).length && !this.st.settings.hotseat) return this.toast(m.id, "spectatorsOnly");
    if (m.role !== "player") return;
    g.bets.bets[m.id] = yes;
    this.dirty = true;
  }

  private settleBets() {
    const g = this.st.game;
    const b = g?.bets;
    if (!g || !b) return;
    let right = 0;
    let wrong = 0;
    for (const [id, yes] of Object.entries(b.bets)) {
      const m = this.st.members[id];
      if (!m) continue;
      if (yes === b.paidRent) {
        m.score += 1;
        right += 1;
      } else wrong += 1;
    }
    if (right + wrong) this.push({ t: "bets", seat: b.seat, paidRent: b.paidRent, right, wrong });
    g.bets = null;
  }

  private bid(id: string, seat: number, aid: unknown, amount: unknown) {
    const g = this.st.game!;
    const a = g.auction;
    if (!a || a.id !== aid) return this.toast(id, "tooLate");
    if (!isInt(amount)) return;
    const r = this.placeBid(seat, amount);
    if (r !== "ok") this.toast(id, r, { price: a.price });
  }

  private placeBid(seat: number, amount: number): "ok" | "outbid" | "tooPoor" | "youLead" {
    const g = this.st.game!;
    const a = g.auction!;
    if (g.s.ps[seat].out) return "tooPoor";
    if (a.leader === seat) return "youLead";
    const min = a.price === 0 ? 10 : a.price + 10;
    if (amount < min) return "outbid";
    if (amount > g.s.ps[seat].cash) return "tooPoor";
    a.price = amount;
    a.leader = seat;
    a.bids += 1;
    const now = this.now;
    a.endsAt = now + this.ms("auctionStep");
    a.botAt = now + (900 + this.env.random() * 900) * this.speed();
    this.dirty = true;
    return "ok";
  }

  private answerQuiz(choice: number) {
    const g = this.st.game!;
    const q = g.quiz!;
    const { bin, item } = QUIZ_ITEMS[q.item];
    const right = choice === bin;
    this.push({ t: "quiz", seat: q.visitor, item: q.item, bin, choice: choice >= 0 ? choice : null, right });
    void item;
    E.act(g.s, q.owner, { yes: right });
    this.afterMove();
  }

  /** How long the quiz rests before its next question: between two, or (shorter) from the game's start to its first. */
  private triviaGap() {
    const test = this.st.settings.triviaEvery;
    const every = typeof test === "number" ? test : this.ms("triviaEvery");
    return this.st.game!.triviaAsked.length ? every : Math.min(every, this.ms("triviaFirst"));
  }

  /**
   * The game is busy with what a landing asks of the table (a purchase to decide, an auction, a vote,
   * a card, Rio's dance and its scores): anything but a team ending its turn or about to throw.
   */
  private busy(s: E.GameState) {
    const k = s.pending?.k;
    return !!k && k !== "end" && k !== "roll";
  }

  /** …and people whose turn it isn't have a part in it: they bid, vote, score or answer. */
  private othersBusy(s: E.GameState) {
    const pd = s.pending;
    if (!pd || !this.busy(s)) return false;
    const part = E.SIMULTANEOUS.has(pd.k) ? E.activePlayers(s) : E.whoMustAct(s);
    return part.some((q) => q !== s.turn && !this.botControlled(q));
  }

  /**
   * The team on turn has landed on `city`. If the quiz is on and has rested long enough since its
   * last question, this landing brings one: about this city, once every screen has played the move
   * and stamped the landing (so the question doesn't say where the token is going), and after the
   * landing scene of a team's first visit, which a big screen plays for everyone.
   *
   * One for an earlier landing, on its way or waiting for the table, keeps its place: first come. (A
   * newer landing taking it over would put the question off again each time: where teams play fast,
   * it would never come.) Only one that waits for someone to answer it gives way to this landing:
   * by the time someone can, this is the city a team has just landed on.
   */
  private landedOn(city: string, firstVisit = false) {
    const g = this.st.game!;
    if (this.st.settings.trivia === false || g.trivia) return;
    if (g.triviaDue && !g.triviaDue.nobody) return;
    if (this.now - (g.triviaAt ?? g.startedAt) < this.triviaGap()) return;
    g.triviaDue = { city, seat: g.s.turn, at: this.now + this.ms(firstVisit ? "landing" : "triviaLand") };
    this.dirty = true;
  }

  /**
   * The question a landing is owed comes up, if its time has come, the table is free for it and
   * someone is there to answer.
   *
   * Free: what the landing asks of the table is settled (the game is waiting for a team to end its
   * turn or to throw: a question never comes up over an auction, a vote or Rio's dance, see
   * afterMove), and no throw of a team of people is still being played on the screens (a question
   * that had to wait doesn't come up over the next team's move).
   *
   * Someone there: with nobody (only computer teams are waiting: a person playing against the
   * computer is on their own turn; or the people's phones have gone) it waits, and comes up when
   * there is: when that turn is over, most often, so a person alone is asked about the city they
   * have just been to. Meanwhile a newer landing takes its place (see landedOn). On one phone for every team (the one-phone demo) the phone is busy with the
   * move of the people on turn, so there it comes up between two turns, before the next team has
   * thrown, or while a computer team moves.
   *
   * It waits as long as its team stands on that city: a team that has left it (sent on by another
   * team's landing, say) takes its question away.
   */
  private dueTrivia(): boolean {
    const g = this.st.game!;
    const due = g.triviaDue;
    if (!due || this.now < due.at || g.trivia || this.stopped(g)) return false;
    const s = g.s;
    const drop = () => {
      g.triviaDue = null;
      this.dirty = true;
      return false;
    };
    const there = E.BOARD[s.ps[due.seat].pos];
    if (s.ps[due.seat].out || there.k !== "city" || there.id !== due.city) return drop();
    // (afterMove calls again when what the table is busy with is settled)
    if (this.busy(s)) return false;
    const people = !this.teamAt(s.turn)?.bot;
    const played = (g.moveAt ?? 0) + this.ms("triviaLand");
    if (people && this.now < played) {
      due.at = played;
      this.dirty = true;
      return false;
    }
    const betweenTurns = s.pending?.k === "roll" && s.ps[s.turn].dbl === 0;
    if (this.st.settings.hotseat && people && !betweenTurns) return false;
    const asked = this.openTrivia(due.city);
    if (asked === "nobody") {
      if (!due.nobody) {
        due.nobody = true;
        this.dirty = true;
      }
      return false;
    }
    drop();
    return asked === "asked";
  }

  /**
   * Ask the teams whose turn it isn't a question about `city`, where a team has just landed
   * (trivia.ts picks it): never one asked already this game, nor the one the city's arrival card
   * answers while a big screen has that card up, and where it can, one the phones it's for haven't
   * been asked before. "nobody": none of the teams waiting has a person with a phone here to answer
   * it. "none": every question about this city has been asked.
   */
  private openTrivia(city: string): "asked" | "nobody" | "none" {
    const g = this.st.game!;
    const s = g.s;
    if (this.st.settings.trivia === false || g.trivia) return "none";
    const eligible = E.activePlayers(s).filter((seat) => seat !== s.turn);
    const members = Object.values(this.st.members);
    const players = members.filter((m) => m.role === "player");
    const askedOf = players.filter((m) => this.seatsFor(m).some((x) => eligible.includes(x)));
    if (!askedOf.some((m) => m.online > 0)) return "nobody";
    const cardShown = members.some((m) => m.role === "screen" && m.online > 0);
    const qid = pickTrivia({ city, asked: g.triviaAsked, cardShown, seen: askedOf.map((m) => m.seen ?? []), random: () => this.env.random() });
    if (!qid) return "none";
    g.triviaAsked.push(qid);
    g.triviaAt = this.now;
    // Everyone here has been asked it now: the next game in this room starts with others.
    for (const m of players) m.seen = [...(m.seen ?? []).filter((x) => x !== qid), qid].slice(-SEEN_KEEP);
    const order = [0, 1, 2];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.env.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const now = this.now;
    const botAt: Record<number, number> = {};
    // Only real computer teams answer; the computer covering for absent people doesn't win them money.
    for (const seat of eligible) if (this.teamAt(seat)?.bot) botAt[seat] = now + (2500 + this.env.random() * 5000) * this.speed();
    g.trivia = {
      id: this.st.nextId++,
      qid,
      order,
      eligible,
      answers: {},
      botAt,
      endsAt: now + this.ms("trivia"),
      winner: null,
      closed: false,
      revealUntil: 0,
      skipped: [],
    };
    this.dirty = true;
    return "asked";
  }

  /**
   * A new turn while a question is up: the team that was on turn when it came up is waiting now, so it
   * can answer too, if there's still time to read and answer. (Its phone used to keep showing the
   * question with three answers that did nothing.)
   */
  private joinTrivia(tv: Trivia) {
    const g = this.st.game!;
    if (tv.endsAt - this.now < this.ms("triviaJoin")) return;
    for (const seat of E.activePlayers(g.s)) if (seat !== g.s.turn && !tv.eligible.includes(seat)) tv.eligible.push(seat);
  }

  /** A team answers the quiz; the first right answer wins the prize and closes it. */
  private answerTrivia(seat: number, choice: number) {
    const g = this.st.game!;
    const tv = g.trivia!;
    tv.answers[seat] = choice;
    if (tv.order[choice] === 0 && tv.winner === null) {
      tv.winner = seat;
      E.bonus(g.s, seat, TRIVIA_PRIZE, "trivia");
      this.closeTrivia();
      this.afterMove();
      return;
    }
    // A wrong answer costs a little (never more than the team has).
    const fined = tv.order[choice] !== 0 && E.fine(g.s, seat, TRIVIA_WRONG, "trivia") > 0;
    if (this.triviaDone(tv)) this.closeTrivia();
    if (fined) this.afterMove();
    this.dirty = true;
  }

  /** 这题不答: this phone passes on the question. No charge; a team is done with it once all its phones here have passed. */
  private skipTrivia(m: Member, id: unknown) {
    const g = this.st.game;
    const tv = g?.trivia;
    if (!g || g.s.over || !tv || tv.id !== id || tv.closed || tv.skipped.includes(m.id)) return;
    if (!this.seatsFor(m).some((x) => tv.eligible.includes(x))) return;
    tv.skipped.push(m.id);
    if (this.triviaDone(tv)) this.closeTrivia();
    this.dirty = true;
  }

  /** Every team the question is for has answered, is out of the game, or has passed on it on every phone it has here. */
  private triviaDone(tv: Trivia) {
    const g = this.st.game!;
    return tv.eligible.every((seat) => seat in tv.answers || g.s.ps[seat].out || this.teamSkipped(tv, seat));
  }

  private teamSkipped(tv: Trivia, seat: number) {
    if (this.teamAt(seat)?.bot) return false;
    const phones = Object.values(this.st.members).filter((m) => m.online > 0 && this.seatsFor(m).includes(seat));
    return phones.length > 0 && phones.every((m) => tv.skipped.includes(m.id));
  }

  private closeTrivia() {
    const tv = this.st.game!.trivia!;
    tv.closed = true;
    tv.revealUntil = this.now + this.ms("triviaReveal");
    this.dirty = true;
  }

  // ---------- the turn clock ----------

  /**
   * The turn clock for the decision up now. When the team the game is waiting for does nothing on it
   * for TIMING.idle, everyone sees a countdown of TIMING.idleWarn, and then the computer makes that one
   * move for the team, as it does for a phone that dropped; the team plays its next move itself. It
   * counts from the decision (once a throw's ride and landing, Seoul's silence or Rio's dance are over)
   * or the team's last move, whichever is later, and stands still with every other clock in a pause
   * or a party forfeit. None for computer teams (or a team the computer already covers), for
   * decisions with a clock of their own (auctions, votes, Shanghai's quiz), or in the one-phone demo.
   */
  private turnClock(g: Game): { seat: number; warnAt: number; at: number } | null {
    const s = g.s;
    const pd = s.pending;
    if (!pd || s.over || this.st.settings.hotseat || E.SIMULTANEOUS.has(pd.k) || pd.k === "quiz" || g.deadline !== null) return null;
    const seat = E.whoMustAct(s)[0];
    if (seat === undefined || this.botControlled(seat)) return null;
    const from = Math.max(
      g.idleFrom ?? g.pendingSince,
      g.moveAt === undefined ? 0 : g.moveAt + this.ms("landing"),
      g.silenceUntil ?? 0,
      g.danceAt ? g.danceAt + this.ms("dance") : 0,
    );
    const warnAt = from + this.ms("idle");
    return { seat, warnAt, at: warnAt + this.ms("idleWarn") };
  }

  /** Someone on the team the game is waiting for did something (or a phone of theirs came back): the turn clock starts again. */
  private stir(seats: number[]) {
    const g = this.st.game;
    if (!g || g.s.over || !seats.some((x) => E.whoMustAct(g.s).includes(x))) return;
    if ((g.idleFrom ?? 0) >= this.now) return;
    g.idleFrom = this.now;
    this.dirty = true;
  }

  private offer(id: string, from: number, to: unknown, give: unknown, get: unknown) {
    const g = this.st.game!;
    const s = g.s;
    if (!isInt(to) || to === from || !s.ps[to] || s.ps[to].out) return this.toast(id, "cantDoThat");
    if (!validOffer(give) || !validOffer(get) || (emptyOffer(give) && emptyOffer(get))) return this.toast(id, "cantDoThat");
    if (this.inDebt(from) || this.inDebt(to)) return this.toast(id, "noTradeInDebt");
    if (!E.canTrade(s, from, to, give, get)) return this.toast(id, "cantDoThat");
    if (g.trades.filter((t) => t.from === from).length >= 3) return this.toast(id, "tooManyOffers");
    const target = this.teamAt(to)!;
    if (target.bot) {
      // Computer teams answer straight away. (A person's team that dropped off decides when it's back.)
      const style = E.STYLES[target.bot];
      const yes = E.botAcceptsTrade(s, to, get, give, style);
      this.push({ t: "offer", from, to, give, get });
      if (yes && E.trade(s, from, to, give, get)) {
        this.push({ t: "offer-done", from, to, accepted: true });
        return this.afterMove();
      }
      this.push({ t: "offer-done", from, to, accepted: false });
      return;
    }
    g.trades.push({ id: this.st.nextId++, from, to, give, get, createdAt: this.now });
    this.push({ t: "offer", from, to, give, get });
  }

  private offerReply(id: string, mine: number[], tradeId: unknown, accept: boolean) {
    const g = this.st.game!;
    const t = g.trades.find((x) => x.id === tradeId);
    if (!t || !mine.includes(t.to)) return;
    g.trades = g.trades.filter((x) => x !== t);
    if (!accept) {
      this.push({ t: "offer-done", from: t.from, to: t.to, accepted: false });
      return;
    }
    if (this.inDebt(t.from) || this.inDebt(t.to) || !E.trade(g.s, t.from, t.to, t.give, t.get)) {
      this.push({ t: "offer-done", from: t.from, to: t.to, accepted: false, why: "invalid" });
      return this.toast(id, "offerGone");
    }
    this.push({ t: "offer-done", from: t.from, to: t.to, accepted: true });
    this.afterMove();
  }

  private inDebt(seat: number) {
    const pd = this.st.game?.s.pending;
    return !!pd && pd.k === "debt" && pd.who === seat;
  }

  /**
   * How a computer move may trade. A computer team trades directly with other computer teams and
   * sends offers to people's teams (even ones that dropped off: they answer when back). When the
   * computer is only covering for a person's team, it never starts trades for them.
   */
  private tradeHooks(seat: number): E.TradeHooks {
    const g = this.st.game!;
    if (!this.teamAt(seat)?.bot) return { isHuman: () => true, propose: () => {} };
    return {
      isHuman: (other) => !this.teamAt(other)?.bot,
      propose: (from, to, give, get) => {
        if (g.trades.some((t) => t.byBot && t.to === to)) return;
        g.trades.push({ id: this.st.nextId++, from, to, give, get, createdAt: this.now, byBot: true });
        this.push({ t: "offer", from, to, give, get, byBot: true });
      },
    };
  }

  /** The computer makes `seat`'s current decision. */
  private botMove(seat: number) {
    const g = this.st.game!;
    const s = g.s;
    const pd = s.pending!;
    const a = E.decide(s, seat, g.brains, this.tradeHooks(seat));
    if (s.pending === pd && !E.act(s, seat, a)) E.act(s, seat, E.fallbackAction(s, seat, pd.k));
    this.afterMove();
  }

  // ---------- time ----------

  /** When tick() next needs to run, or null. */
  nextWake(): number | null {
    const times: number[] = [this.st.lastActive + TIMING.roomTtl];
    const g = this.st.game;
    if (g && !g.s.over && g.forfeit && !g.paused) times.push(g.forfeit.at + this.ms("forfeitMax"));
    if (g && !g.s.over && !this.stopped(g)) {
      const s = g.s;
      if (g.endsAt !== null && !g.timeUp) times.push(g.endsAt);
      if (g.auction) {
        times.push(g.auction.endsAt);
        if (this.hasBotBidder()) times.push(g.auction.botAt);
      }
      if (g.quiz) times.push(this.botControlled(g.quiz.visitor) ? Math.min(g.quiz.botAt, g.quiz.endsAt) : g.quiz.endsAt + 1500);
      if (g.deadline !== null) times.push(g.deadline);
      // (one already waiting for someone to answer has no time of its own: a move brings it up)
      if (g.triviaDue && g.triviaDue.at > this.now) times.push(g.triviaDue.at);
      const tv = g.trivia;
      if (tv && !tv.closed) {
        times.push(tv.endsAt);
        for (const [seat, at] of Object.entries(tv.botAt)) if (!(Number(seat) in tv.answers) && !s.ps[Number(seat)].out) times.push(at);
      } else if (tv) times.push(tv.revealUntil);
      const pd = s.pending;
      if (pd && pd.k !== "auction" && pd.k !== "quiz") {
        const after = Math.max(g.pendingSince + this.ms("bot"), g.silenceUntil ?? 0, g.danceAt ? g.danceAt + this.ms("dance") : 0);
        for (const seat of E.whoMustAct(s)) {
          const team = this.teamAt(seat);
          if (!team || team.bot || team.autoplay) times.push(after);
          else if (g.awaySince[seat] !== undefined) times.push(Math.max(after, g.awaySince[seat] + this.ms("takeover")));
        }
      }
      for (const t of g.trades) times.push(t.createdAt + this.ms("offer"));
      const clock = this.turnClock(g);
      if (clock) times.push(clock.at);
      // Announce when the computer starts covering for a team that dropped off.
      for (const [seat, since] of Object.entries(g.awaySince))
        if (!g.covered[Number(seat)] && !s.ps[Number(seat)].out) times.push(since + this.ms("takeover"));
    }
    return Math.min(...times);
  }

  /** Is the room abandoned (safe to delete)? */
  expired() {
    return this.now >= this.st.lastActive + TIMING.roomTtl && Object.values(this.st.members).every((m) => m.online === 0);
  }

  private hasBotBidder() {
    const g = this.st.game!;
    const a = g.auction!;
    const min = a.price === 0 ? 10 : a.price + 10;
    return E.activePlayers(g.s).some(
      (seat) => seat !== a.leader && this.botControlled(seat) && E.auctionLimit(g.s, seat, g.brains[seat].style) >= min,
    );
  }

  /** Do everything that has come due: computer moves, countdowns, the game clock. */
  tick() {
    for (let guard = 0; guard < 500; guard++) if (!this.tickOnce()) break;
    this.announceCover();
  }

  private tickOnce(): boolean {
    const g = this.st.game;
    if (!g || g.s.over) return false;
    const now = this.now;
    // A forfeit nobody closed lets the game go on after a while (the team may have wandered off).
    if (g.forfeit && !g.paused && now >= g.forfeit.at + this.ms("forfeitMax")) {
      this.endForfeit("timeout");
      return true;
    }
    if (this.stopped(g)) return false;
    const s = g.s;
    if (g.endsAt !== null && !g.timeUp && now >= g.endsAt) {
      g.timeUp = true;
      E.endAfterThisRound(s);
      this.push({ t: "timeup" });
      return true;
    }
    const before = g.trades.length;
    g.trades = g.trades.filter((t) => {
      const keep = now < t.createdAt + this.ms("offer");
      if (!keep) this.push({ t: "offer-done", from: t.from, to: t.to, accepted: false, why: "expired" });
      return keep;
    });
    if (g.trades.length !== before) this.dirty = true;
    // A landing's question comes up now that its move has played on every screen.
    if (this.dueTrivia()) return true;
    const tv = g.trivia;
    if (tv && !tv.closed) {
      for (const [k, at] of Object.entries(tv.botAt)) {
        const seat = Number(k);
        if (now < at || seat in tv.answers || s.ps[seat].out) continue;
        // Computer teams know the answer about as often as they sort Shanghai's trash right (55%).
        const right = this.env.random() < 0.55;
        const wrongs = tv.order.map((_, i) => i).filter((i) => tv.order[i] !== 0);
        this.answerTrivia(seat, right ? tv.order.indexOf(0) : wrongs[Math.floor(this.env.random() * wrongs.length)]);
        return true;
      }
      if (now >= tv.endsAt) {
        this.closeTrivia();
        return true;
      }
    } else if (tv && now >= tv.revealUntil) {
      g.trivia = null;
      this.dirty = true;
      return true;
    }
    const pd = s.pending;
    if (!pd) return false;
    if (pd.k === "auction" && g.auction) {
      const a = g.auction;
      if (now >= a.endsAt) {
        E.settleLiveAuction(s, a.leader, a.price);
        this.afterMove();
        return true;
      }
      if (now >= a.botAt) {
        const min = a.price === 0 ? 10 : a.price + 10;
        const bidders = E.activePlayers(s).filter(
          (seat) => seat !== a.leader && this.botControlled(seat) && E.auctionLimit(s, seat, g.brains[seat].style) >= min,
        );
        if (bidders.length) {
          this.placeBid(bidders[Math.floor(this.env.random() * bidders.length)], min);
          return true;
        }
        a.botAt = a.endsAt + 1;
      }
      return false;
    }
    if (pd.k === "quiz" && g.quiz) {
      const q = g.quiz;
      if (this.botControlled(q.visitor) && now >= Math.min(q.botAt, q.endsAt)) {
        // A computer visitor gets it right as often as the step-3 bots did (55%).
        const right = E.decide(s, q.owner, g.brains).yes === true;
        const { bin } = QUIZ_ITEMS[q.item];
        const wrong = [0, 1, 2, 3].filter((b) => b !== bin);
        this.answerQuiz(right ? bin : wrong[Math.floor(this.env.random() * wrong.length)]);
        return true;
      }
      if (now >= q.endsAt + 1500) {
        this.answerQuiz(-1);
        return true;
      }
      return false;
    }
    const waiting = E.whoMustAct(s);
    if (g.deadline !== null && now >= g.deadline) {
      // Whole-table decision: anyone who hasn't answered gets the default.
      for (const seat of waiting) if (s.pending === pd) E.act(s, seat, E.fallbackAction(s, seat, pd.k));
      this.afterMove();
      return true;
    }
    if (now < g.pendingSince + this.ms("bot")) return false;
    if (pd.k === "silence" && g.silenceUntil !== null && now < g.silenceUntil) return false;
    if (pd.k === "scores" && this.dancing()) return false;
    for (const seat of waiting) {
      if (this.botControlled(seat)) {
        this.botMove(seat);
        return true;
      }
    }
    // The turn clock ran out: the computer makes this one move for the team.
    const clock = this.turnClock(g);
    if (clock && now >= clock.at) {
      this.push({ t: "idle", seat: clock.seat });
      this.botMove(clock.seat);
      // (a whole new clock for whatever comes next, even the same decision)
      g.idleFrom = Math.max(g.idleFrom ?? 0, this.now);
      return true;
    }
    return false;
  }

  /** Tell the table when the computer starts or stops covering for a team that dropped off. */
  private announceCover() {
    const g = this.st.game;
    if (!g || g.s.over) return;
    g.seats.forEach((_, seat) => {
      const team = this.teamAt(seat);
      if (!team || team.bot || g.s.ps[seat].out) return;
      const covered = this.botControlled(seat);
      if (!!g.covered[seat] !== covered) {
        g.covered[seat] = covered;
        if (!team.autoplay) this.push({ t: "autoplay", seat, on: covered, why: "away" });
      }
    });
  }

  // ---------- views ----------

  view(id: string): RoomView {
    const st = this.st;
    const m = st.members[id];
    const g = st.game;
    const members = Object.values(st.members).sort((a, b) => a.joinedAt - b.joinedAt);
    const teams: TeamView[] = st.teams.map((t) => {
      const seat = this.seatOf(t.id);
      return {
        id: t.id,
        name: t.name,
        bot: t.bot,
        autoplay: t.autoplay,
        color: t.color,
        members: members.filter((x) => x.team === t.id && x.role === "player").map((x) => x.id),
        seat: seat >= 0 ? seat : null,
        covered: !!g && seat >= 0 && !t.bot && !g.s.over && !g.s.ps[seat].out && this.botControlled(seat),
      };
    });
    return {
      code: st.code,
      now: this.now,
      phase: !g ? "lobby" : g.s.over ? "over" : "playing",
      you: {
        id,
        name: m?.name ?? "",
        team: m?.team ?? null,
        role: m?.role ?? "player",
        host: st.hostId === id,
        seats: this.seatsFor(m),
        lang: m?.lang ?? "zh",
      },
      hostId: st.hostId,
      table: st.table ?? null,
      settings: { mode: st.settings.mode, party: st.settings.party, news: !!st.settings.news, trivia: st.settings.trivia !== false, hotseat: st.settings.hotseat },
      members: members.map((x) => ({ id: x.id, name: x.name, team: x.team, role: x.role, online: x.online > 0, score: x.score })),
      teams,
      game: g ? this.gameView(g, m) : null,
      feed: st.feed.slice(-FEED_SEND),
    };
  }

  private gameView(g: Game, m: Member | undefined): GameView {
    const s = g.s;
    const mine = this.seatsFor(m);
    const pd = s.pending;
    let pending: E.Pending | null = pd;
    let answered: number[] = [];
    let peek: number[] | null = null;
    if (pd) {
      if ("votes" in pd) {
        answered = Object.keys(pd.votes).map(Number);
        pending = { ...pd, votes: {} } as E.Pending;
      } else if ("bids" in pd) {
        answered = Object.keys(pd.bids).map(Number);
        pending = { ...pd, bids: {} } as E.Pending;
      } else if (pd.k === "peek") {
        if (mine.includes(pd.who)) peek = pd.cards;
        pending = { ...pd, cards: [] };
      }
    }
    const pub: E.GameState = {
      ...s,
      seed: 0,
      decks: { journey: [], postcard: [] },
      stack: [],
      forced: [],
      events: null,
      log: null,
      pending,
    };
    const q = g.quiz;
    const tv = g.trivia;
    let trivia: TriviaView | null = null;
    if (tv) {
      const Q = TRIVIA_BY_ID.get(tv.qid)!;
      const skipped = !!m && tv.skipped.includes(m.id);
      const mineAnswered = mine.find((x) => x in tv.answers);
      const answerFor = tv.closed || skipped ? undefined : mine.find((x) => tv.eligible.includes(x) && !(x in tv.answers) && !s.ps[x].out);
      trivia = {
        id: tv.id,
        key: tv.qid,
        city: Q.city,
        q: Q.q,
        options: tv.order.map((i) => Q.options[i]),
        endsAt: tv.endsAt,
        open: !tv.closed,
        answerFor: answerFor ?? null,
        mine: mineAnswered === undefined ? null : tv.answers[mineAnswered],
        skipped,
        forYou: mine.some((x) => tv.eligible.includes(x)),
        answered: Object.keys(tv.answers).map(Number),
        winner: tv.winner,
        correct: tv.closed ? tv.order.indexOf(0) : null,
        fact: tv.closed ? Q.fact : null,
        source: tv.closed ? Q.source : null,
      };
    }
    return {
      s: pub,
      seats: g.seats,
      mustAct: E.whoMustAct(s),
      decision: g.decision,
      startedAt: g.startedAt,
      endsAt: g.endsAt,
      timeUp: g.timeUp,
      paused: g.paused,
      frozenAt: this.stopped(g) ? g.pausedAt : null,
      forfeit: g.forfeit ? { ...g.forfeit, waiting: g.forfeits?.length ?? 0 } : null,
      deadline: g.deadline,
      turnClock: this.turnClock(g),
      silenceUntil: g.silenceUntil,
      auction: g.auction && { id: g.auction.id, at: g.auction.at, price: g.auction.price, leader: g.auction.leader, endsAt: g.auction.endsAt, bids: g.auction.bids },
      quiz: q && { id: q.id, visitor: q.visitor, owner: q.owner, item: q.item, endsAt: q.endsAt },
      trivia,
      trades: g.trades.map((t) => ({ id: t.id, from: t.from, to: t.to, give: t.give, get: t.get, expiresAt: t.createdAt + this.ms("offer"), byBot: t.byBot })),
      answered,
      peek,
      dance: g.danceAt && s.pending?.k === "scores" ? { seat: s.pending.dancer, at: g.danceAt, ms: this.ms("dance") } : null,
      bets: g.bets && {
        seat: g.bets.seat,
        open: g.bets.open,
        yes: Object.values(g.bets.bets).filter((x) => x).length,
        no: Object.values(g.bets.bets).filter((x) => !x).length,
        mine: m && m.id in g.bets.bets ? g.bets.bets[m.id] : null,
      },
      worth: s.ps.map((_, i) => E.netWorth(s, i)),
    };
  }
}
