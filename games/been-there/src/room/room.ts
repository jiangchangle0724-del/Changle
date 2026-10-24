// One game room: who is here, which team they're on, and the running game.
// It knows nothing about networks. The Cloudflare Durable Object (server/worker.ts) and the
// single-device demo (local/) both wrap it: they pass messages in, call tick() when nextWake()
// comes due, and send each person their view().
import * as E from "../engine";
import {
  MAX_TEAMS,
  MAX_TEAM_SIZE,
  TIMING,
  type ClientMsg,
  type FeedItem,
  type GameView,
  type Lang,
  type Role,
  type RoomView,
  type ServerMsg,
  type Settings,
  type TeamView,
} from "./protocol";

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

interface Game {
  s: E.GameState;
  seats: string[];
  brains: E.Brain[];
  startedAt: number;
  endsAt: number | null;
  timeUp: boolean;
  paused: boolean;
  pausedAt: number | null;
  /** Bumped whenever the game waits on a new decision; actions must quote it. */
  decision: number;
  sig: string;
  progress: number;
  pendingSince: number;
  deadline: number | null;
  silenceUntil: number | null;
  auction: LiveAuction | null;
  quiz: Quiz | null;
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
  settings: Settings;
  members: Record<string, Member>;
  teams: Team[];
  game: Game | null;
  nextId: number;
  feed: FeedItem[];
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
const FEED_SEND = 60;
const QUIZ_ITEMS = E.TRASH_QUIZ.flatMap((b, bin) => b.items.map((_, item) => ({ bin, item })));
export const quizItem = (i: number) => QUIZ_ITEMS[i];

const clampName = (x: unknown, fallback: string) => {
  const s = typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 16) : "";
  return s || fallback;
};
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
  }

  static create(code: string, env: RoomEnv, settings: Partial<Settings> = {}): Room {
    const now = env.now();
    return new Room(
      {
        v: 1,
        code,
        createdAt: now,
        lastActive: now,
        hostId: null,
        settings: { mode: "target", party: false, hotseat: false, ...settings },
        members: {},
        teams: [],
        game: null,
        nextId: 1,
        feed: [],
      },
      env,
    );
  }

  /** A new room continuing a saved game. It starts paused so people can take their seats again. */
  static fromSave(code: string, save: SaveFile, env: RoomEnv): Room {
    const room = Room.create(code, env, { ...save.settings, hotseat: false });
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
        trades: [],
        awaySince: {},
        covered: {},
      };
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
      m = {
        id,
        key,
        name: clampName(opts.name, opts.role === "screen" ? "大屏" : `玩家${Object.keys(this.st.members).length + 1}`),
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

  /** The host is the first person in; if they've been gone two minutes, the next person who joins takes over. */
  private claimHost() {
    const host = this.st.hostId ? this.st.members[this.st.hostId] : null;
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
        this.dirty = true;
        return;
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
        return;
      }
      case "bet":
        return this.bet(m, !!msg.yes);
    }
    // Everything below is a move in the running game.
    if (!g || g.s.over) return;
    if (g.paused) return this.toast(id, "paused");
    const mine = this.seatsFor(m);
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
    // Random seat order; later seats get the step-3 catch-up cash.
    const order = [...teams];
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
    const seed = Math.floor(this.env.random() * 2 ** 31);
    const s = E.newGame(
      cfg,
      order.map((t) => t.id),
      seed,
      { events: true },
    );
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
      decision: 0,
      sig: "",
      progress: 0,
      pendingSince: now,
      deadline: null,
      silenceUntil: null,
      auction: null,
      quiz: null,
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
    const now = this.now;
    if (on) {
      g.paused = true;
      g.pausedAt = now;
      this.push({ t: "paused" });
      return;
    }
    const shift = now - (g.pausedAt ?? now);
    const later = (x: number | null) => (x === null ? null : x + shift);
    g.endsAt = later(g.endsAt);
    g.deadline = later(g.deadline);
    g.silenceUntil = later(g.silenceUntil);
    g.pendingSince += shift;
    if (g.auction) {
      g.auction.endsAt += shift;
      g.auction.botAt += shift;
    }
    if (g.quiz) {
      g.quiz.endsAt += shift;
      g.quiz.botAt += shift;
    }
    for (const t of g.trades) t.createdAt += shift;
    for (const k of Object.keys(g.awaySince)) g.awaySince[Number(k)] += shift;
    g.paused = false;
    g.pausedAt = null;
    this.push({ t: "resumed" });
  }

  private exportSave(): SaveFile {
    const g = this.st.game;
    let game: SaveFile["game"] = null;
    if (g) {
      const { awaySince: _a, covered: _c, trades: _t, ...rest } = g;
      const now = g.paused && g.pausedAt ? g.pausedAt : this.now;
      game = { ...structuredClone(rest), remaining: g.endsAt === null ? null : Math.max(0, g.endsAt - now) };
    }
    return { v: 1, savedAt: this.now, settings: { ...this.st.settings }, teams: structuredClone(this.st.teams), game };
  }

  // ---------- the running game ----------

  /** Call after anything changed the engine state: log events, notice new decisions, start sub-steps. */
  private afterMove() {
    const g = this.st.game;
    if (!g) return;
    const s = g.s;
    const now = this.now;
    for (const e of s.events ?? []) {
      this.push({ t: "game", e });
      if (e.t !== "manage" && e.t !== "trade") g.progress += 1;
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
      g.deadline = null;
      g.silenceUntil = null;
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
      else if (pd && E.SIMULTANEOUS.has(pd.k)) g.deadline = now + this.ms("vote");
    }
    // A new turn: settle the spectators' bets on the last one and open betting on this one.
    if (!s.over && (!g.bets || g.bets.turns !== s.turns)) {
      this.settleBets();
      g.bets = { turns: s.turns, seat: s.turn, open: true, bets: {}, paidRent: false };
    }
    if (s.over) {
      this.settleBets();
      g.bets = null;
      g.trades = [];
      g.auction = null;
      g.quiz = null;
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
    if (e.t === "rent" && e.amount >= 500) this.push({ t: "party", seat: e.p, why: "rent" });
    else if (e.t === "jail") this.push({ t: "party", seat: e.p, why: "jail" });
    else if (e.t === "bankrupt") this.push({ t: "party", seat: e.p, why: "broke" });
    else if (e.t === "rule" && e.city === "seoul" && typeof e.sound === "number" && e.sound >= 0)
      this.push({ t: "party", seat: e.sound, why: "sound" });
    else if (e.t === "rule" && e.city === "shanghai" && e.right === false) this.push({ t: "party", seat: e.p, why: "quiz" });
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

  private offer(id: string, from: number, to: unknown, give: unknown, get: unknown) {
    const g = this.st.game!;
    const s = g.s;
    if (!isInt(to) || to === from || !s.ps[to] || s.ps[to].out) return this.toast(id, "cantDoThat");
    if (!validOffer(give) || !validOffer(get) || (emptyOffer(give) && emptyOffer(get))) return this.toast(id, "cantDoThat");
    if (this.inDebt(from) || this.inDebt(to)) return this.toast(id, "noTradeInDebt");
    if (!E.canTrade(s, from, to, give, get)) return this.toast(id, "cantDoThat");
    if (g.trades.filter((t) => t.from === from).length >= 3) return this.toast(id, "tooManyOffers");
    if (this.botControlled(to)) {
      // Computer teams answer straight away.
      const team = this.teamAt(to)!;
      const style = E.STYLES[team.bot ?? "balanced"];
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

  private tradeHooks(): E.TradeHooks {
    const g = this.st.game!;
    return {
      isHuman: (seat) => !this.botControlled(seat),
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
    const a = E.decide(s, seat, g.brains, this.tradeHooks());
    if (s.pending === pd && !E.act(s, seat, a)) E.act(s, seat, E.fallbackAction(s, seat, pd.k));
    this.afterMove();
  }

  // ---------- time ----------

  /** When tick() next needs to run, or null. */
  nextWake(): number | null {
    const times: number[] = [this.st.lastActive + TIMING.roomTtl];
    const g = this.st.game;
    if (g && !g.s.over && !g.paused) {
      const s = g.s;
      if (g.endsAt !== null && !g.timeUp) times.push(g.endsAt);
      if (g.auction) {
        times.push(g.auction.endsAt);
        if (this.hasBotBidder()) times.push(g.auction.botAt);
      }
      if (g.quiz) times.push(this.botControlled(g.quiz.visitor) ? Math.min(g.quiz.botAt, g.quiz.endsAt) : g.quiz.endsAt + 1500);
      if (g.deadline !== null) times.push(g.deadline);
      const pd = s.pending;
      if (pd && pd.k !== "auction" && pd.k !== "quiz") {
        const after = Math.max(g.pendingSince + this.ms("bot"), g.silenceUntil ?? 0);
        for (const seat of E.whoMustAct(s)) {
          const team = this.teamAt(seat);
          if (!team || team.bot || team.autoplay) times.push(after);
          else if (g.awaySince[seat] !== undefined) times.push(Math.max(after, g.awaySince[seat] + this.ms("takeover")));
        }
      }
      for (const t of g.trades) times.push(t.createdAt + this.ms("offer"));
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
    if (!g || g.s.over || g.paused) return false;
    const s = g.s;
    const now = this.now;
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
    for (const seat of waiting) {
      if (this.botControlled(seat)) {
        this.botMove(seat);
        return true;
      }
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
      settings: { mode: st.settings.mode, party: st.settings.party, hotseat: st.settings.hotseat },
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
    return {
      s: pub,
      seats: g.seats,
      mustAct: E.whoMustAct(s),
      decision: g.decision,
      startedAt: g.startedAt,
      endsAt: g.endsAt,
      timeUp: g.timeUp,
      paused: g.paused,
      deadline: g.deadline,
      silenceUntil: g.silenceUntil,
      auction: g.auction && { id: g.auction.id, at: g.auction.at, price: g.auction.price, leader: g.auction.leader, endsAt: g.auction.endsAt, bids: g.auction.bids },
      quiz: q && { id: q.id, visitor: q.visitor, owner: q.owner, item: q.item, endsAt: q.endsAt },
      trades: g.trades.map((t) => ({ id: t.id, from: t.from, to: t.to, give: t.give, get: t.get, expiresAt: t.createdAt + this.ms("offer"), byBot: t.byBot })),
      answered,
      peek,
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
