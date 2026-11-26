/**
 * 手机局里别的手机：没有物理，拿房主发来的快照拼成 RemoteSim，用和电视一样的画面（Stage）画在手柄后面；
 * 倒数、等开始、结算页也在这里。声音只放自己那个人的和大家共有的（sfx.heardBy）。
 *
 * 这个文件只在手机局里才加载（pad/main.ts 动态 import），电视局的手柄不下载 Pixi；也不引物理（没有 Rapier）。
 * `?render=0`：不画画面（联机检查用），快照照收。
 */
import { heardBy, sfx } from '../audio/sfx';
import { tr } from '../i18n';
import { festNow } from '../fest';
import { levelById, LEVELS, levelsFor, levelTitle, tierOfLevel } from '../levels';
import { keyBanner, tideBanner, tierName } from '../mode-text';
import { tiered } from '../sides';
import type { Level } from '../physics/level';
import type { SimEvent } from '../physics/world';
import type { Cast, Phase, RoomView, Snap } from '../net/protocol';
import { RemoteSim } from '../net/snap';
import { PLATES } from '../render/plates';
import { Stage } from '../render/stage';
import { renderGoldScore, renderResults, resultsTitle, type ResultsDom } from '../results';
import { reportError } from '../report';
import { trophyToast, unlockLines } from '../achv-ui';
import { FX, fxBanner, type FxId } from '../crowd';
import { betText, floatCheer, floatLine, fxName, setFxLayer } from '../crowd-ui';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

export class PhoneView {
  /** 现在画的是哪一关（闪退记录用）。 */
  get levelId(): string {
    return this.sim.level.id;
  }
  sim: RemoteSim;
  /** 这部手机是第几个人（样子名单来了才知道）。 */
  me = -1;
  phase: Phase = 'lobby';
  /** 收到过几张快照、放过几件事、看到几次到顶（检查脚本看）。 */
  snaps = 0;
  events = 0;
  wins = 0;
  private cast_: Cast | null = null;
  private pending: SimEvent[] = [];
  private shownLevel: Level | null = null;
  private last = performance.now();
  private countTimer: ReturnType<typeof setInterval> | null = null;
  private readonly dom: ResultsDom;

  private constructor(private readonly stage: Stage | null) {
    this.sim = new RemoteSim((id) => levelById(id), LEVELS[0] as Level);
    this.dom = {
      title: $('vWinTitle'),
      time: $('vWinTime'),
      par: $('vWinPar'),
      deaths: $('vDeathList'),
      betrayTitle: $('vBetrayTitle'),
      betrayList: $('vBetrayList'),
      betrayNone: $('vBetrayNone'),
      goalTitle: $('vGoalTitle'),
      goalList: $('vGoalList'),
    };
    sfx.attach(document);
    if (stage) {
      sfx.panOf = (x, y) => Math.max(-1, Math.min(1, (stage.toScreen({ x, y }).x / innerWidth) * 2 - 1)) * 0.6;
      addEventListener('resize', () => stage.resize());
    }
    this.showLevel();
    requestAnimationFrame(() => this.frame());
  }

  static async create(canvas: HTMLCanvasElement, opts: { render: boolean }): Promise<PhoneView> {
    // 节日装饰（11-26）：按这部手机的日期（节日关自己带节日）
    const fest = festNow(new Date(), new URLSearchParams(location.search).get('fest'));
    const stage = opts.render ? await Stage.create(canvas, { plates: PLATES, compact: true, fest }) : null;
    return new PhoneView(stage);
  }

  /** 换了个房间：从头收（新房主的快照序号从 1 开始）。 */
  reset(): void {
    this.sim = new RemoteSim((id) => levelById(id), LEVELS[0] as Level);
    this.me = -1;
    this.phase = 'lobby';
    this.snaps = 0;
    this.events = 0;
    this.wins = 0;
    this.cast_ = null;
    this.pending = [];
    this.stopCount();
    this.showLevel();
  }

