// One table deciding where to eat. It knows nothing about networks or Google: the Durable Object
// (server/worker.ts) passes messages in, fetches places when `want` asks, calls tick() when
// nextWake() comes due, and sends each person their view().
import * as E from "../engine";
import { MAX_MEMBERS, MAX_SEARCHES, RATING_SLACK, TIMING, cardView, type CardView, type ClientMsg, type Lang, type Phase, type RoomView, type ServerMsg } from "./protocol";

/** Cards are sent again at least this often, so a wait estimate follows the clock. */
const CARDS_REFRESH = 10 * 60_000;

/** A short fingerprint of a string (not for security: only to notice a change). */
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface RoomEnv {
  now(): number;
  random(): number;
}

interface Member {
  id: string;
  key: string;
  name: string;
  lang: Lang;
  online: number;
  joinedAt: number;
  limits: E.Limits | null;
  mood: Partial<Record<E.CuisineId, E.MoodPick>>;
  moodDone: boolean;
  ballot: E.Ballot;
  ballotDone: boolean;
  /** When the last of this person's phones dropped off (see TIMING.awayGrace). */
  leftAt?: number;
}

export interface RoomState {
  v: 1;
  code: string;
  createdAt: number;
  lastActive: number;
  hostId: string;
  center: E.Center;
  range: E.RangeId;
  /** When the table eats (ms since epoch), or null/absent for now: places are checked against their hours then. */
  at?: number | null;
  /** The host's language: restaurant names and reviews come in it where Google has them. */
  lang?: Lang;
  demo: boolean;
  phase: Phase;
  phaseEnds: number | null;
  /** Everything the last search found (Google content: kept only for this room's life). */
  places: E.Place[];
  /** Round 2's list, best first: every place in range and budget when round 1 ended. */
  cards: string[];
  /** Goes up whenever the list or its places change (see cardsRev in protocol.ts). */
  cardsVersion?: number;
  result: RoomView["result"];
  members: Record<string, Member>;
  /** One rating per device. */
  ratings: Record<string, E.Rating>;
  /** The meal before "start over", so the rate link sent to the group chat still works for it. */
  last?: { winner: string; name: string; raters: string[] } | null;
  /** Every device that has rated anything at this table (capped: see RATING_SLACK). */
  raters?: string[];
  /** Google searches run so far (capped: see MAX_SEARCHES). */
  searches?: number;
  error: RoomView["error"];
}

/** Work the room needs from outside: a Google search, or details for the cards. */
export type Want = { k: "search"; center: E.Center; range: E.RangeId; lang: Lang } | { k: "details"; ids: string[] };

export interface Flush {
  changed: boolean;
  direct: [string, ServerMsg][];
  want: Want | null;
}

export class Room {
  private changed = true;
  private direct: [string, ServerMsg][] = [];
  private want: Want | null = null;
  /** The cards as everyone sees them, made once for each cardsRev. */
  private cache: { rev: string; cards: CardView[] } | null = null;

  constructor(
    public st: RoomState,
    private env: RoomEnv,
  ) {}

  static create(code: string, env: RoomEnv, o: { host: string; center: E.Center; range: E.RangeId; demo: boolean; lang?: Lang; at?: number | null }): Room {
    const now = env.now();
    return new Room(
      {
        v: 1,
        code,
        createdAt: now,
        lastActive: now,
        hostId: o.host,
        center: o.center,
        range: o.range,
        at: E.cleanAt(o.at, now),
        lang: o.lang ?? "zh",
        demo: o.demo,
        phase: "lobby",
        phaseEnds: null,
        places: [],
        cards: [],
        result: null,
        members: {},
        ratings: {},
        error: null,
      },
      env,
    );
  }

  expired(): boolean {
    return this.env.now() - this.st.lastActive > TIMING.roomTtl;
  }

  // ---- people ----