  /** 房主发来一张快照。 */
  snap(s: Snap): void {
    const evs = this.sim.apply(s, performance.now());
    this.snaps++;
    // 颜色跟着样子名单（有人进出时 RemoteSim 会新建人）
    const cast = this.cast_;
    if (cast) this.sim.players.forEach((p, i) => (p.color = cast.players[i]?.color ?? p.color));
    if (this.sim.level !== this.shownLevel) this.showLevel();
    if (evs.length) {
      this.pending.push(...evs);
      this.events += evs.length;
      this.wins += evs.filter((e) => e.type === 'win').length;
    }
  }

  /** 房主发来样子名单：谁是谁、什么颜色、什么样子；到了结算页还带着结算的数。 */
  cast(c: Cast): void {
    // 抢金元宝：房主那边开了新的一局，和电视上一样写「第 N 局」
    const was = this.cast_?.gold?.round;
    if (c.gold && was !== undefined && c.gold.round > was && this.phase === 'playing') this.banner(tr(`第 ${c.gold.round} 局`, `Round ${c.gold.round}`));
    this.cast_ = c;
    this.me = c.me;
    // 玩法：坐不住时手抓久了要抖；比谁先分队时头顶的名字带上队
    this.sim.rules = { mode: c.mode ?? 'climb', ...(c.teams ? { teams: c.teams } : {}) };
    c.players.forEach((p, i) => {
      const team = c.teams?.[i];
      const name = team === undefined ? p.name : `${p.name} · ${team === 0 ? tr('甜', 'Sweet') : tr('咸', 'Savory')}`;
      this.stage?.setPlayerStyle(i, { ...p, name });
      sfx.setVoice(i, p.look.voice);
      const q = this.sim.players[i];
      if (q) q.color = p.color;
    });
    this.renderOverlays();
  }

  /** 房间变了（阶段、房主在不在）。 */
  room(r: RoomView): void {
    // 房主那部手机掉线（锁屏、没信号）：画面停了，说一声
    $('vHost').hidden = r.hostConnected;
    if (r.phase === this.phase) return;
    const prev = this.phase;
    this.phase = r.phase;
    // 观众投出来的那一样（11-26）只在玩的时候有
    if (r.phase !== 'playing') {
      this.fx = null;
      setFxLayer(null);
    }
    if (r.phase === 'countdown') this.countdown();
    else this.stopCount();
    if (r.phase === 'lobby' || (r.phase === 'countdown' && prev === 'results')) this.stage?.reset();
    this.renderOverlays();
  }

  /** 语言换了。 */
  relang(): void {
    this.renderOverlays();
    if (this.phase === 'countdown') $('vCountLevel').textContent = this.levelName();
  }

  private levelName(): string {
    const l = this.sim.level;
    // 按 id 找：按人数摆过的关卡是另一个对象
    const mode = this.cast_?.mode ?? 'climb';
    const tier = tiered(mode) ? tierOfLevel(l) : undefined;
    const list = levelsFor(mode, tier, this.sim.players.length > 1 ? 'multi' : 'solo');
    const title = levelTitle(l, Math.max(0, list.findIndex((x) => x.id === l.id)));
    // 和主机的倒数一样：分难度的带上难度
    return tier === undefined ? title : `${tierName(tier)} · ${title}`;
  }

  private showLevel(): void {
    this.shownLevel = this.sim.level;
    this.stage?.setLevel(this.sim.level);
    this.stage?.reset();
    this.renderOverlays();
  }

  private countdown(): void {
    this.stage?.intro(2.6);
    this.stopCount();
    let n = 3;
    $('vCountNum').textContent = String(n);
    $('vCountLevel').textContent = this.levelName();
    sfx.countdown(n);
    this.countTimer = setInterval(() => {
      n--;
      sfx.countdown(n);
      if (n <= 0) {
        this.stopCount();
        this.renderOverlays();
        return;
      }
      $('vCountNum').textContent = String(n);
    }, 1000);
    this.renderOverlays();
  }