  /** A phone connects. The key proves a returning phone is the same person. */
  join(id: string, key: string, o: { name?: string; lang: Lang }): boolean {
    if (!/^[a-f0-9]{8,64}$/.test(id) || key.length < 16) return false;
    const m = this.st.members[id];
    if (m) {
      if (m.key !== key) return false;
      m.online += 1;
      m.lang = o.lang;
      delete m.leftAt;
    } else {
      if (this.full(id)) return false;
      const late = this.st.phase === "cards" || this.st.phase === "spin" || this.st.phase === "result";
      this.st.members[id] = {
        id,
        key,
        name: (o.name ?? "").trim().slice(0, 16),
        lang: o.lang,
        online: 1,
        joinedAt: this.env.now(),
        limits: null,
        mood: {},
        moodDone: late,
        ballot: { approve: [], veto: null },
        ballotDone: this.st.phase === "spin" || this.st.phase === "result",
      };
    }
    this.touch();
    return true;
  }

  /** A new person can't sit down: the table already has MAX_MEMBERS. */
  full(id: string): boolean {
    return !this.st.members[id] && Object.keys(this.st.members).length >= MAX_MEMBERS;
  }

  leave(id: string) {
    const m = this.st.members[id];
    if (!m) return;
    m.online = Math.max(0, m.online - 1);
    if (!m.online) m.leftAt = this.env.now();
    this.touch();
    this.maybeAdvance();
  }

  /** At the table: a phone connected, or one that dropped off less than TIMING.awayGrace ago. */
  private present(m: Member): boolean {
    return m.online > 0 || (m.leftAt !== undefined && this.env.now() - m.leftAt < TIMING.awayGrace);
  }

  /** After a restart: these ids have open sockets, nobody else does. */
  presence(ids: string[]) {
    for (const m of Object.values(this.st.members)) m.online = ids.filter((x) => x === m.id).length;
    this.changed = true;
  }

  private isHost(id: string): boolean {
    if (id === this.st.hostId) return true;
    // Host's phone gone (for longer than a look at the map): anyone can move things along.
    const host = this.st.members[this.st.hostId];
    return !host || !this.present(host);
  }

  // ---- messages ----

  handle(id: string, msg: ClientMsg) {
    const m = this.st.members[id];
    if (!m || !msg || typeof msg !== "object") return;
    const ph = this.st.phase;
    switch (msg.t) {
      case "ping":
        this.direct.push([id, { t: "pong", now: this.env.now() }]);
        return;
      case "name":
        if (typeof msg.name === "string") m.name = msg.name.trim().slice(0, 16);
        break;
      case "lang":
        m.lang = msg.lang === "en" ? "en" : "zh";
        break;
      case "limits":
        m.limits = E.cleanLimits(msg.limits);
        break;
      case "when":
        if (ph !== "lobby" || !this.isHost(id)) return;
        this.st.at = E.cleanAt(msg.at, this.env.now());
        break;
      case "start":
        if (ph !== "lobby" || !this.isHost(id)) return;
        if ((this.st.searches ?? 0) >= MAX_SEARCHES) {
          this.st.error = "searchLimit";
          break;
        }
        this.search();
        break;
      case "again": {
        if (ph !== "result" && ph !== "lobby" && !this.st.error) return;
        if (!this.isHost(id)) return;
        if (E.isRange(msg.range)) this.st.range = msg.range;
        const won = ph === "result" && this.st.result ? this.st.places.find((p) => p.id === this.st.result!.winner) : undefined;
        if (won) this.st.last = { winner: won.id, name: won.name, raters: Object.keys(this.st.ratings) };
        this.toLobby();
        break;
      }
      case "mood": {
        if (ph !== "mood") return;
        const picks: Member["mood"] = {};
        const offered = new Set(E.chips(this.eligible(), this.table()).map((c) => c.cuisine));
        for (const [c, v] of Object.entries(msg.picks ?? {})) if (offered.has(c as E.CuisineId) && (v === "like" || v === "ban")) picks[c as E.CuisineId] = v;
        m.mood = picks;
        m.moodDone = msg.done === true;
        break;
      }
      case "ballot":
        if (ph !== "cards") return;
        m.ballot = E.cleanBallot(msg, this.liveCards());
        m.ballotDone = msg.done === true;
        break;
      case "next":
        if (!this.isHost(id)) return;
        // A tap meant for round 1 that arrives after round 1 ended (two taps, or everyone just
        // finished) must not skip round 2.
        if (msg.phase !== undefined && msg.phase !== ph) return;
        if (ph === "mood") this.toCards();
        else if (ph === "cards") this.count();
        else return;
        break;
      default:
        return;
    }
    this.touch();
    this.maybeAdvance();
  }

  // ---- outside work ----

  /** The search came back. Places carry our own stats already. */
  found(places: E.Place[]) {
    if (this.st.phase !== "finding") return;
    this.st.places = places;
    if (!places.length) return this.fail("nothingNearby");
    if (E.chips(this.eligible(), this.table()).length === 0) return this.fail("nothingFits");
    this.st.phase = "mood";
    this.st.phaseEnds = this.env.now() + TIMING.mood;
    this.changed = true;
  }

  fail(error: NonNullable<RoomView["error"]>) {
    this.toLobby();
    this.st.error = error;
  }

  /** Photos, review quotes and Google's summaries for the top of the list. */
  enrich(details: Record<string, Partial<E.Place>>) {
    for (const p of this.st.places) {
      const d = details[p.id];
      // A description from the search (in the table's language) beats the English one from details.
      if (d) Object.assign(p, d, { id: p.id, cuisine: p.cuisine, about: p.about ?? d.about, summary: p.summary ?? d.summary });
    }
    this.bump();
  }

  /**
   * A rating after the meal, for the result on screen or, after "start over", the meal before it.
   * "new" counts toward that restaurant; "again" is a device rating twice (its new answer replaces
   * the old one on the table's own score only); "closed" means there's nothing to rate, or the table
   * already has as many ratings as people. That cap keeps a shared link from being used to pump a
   * restaurant's numbers.
   */
  rate(cid: string, r: E.Rating): { status: "new" | "again" | "closed"; winner?: string } {
    if (!/^[a-f0-9]{8,64}$/.test(cid)) return { status: "closed" };
    const now = this.st.phase === "result" && this.st.result ? this.st.result.winner : undefined;
    const last = now ? undefined : this.st.last;
    const winner = now ?? last?.winner;
    if (!winner) return { status: "closed" };
    if (now ? this.st.ratings[cid] : last!.raters.includes(cid)) {
      if (now) this.st.ratings[cid] = r;
      this.touch();
      return { status: "again", winner };
    }
    // Over the table's whole life, however many rounds it plays.
    const raters = (this.st.raters ??= []);
    if (!raters.includes(cid)) {
      if (raters.length >= Object.keys(this.st.members).length + RATING_SLACK) return { status: "closed" };
      raters.push(cid);
    }
    if (now) this.st.ratings[cid] = r;
    else last!.raters.push(cid);
    this.touch();
    return { status: "new", winner };
  }

  // ---- flow ----

  private search() {
    this.st.searches = (this.st.searches ?? 0) + 1;
    this.st.phase = "finding";
    this.st.phaseEnds = null;
    this.st.error = null;
    this.want = { k: "search", center: this.st.center, range: this.st.range, lang: this.st.lang ?? "zh" };
    this.changed = true;
  }

  private toLobby() {
    Object.assign(this.st, { phase: "lobby", phaseEnds: null, places: [], cards: [], result: null, ratings: {}, error: null });
    for (const m of Object.values(this.st.members)) Object.assign(m, { mood: {}, moodDone: false, ballot: { approve: [], veto: null }, ballotDone: false });
    this.bump();
  }

  /** The list or its places changed: everyone gets the cards again. */
  private bump() {
    this.st.cardsVersion = (this.st.cardsVersion ?? 0) + 1;
    this.changed = true;
  }

  private table(): E.Limits {
    return E.mergeLimits(Object.values(this.st.members).map((m) => m.limits ?? E.NO_LIMITS));
  }

  /** When the table eats: the planned time while it's still ahead, otherwise now. */
  private when(now = this.env.now()): number {
    return E.mealTime(this.st.at, now);
  }

  private eligible(): E.Place[] {
    const now = this.env.now();
    return E.eligible(this.st.places, this.table(), now, this.when(now));
  }