  private stopCount(): void {
    if (this.countTimer) clearInterval(this.countTimer);
    this.countTimer = null;
  }

  /** 等开始、倒数、结算：按阶段显示。 */
  private renderOverlays(): void {
    $('vWait').hidden = this.phase !== 'lobby';
    $('vLevel').textContent = this.levelName();
    $('vCount').hidden = this.phase !== 'countdown' || !this.countTimer;
    // 抢金元宝的比分（「第 2 局 · 阿一 1 · 阿二 0」）；红包雨（11-26）每一帧自己画（frameBody）
    const gold = this.phase === 'playing' && this.cast_?.mode === 'gold' ? this.cast_.gold : undefined;
    $('vGold').hidden = !gold && !(this.phase === 'playing' && this.cast_?.mode === 'rain');
    $('vGoldIcon').hidden = this.cast_?.mode === 'rain';
    if (gold) {
      const players = this.cast_?.players ?? [];
      renderGoldScore($('vGoldScore'), gold.round, gold.wins, (i) => players[i]?.name || `P${i + 1}`, (i) => players[i]?.color ?? '#fff');
    }
    const res = this.phase === 'results' ? this.cast_?.results : undefined;
    $('vResults').hidden = !res;
    if (res && this.cast_) {
      const players = this.cast_.players;
      renderResults(this.dom, res, (i) => players[i]?.name || `P${i + 1}`, (i) => players[i]?.color ?? '#fff', this.sim.level.par?.seconds);
    }
  }

  /** 一帧出了错也接着画下一帧，不然画面就停住了（看着像闪退）；错误只记前几次。 */
  private frameErrors = 0;
  private frame(): void {
    try {
      this.frameBody();
    } catch (e) {
      if (this.frameErrors++ < 3) console.error('[hang-on] phone frame', e);
      // 闪退自动记录（11-25）：一种错报一次
      reportError(e);
    }
    requestAnimationFrame(() => this.frame());
  }

  private frameBody(): void {
    // 和收快照用同一个钟（见 RemoteSim.advance）
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.sim.advance(now);
    // 红包雨（11-26）：还剩几秒、每个人接到几个（快照带来的，变了才重画）
    const rain = this.sim.rain;
    if (rain && this.phase === 'playing') {
      const players = this.cast_?.players ?? [];
      renderGoldScore($('vGoldScore'), 0, rain.caught.slice(0, this.sim.players.length), (i) => players[i]?.name || `P${i + 1}`, (i) => players[i]?.color ?? '#fff', tr(`🧧 还剩 ${Math.ceil(rain.left)} 秒`, `🧧 ${Math.ceil(rain.left)} s left`));
    }
    if (this.pending.length) {
      const evs = this.pending;
      this.pending = [];
      this.stage?.handleEvents(this.sim, evs);
      sfx.handleEvents(
        this.sim,
        evs.filter((e) => heardBy(e, this.me)),
      );
      this.banners(evs);
    }
    if (this.stage) {
      this.stage.updateCamera(this.sim, dt);
      this.stage.draw(this.sim, dt);
    }
  }

  /** 和电视上一样的横幅：到顶、松手害人、召唤、检查点。 */
  private banners(evs: readonly SimEvent[]): void {
    const name = (i: number): string => this.cast_?.players[i]?.name || `P${i + 1}`;
    const mode = this.cast_?.mode ?? 'climb';
    // 成就（11-25）：谁解锁了什么，冒在左上角（不占横幅）；同一下几个人一起拿到的并成一条
    const box = document.getElementById('trophies');
    const got = evs.flatMap((ev) => (ev.type === 'achv' ? [{ name: name(ev.player), id: ev.id }] : []));
    if (box) for (const line of unlockLines(got)) trophyToast(box, line);
    for (const ev of evs) {
      if (ev.type === 'win') {
        const teams = this.cast_?.teams;
        this.banner(resultsTitle({ time: 0, deaths: [], grabs: [], betrayals: [], mode, winners: ev.who ?? [], ...(teams ? { teams } : {}) }, name));
      }
      if (ev.type === 'finish') this.banner(tr(`${name(ev.player)} 到了！第 ${ev.place} 个`, `${name(ev.player)} made it! #${ev.place}`));

      if (ev.type === 'out') this.banner(tr(`${name(ev.player)} 出局`, `${name(ev.player)} is out`), 'bad');
      if (ev.type === 'betrayal') this.banner(tr(`${name(ev.by)} 松手了`, `${name(ev.by)} let go!`), 'bad');
      if (ev.type === 'summon') {
        const who = ev.who.map(name);
        this.banner(tr(`${name(ev.player)} 把 ${who.join('、')} 拉了回来`, `${name(ev.player)} pulled ${who.join(' & ')} back`));
      }
      if (ev.type === 'checkpoint' && mode !== 'race') this.banner(tr('检查点 ✓', 'Checkpoint ✓'));
      if (ev.type === 'drone' && ev.phase === 'arrive') this.banner(tr('🛸 外卖到了！抓住袋子底下的横杆', '🛸 Delivery! Grab the bar under the bag'));
      if (ev.type === 'tray' && ev.phase === 'spill') this.banner(tr('点心翻了！托盘回去重端', 'The dim sum spilled! The tray goes back'), 'bad');
      if (ev.type === 'tray' && ev.phase === 'home') this.banner(tr('🥟 点心端到了', '🥟 The dim sum made it'));
      // 护送大元宝（11-26）
      if (ev.type === 'escort') this.banner(ev.phase === 'home' ? tr('🪙 大元宝送到顶了！', '🪙 The big gold ingot made it!') : tr('大元宝掉了，回到检查点', 'The ingot fell. It is back at the checkpoint'), ev.phase === 'home' ? 'good' : 'bad');
      if (ev.type === 'key') {
        const kb = keyBanner(ev.phase);
        if (kb) this.banner(kb.text, kb.kind);
      }
      if (ev.type === 'tide') {
        const tb = tideBanner(ev.phase, this.sim.level.world);
        this.banner(tb.text, tb.kind);
      }
      if (ev.type === 'envelope') {
        const got = this.sim.envelopes.filter((e) => e.got).length;
        this.banner(tr(`🧧 ${name(ev.player)} 拿到红包 ${got}/${this.sim.envelopes.length}`, `🧧 ${name(ev.player)} got an envelope ${got}/${this.sim.envelopes.length}`));
      }
      // 观众（11-26）：起哄、押中没有从右下角飘上来；投票开了、投出来的那一样起作用走横幅，画面盖一层
      if (ev.type === 'cheer') floatCheer(ev.who, ev.cheer);
      if (ev.type === 'crowdbet') floatLine('👀', betText(name(ev.fell), ev.hits), true);
      if (ev.type === 'crowdvote') this.banner(tr(`👀 观众在投票：${fxName(ev.a)} 还是 ${fxName(ev.b)}`, `👀 The crowd is voting: ${fxName(ev.a)} or ${fxName(ev.b)}`));
      if (ev.type === 'crowdfx') {
        if (ev.on) {
          const b = fxBanner(ev.fx, ev.dir);
          this.banner(tr(b.zh, b.en), FX[ev.fx].help ? 'good' : 'bad');
        }
        if (ev.on) setFxLayer(ev.fx, ev.dir);
        else if (this.fx === ev.fx) setFxLayer(null);
        this.fx = ev.on ? ev.fx : this.fx === ev.fx ? null : this.fx;
      }
    }
  }

  /** 观众投出来的、正在起作用的那一样（11-26）。 */
  private fx: FxId | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private banner(text: string, kind: 'good' | 'bad' = 'good'): void {
    const el = $('vBanner');
    el.textContent = text;
    el.className = `banner on ${kind}`;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      el.className = 'banner';
    }, 2200);
  }
}