  private moodCounts() {
    const likes: Partial<Record<E.CuisineId, number>> = {};
    const bans: Partial<Record<E.CuisineId, number>> = {};
    for (const m of Object.values(this.st.members)) {
      for (const [c, v] of Object.entries(m.mood) as [E.CuisineId, E.MoodPick][]) {
        const bucket = v === "like" ? likes : bans;
        bucket[c] = (bucket[c] ?? 0) + 1;
      }
    }
    return { likes, bans };
  }

  /** Round 2: every place in range and budget, ranked; round 1's "no" and everyone's diet move places down. */
  private toCards() {
    const { likes, bans } = this.moodCounts();
    const table = this.table();
    const ids = E.rank({
      places: this.eligible(),
      limits: table,
      likes,
      bans,
      members: Object.keys(this.st.members).length,
      center: this.st.center,
      range: this.st.range,
      now: this.env.now(),
      at: this.when(),
    });
    if (!ids.length) return this.fail("nothingFits");
    this.st.cards = ids;
    this.st.phase = "cards";
    this.st.phaseEnds = this.env.now() + TIMING.cards;
    for (const m of Object.values(this.st.members)) m.moodDone = true;
    // Photos and reviews only for the top of the list (Google bills each place's details).
    this.want = { k: "details", ids: ids.slice(0, E.TOP_COUNT) };
    this.bump();
  }

  /** Cards still allowed: someone who joins late with a lower budget can knock one out. */
  private liveCards(): string[] {
    const limits = this.table();
    return this.st.cards.filter((id) => {
      const p = this.st.places.find((x) => x.id === id);
      return p && E.check(p, limits).ok;
    });
  }

  private count() {
    const cards = this.liveCards();
    if (!cards.length) return this.fail("nothingFits");
    const ballots = Object.values(this.st.members).map((m) => E.cleanBallot(m.ballot, cards));
    const t = E.tally(cards, ballots, this.env.random);
    this.st.result = t;
    this.st.last = null;
    for (const m of Object.values(this.st.members)) m.ballotDone = true;
    if (t.tied.length > 1) {
      this.st.phase = "spin";
      this.st.phaseEnds = this.env.now() + TIMING.spin;
    } else {
      this.st.phase = "result";
      this.st.phaseEnds = null;
    }
    this.changed = true;
  }

  /** Everyone whose phone is here has finished the round: no need to wait for the clock. */
  private maybeAdvance() {
    const here = Object.values(this.st.members).filter((m) => this.present(m));
    if (!here.length) return;
    if (this.st.phase === "mood" && here.every((m) => m.moodDone)) this.toCards();
    else if (this.st.phase === "cards" && here.every((m) => m.ballotDone)) this.count();
  }

  tick() {
    // A phone gone for longer than the grace: now it counts as away (the host's buttons pass on, a
    // round no longer waits for it), and everyone's screen is told.
    for (const m of Object.values(this.st.members)) {
      if (!m.online && m.leftAt !== undefined && this.env.now() - m.leftAt >= TIMING.awayGrace) {
        delete m.leftAt;
        this.changed = true;
      }
    }
    if (this.changed) this.maybeAdvance();
    const ends = this.st.phaseEnds;
    if (ends === null || this.env.now() < ends) return;
    if (this.st.phase === "mood") this.toCards();
    else if (this.st.phase === "cards") this.count();
    else if (this.st.phase === "spin") {
      this.st.phase = "result";
      this.st.phaseEnds = null;
      this.changed = true;
    }
  }

  nextWake(): number | null {
    const expiry = this.st.lastActive + TIMING.roomTtl + 1000;
    const graceEnds = Object.values(this.st.members)
      .filter((m) => !m.online && m.leftAt !== undefined)
      .map((m) => m.leftAt! + TIMING.awayGrace);
    return Math.min(expiry, ...(this.st.phaseEnds === null ? [] : [this.st.phaseEnds]), ...graceEnds);
  }

  private touch() {
    this.st.lastActive = this.env.now();
    this.changed = true;
  }

  flush(): Flush {
    const out = { changed: this.changed, direct: this.direct, want: this.want };
    this.changed = false;
    this.direct = [];
    this.want = null;
    return out;
  }

  // ---- what each phone sees ----

  /** The list as everyone sees it, and its fingerprint: the same for every phone, so made once. */
  private cardList(table: E.Limits, now: number): { rev: string; cards: CardView[] } {
    const st = this.st;
    const at = this.when(now);
    const rev = `${st.cardsVersion ?? 0}.${fingerprint(JSON.stringify(table))}.${Math.floor(now / CARDS_REFRESH)}.${at === now ? "now" : at}`;
    if (this.cache?.rev === rev) return this.cache;
    const { likes, bans } = this.moodCounts();
    const ctx = { center: st.center, range: st.range, limits: table, now, at };
    const cards = this.liveCards().map((cid, i) => {
      const p = st.places.find((x) => x.id === cid)!;
      return cardView(p, i + 1, ctx, { likes: likes[p.cuisine] ?? 0, bans: bans[p.cuisine] ?? 0 });
    });
    this.cache = { rev, cards };
    return this.cache;
  }

  /** The winner's card, kept even if someone who joined afterwards can't eat there, flagged then. */
  private winnerCard(won: E.Place, table: E.Limits, now: number): NonNullable<RoomView["winner"]> {
    const st = this.st;
    const { likes, bans } = this.moodCounts();
    const card = cardView(won, st.cards.indexOf(won.id) + 1, { center: st.center, range: st.range, limits: table, now, at: this.when(now) }, { likes: likes[won.cuisine] ?? 0, bans: bans[won.cuisine] ?? 0 });
    const v = E.check(won, table);
    const severe = v.concerns.some((c) => c.k === "allergy" && c.level === "severe");
    return { ...card, unsafe: !v.ok ? "budget" : severe ? "severe" : false };
  }

  view(id: string): RoomView {
    const st = this.st;
    const now = this.env.now();
    const me = st.members[id];
    const table = this.table();
    const counts = this.moodCounts();
    const showCounts = st.phase !== "mood";
    const list = this.cardList(table, now);
    const rs = Object.values(st.ratings);
    const phaseDone = (m: Member) => (st.phase === "mood" ? m.moodDone : st.phase === "cards" ? m.ballotDone : false);
    const won = (st.phase === "result" || st.phase === "spin") && st.result ? st.places.find((x) => x.id === st.result!.winner) : undefined;
    return {
      code: st.code,
      now,
      phase: st.phase,
      phaseEnds: st.phaseEnds,
      demo: st.demo,
      you: {
        id,
        name: me?.name ?? "",
        host: id === st.hostId,
        limits: me?.limits ?? null,
        mood: me?.mood ?? {},
        ballot: me?.ballot ?? { approve: [], veto: null },
        rated: !!st.ratings[id],
      },
      members: Object.values(st.members)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({ id: m.id, name: m.name, online: this.present(m), host: m.id === st.hostId, ready: m.limits !== null, done: phaseDone(m) })),
      range: st.range,
      // Planned and still ahead; a time that has come (or passed) is "now".
      at: this.when(now) === now ? null : this.when(now),
      table: st.phase === "result" || st.phase === "spin" ? table : E.NO_LIMITS,
      chips: st.phase === "mood" || st.phase === "cards" || st.phase === "spin" || st.phase === "result" ? E.chips(this.eligible(), this.table()).map((c) => ({ ...c, likes: showCounts ? (counts.likes[c.cuisine] ?? 0) : 0, bans: showCounts ? (counts.bans[c.cuisine] ?? 0) : 0 })) : [],
      cards: list.cards,
      cardsRev: list.rev,
      result: st.phase === "result" || st.phase === "spin" ? st.result : null,
      winner: won ? this.winnerCard(won, table, now) : null,
      ratings: {
        n: rs.length,
        up: rs.filter((r) => r.overall === "up").length,
        mid: rs.filter((r) => r.overall === "mid").length,
        down: rs.filter((r) => r.overall === "down").length,
        liked: rs.filter((r) => r.liked).length,
      },
      error: st.error,
    };
  }
}

export function cleanRating(x: unknown): E.Rating | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  if (o.overall !== "up" && o.overall !== "mid" && o.overall !== "down") return null;
  if (typeof o.liked !== "boolean") return null;
  if (o.wait !== 0 && o.wait !== 15 && o.wait !== 30 && o.wait !== 45) return null;
  return { overall: o.overall, liked: o.liked, wait: o.wait };
}
