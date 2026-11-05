/**
 * 抓紧了 · Hang On — Rapier2D 物理（A1）。
 *
 * 结构（按 docs/hang-on.md「物理与动效」的表）：
 * - 身体：圆形刚体，质量 1，锁旋转，CCD。
 * - 胳膊：每条 3 节胶囊，转动关节相连；肩关节带速度电机，目标角 = 摇杆方向；
 *   没抓着的手还有一根弹簧把手心拉向「肩 + 摇杆 × reach」（原型的伸手模型，摇杆推一半伸一半）。
 * - 手：末节末端的小圆；抓取用一个半径 handR + grabPad 的查询圆在场景里找可抓物。
 * - 抓：按下当帧，在手心到可抓物表面的最近点建一个 revolute joint（手绕抓点转）；松开就删。
 *   拉人就是关节连到对方的身体或胳膊刚体。
 * - 系绳：身体到抓点的 rope joint，长度 = 胳膊长 + 肩宽 + 2，两人成链时面条不会被拉成橡皮筋。
 * - 挂着时：摇杆 = 身体想去的方向，对身体施力（和原型一样），再加横向助力。
 * - 绳子：一串胶囊小刚体 + 转动关节，锚点到绳尾再加一根 rope joint 防拉长。
 * - 关卡：静态矩形（按材质给摩擦）、跷跷板（铰接板）、箱子（动态方块）、
 *   饼干平台（A3：到点就关掉碰撞体，抓着它的手一起松开）、弹簧蜡烛（A3：身体落在顶上就给一个向上的冲量）。
 * - 背叛（A3）：松开抓着的队友之后，队友没抓到东西也没落地就摔死了，算松手的人一笔。
 * - 召唤（A3）：手柄的 act = summon，摔死还没复活的队友直接从你身上掉出来。
 *
 * 单位：像素、秒；y 向下。主机是唯一跑物理的地方（铁律 1）。
 */
import RAPIER from '@dimforge/rapier2d-compat';
import {
  CFG,
  DEFAULT_FRICTION,
  GRAB_R,
  MATERIAL_FRICTION,
  PLAYER_COLORS,
  TETHER_LEN,
} from './config';
import type { FadingDef, Level, Pt, Rect, SpringDef } from './level';

type RB = RAPIER.RigidBody;
type Col = RAPIER.Collider;
type Joint = RAPIER.ImpulseJoint;

/** 碰撞分组：16 位 membership << 16 | 16 位 filter。 */
export const GROUP = { TERRAIN: 0x0001, PLAYER: 0x0002, ROPE: 0x0004, PROP: 0x0008, ALL: 0xffff } as const;
const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

/** 手柄 → 主机的每帧输入（契约「输入契约」）。 */
export interface PadInput {
  seq?: number;
  t?: number;
  /** 摇杆 x，-1..1 */
  ax: number;
  /** 摇杆 y，-1..1，上为负 */
  ay: number;
  /** 左手抓 */
  gl: boolean;
  /** 右手抓 */
  gr: boolean;
  act?: 'summon' | 'emote';
}

export type GripKind = 'terrain' | 'rope' | 'player' | 'prop';

export interface Grip {
  kind: GripKind;
  /** 抓点的当前世界坐标（每步更新）。 */
  x: number;
  y: number;
  /** 抓的是哪块地形 / 哪个玩家 / 哪根绳 / 哪个物件。 */
  rect?: Rect;
  player?: number;
  rope?: number;
  prop?: number;
  /** 抓了多久（秒）。 */
  t: number;
}

interface GripInternal extends Grip {
  joint: Joint;
  tether: Joint;
  target: RB;
  /** 抓点在目标刚体局部坐标里的位置。 */
  local: Pt;
}

type ColInfo =
  | { kind: 'terrain'; rect: Rect }
  | { kind: 'rope'; rope: number; link: number }
  | { kind: 'player'; player: number; part: 'body' | 'arm' | 'hand'; arm: number }
  | { kind: 'prop'; prop: number }
  | { kind: 'spring'; spring: number; rect: Rect };

export interface Arm {
  side: -1 | 1;
  /** 三节，从肩到手。 */
  segs: RB[];
  cols: Col[];
  shoulder: RAPIER.RevoluteImpulseJoint;
  elbows: Joint[];
  /** 当前抓着什么；没抓着是 null。 */
  grip: Grip | null;
  /** 手心的世界坐标（每步更新）。 */
  hand: Pt;
  /** 画面用的折线：肩、两个肘、手心。 */
  pts: Pt[];
}

export type Face = 'idle' | 'grab' | 'fly' | 'scream' | 'win';

export interface Player {
  id: number;
  color: string;
  rb: RB;
  bodyCol: Col;
  /** 身体中心和速度（每步更新）。 */
  body: { x: number; y: number; vx: number; vy: number };
  arms: [Arm, Arm];
  aim: Pt;
  grab: [boolean, boolean];
  dead: boolean;
  deadT: number;
  deaths: number;
  face: Face;
  /** 身体是否压在一个朝上的面上。 */
  ground: boolean;
  /** 刚被谁松开（背叛判定用）：没抓到东西也没落地就摔死，算那个人一笔。 */
  heldBy: { by: number; t: number } | null;
  /** 抓过几次。 */
  grabs: number;
  /** 松手害队友摔死几次。 */
  betrayals: number;
  /** 弹簧的冷却（秒），免得一次落地弹好几下。 */
  springCd: number;
  /** 手柄的偶发动作，等下一步处理。 */
  pendingAct: 'summon' | 'emote' | null;
  actAt: number;
}

/** 饼干平台的当前样子（画面用）。 */
export interface Fading {
  x: number;
  y: number;
  w: number;
  h: number;
  material?: string;
  /** 现在在不在。 */
  on: boolean;
  /** 距离下一次切换还有几秒。 */
  left: number;
  onS: number;
  offS: number;
}

/** 弹簧蜡烛的当前样子（画面用）。 */
export interface Spring {
  x: number;
  y: number;
  w: number;
  h: number;
  power: number;
  /** 上一次被弹到现在几秒（没弹过是 Infinity）。 */
  hit: number;
}

export interface Betrayal {
  by: number;
  victim: number;
  t: number;
}

export interface Rope {
  anchor: Pt;
  links: RB[];
  /** 锚点、每节末端……最后一个是绳尾把手。 */
  pts: Pt[];
  handle: Pt;
  segLen: number;
}

export interface Prop {
  kind: 'seesaw' | 'crate';
  rb: RB;
  w: number;
  h: number;
  x: number;
  y: number;
  angle: number;
}

export type SimEvent =
  | { type: 'grab'; player: number; kind: GripKind; x: number; y: number }
  | { type: 'release'; player: number; kind: GripKind; x: number; y: number }
  /** 落地（身体从空中压到地上），speed 是落地前的竖直速度。 */
  | { type: 'land'; player: number; speed: number }
  | { type: 'death'; player: number; x: number; y: number }
  | { type: 'respawn'; player: number; summoned: boolean }
  | { type: 'checkpoint'; index: number }
  | { type: 'bounce'; player: number; spring: number }
  /** 饼干平台没了 / 回来了。 */
  | { type: 'fade'; index: number; on: boolean }
  /** by 松开 victim 之后 victim 摔死了。 */
  | { type: 'betrayal'; by: number; victim: number }
  | { type: 'summon'; player: number; who: number[] }
  | { type: 'win' };

export interface TeleportOpts {
  /** 每只手摆到哪（世界坐标）；null 用默认收拢姿势。 */
  hands?: [Pt | null, Pt | null];
}

let rapierReady: Promise<void> | null = null;
/** 初始化 Rapier（解码内嵌 wasm），只做一次。 */
export function initPhysics(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function toLocal(rb: RB, p: Pt): Pt {
  const t = rb.translation();
  const r = rb.rotation();
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

function toWorld(rb: RB, p: Pt): Pt {
  const t = rb.translation();
  const r = rb.rotation();
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: t.x + c * p.x - s * p.y, y: t.y + s * p.x + c * p.y };
}

function frictionOf(material: string | undefined): number {
  return (material ? MATERIAL_FRICTION[material] : undefined) ?? DEFAULT_FRICTION;
}

/**
 * 一个关卡里的全部物理：地形、绳子、物件、玩家。
 * 用 `createSim()` 建；`setInput()` 喂输入，`step(dt)` 推进，读 `players` / `ropes` / `props` 画画面。
 */
export class Sim {
  readonly level: Level;
  readonly world: RAPIER.World;
  readonly players: Player[] = [];
  readonly ropes: Rope[] = [];
  readonly props: Prop[] = [];
  readonly fadings: Fading[] = [];
  readonly springs: Spring[] = [];
  /** 背叛榜：谁松开谁、什么时候。 */
  readonly betrayals: Betrayal[] = [];
  /** 本帧发生的事（抓、松、死、复活、检查点、过关……），每次 step 清空。 */
  readonly events: SimEvent[] = [];
  time = 0;
  won = false;
  winT = 0;
  /** 全队激活到第几个检查点（-1 = 还在起点）。 */
  checkpoint = -1;

  private readonly info = new Map<number, ColInfo>();
  private readonly terrain: RB;
  private readonly grabShape: RAPIER.Ball;
  private readonly grips = new Map<Joint, { player: number; arm: number; g: GripInternal }>();
  private readonly fadingCols: { def: FadingDef; col: Col }[] = [];
  private acc = 0;

  constructor(level: Level, nPlayers: number) {
    this.level = level;
    const world = new RAPIER.World({ x: 0, y: CFG.gravity });
    world.timestep = CFG.step;
    world.lengthUnit = CFG.lengthUnit;
    world.numSolverIterations = CFG.solverIterations;
    this.world = world;
    this.grabShape = new RAPIER.Ball(GRAB_R);

    // 地形：一个固定刚体，每块矩形一个碰撞体
    this.terrain = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const r of level.rects) this.addRect(r, frictionOf(r.material), 0);
    for (const r of level.fading ?? []) this.addFading(r);
    for (const r of level.springs ?? []) this.addSpring(r);
    for (const def of level.ropes ?? []) this.addRope(def.anchor, def.segments, def.segLen);
    for (const def of level.seesaws ?? []) this.addSeesaw(def.pivot, def.w, def.h ?? 14, frictionOf(def.material));
    for (const def of level.crates ?? []) this.addCrate(def, frictionOf(def.material));

    this.setPlayers(nPlayers);
  }

  // ---------------------------------------------------------------- 关卡物件

  private addRect(r: Rect, friction: number, restitution: number): Col {
    const desc = RAPIER.ColliderDesc.cuboid(r.w / 2, r.h / 2)
      .setTranslation(r.x + r.w / 2, r.y + r.h / 2)
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL));
    const col = this.world.createCollider(desc, this.terrain);
    this.info.set(col.handle, { kind: 'terrain', rect: r });
    return col;
  }

  /** 饼干平台：普通地形，到点就关掉碰撞体。 */
  private addFading(def: FadingDef): void {
    const col = this.addRect(def, frictionOf(def.material), 0);
    this.fadingCols.push({ def, col });
    const onS = Math.max(0.2, def.on ?? CFG.fadeOn);
    const offS = Math.max(0.2, def.off ?? CFG.fadeOff);
    this.fadings.push({ x: def.x, y: def.y, w: def.w, h: def.h, material: def.material, on: true, left: onS, onS, offS });
    this.tickFading(this.fadings.length - 1);
  }

  /** 弹簧蜡烛：能站能抓，身体落在顶上就弹。 */
  private addSpring(def: SpringDef): void {
    const col = this.addRect(def, frictionOf(def.material), 0);
    const index = this.springs.length;
    this.info.set(col.handle, { kind: 'spring', spring: index, rect: def });
    this.springs.push({ x: def.x, y: def.y, w: def.w, h: def.h, power: def.power ?? 1, hit: Infinity });
  }

  /** 饼干平台的钟：算这一步它在不在，变了就开关碰撞体、松开抓着它的手。 */
  private tickFading(i: number): void {
    const f = this.fadings[i];
    const fc = this.fadingCols[i];
    if (!f || !fc) return;
    const cycle = f.onS + f.offS;
    const t = (((this.time + (fc.def.phase ?? 0)) % cycle) + cycle) % cycle;
    const on = t < f.onS;
    f.left = on ? f.onS - t : cycle - t;
    if (on === f.on) return;
    f.on = on;
    fc.col.setEnabled(on);
    if (!on) {
      for (const [, entry] of [...this.grips]) {
        if (entry.g.kind === 'terrain' && entry.g.rect === fc.def) {
          const holder = this.players[entry.player];
          if (holder) this.release(holder, entry.arm);
        }
      }
    }
    this.events.push({ type: 'fade', index: i, on });
  }

  private addRope(anchor: Pt, n: number, segLen: number): void {
    const w = this.world;
    const index = this.ropes.length;
    const anchorRb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y));
    const links: RB[] = [];
    let prev = anchorRb;
    for (let k = 0; k < n; k++) {
      const rb = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(anchor.x, anchor.y + (k + 0.5) * segLen)
          .setLinearDamping(CFG.ropeDamp)
          .setAngularDamping(CFG.ropeDamp)
          .setCanSleep(false),
      );
      const col = w.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(1, segLen / 2 - CFG.ropeLinkR), CFG.ropeLinkR)
          .setMass(CFG.ropeLinkMass)
          .setCollisionGroups(groups(GROUP.ROPE, 0)),
        rb,
      );
      this.info.set(col.handle, { kind: 'rope', rope: index, link: k });
      if (k === n - 1) {
        const handle = w.createCollider(
          RAPIER.ColliderDesc.ball(CFG.ropeHandleR)
            .setTranslation(0, segLen / 2)
            .setMass(CFG.ropeLinkMass * 1.5)
            .setCollisionGroups(groups(GROUP.ROPE, 0)),
          rb,
        );
        this.info.set(handle.handle, { kind: 'rope', rope: index, link: k });
      }
      const jd = RAPIER.JointData.revolute(
        k === 0 ? { x: 0, y: 0 } : { x: 0, y: segLen / 2 },
        { x: 0, y: -segLen / 2 },
      );
      w.createImpulseJoint(jd, prev, rb, true);
      links.push(rb);
      prev = rb;
    }
    // 锚点到绳尾的系绳：绳子再重也拉不长
    const last = links[n - 1];
    if (last) w.createImpulseJoint(RAPIER.JointData.rope(n * segLen, { x: 0, y: 0 }, { x: 0, y: segLen / 2 }), anchorRb, last, true);
    const rope: Rope = { anchor: { ...anchor }, links, pts: [], handle: { x: anchor.x, y: anchor.y + n * segLen }, segLen };
    this.ropes.push(rope);
    this.refreshRope(rope);
  }

  private addSeesaw(pivot: Pt, w: number, h: number, friction: number): void {
    const world = this.world;
    const pivotRb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y));
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pivot.x, pivot.y).setAngularDamping(1.5).setCcdEnabled(true),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
        .setMass(2)
        .setFriction(friction)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.TERRAIN | GROUP.PLAYER | GROUP.PROP)),
      rb,
    );
    world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pivotRb, rb, true);
    const index = this.props.length;
    this.info.set(col.handle, { kind: 'prop', prop: index });
    this.props.push({ kind: 'seesaw', rb, w, h, x: pivot.x, y: pivot.y, angle: 0 });
  }

  private addCrate(def: Rect & { mass?: number }, friction: number): void {
    const world = this.world;
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.x + def.w / 2, def.y + def.h / 2)
        .setLinearDamping(0.2)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, def.h / 2)
        .setMass(def.mass ?? 0.5)
        .setFriction(Math.min(friction, 0.3))
        .setCollisionGroups(groups(GROUP.PROP, GROUP.TERRAIN | GROUP.PLAYER | GROUP.PROP)),
      rb,
    );
    const index = this.props.length;
    this.info.set(col.handle, { kind: 'prop', prop: index });
    this.props.push({ kind: 'crate', rb, w: def.w, h: def.h, x: def.x + def.w / 2, y: def.y + def.h / 2, angle: 0 });
  }

  // ---------------------------------------------------------------- 玩家

  /** 把玩家数调到 n：多的加在出生点，少的连同别人抓着它的手一起去掉。 */
  setPlayers(n: number): void {
    while (this.players.length < n) this.addPlayer();
    while (this.players.length > n) this.removePlayer();
  }

  private addPlayer(): void {
    const id = this.players.length;
    const world = this.world;
    const spawn = this.spawnPoint(id);
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y)
        .lockRotations()
        .setLinearDamping(CFG.bodyDamp)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const bodyCol = world.createCollider(
      RAPIER.ColliderDesc.ball(CFG.bodyR)
        .setMass(CFG.bodyMass)
        .setFriction(CFG.bodyFriction)
        .setRestitution(0)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP)),
      rb,
    );
    this.info.set(bodyCol.handle, { kind: 'player', player: id, part: 'body', arm: -1 });

    const p: Player = {
      id,
      color: PLAYER_COLORS[id % PLAYER_COLORS.length] ?? '#ffffff',
      rb,
      bodyCol,
      body: { x: spawn.x, y: spawn.y, vx: 0, vy: 0 },
      arms: [this.makeArm(id, rb, spawn, -1), this.makeArm(id, rb, spawn, 1)],
      aim: { x: 0, y: 0 },
      grab: [false, false],
      dead: false,
      deadT: 0,
      deaths: 0,
      face: 'idle',
      ground: false,
      heldBy: null,
      grabs: 0,
      betrayals: 0,
      springCd: 0,
      pendingAct: null,
      actAt: -10,
    };
    this.players.push(p);
    this.refreshPlayer(p);
  }

  private makeArm(playerId: number, body: RB, bodyPos: Pt, side: -1 | 1): Arm {
    const world = this.world;
    const shoulder = { x: bodyPos.x + side * CFG.shoulderDX, y: bodyPos.y + CFG.shoulderDY };
    const pose = chainPose(shoulder, { x: shoulder.x + side * 55, y: shoulder.y - 20 });
    const segs: RB[] = [];
    const cols: Col[] = [];
    const armIndex = side < 0 ? 0 : 1;
    for (let k = 0; k < CFG.armSegs; k++) {
      const c = pose.centers[k] as Pt;
      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(c.x, c.y)
          .setRotation(pose.angles[k] as number)
          .setGravityScale(CFG.armGravity)
          .setLinearDamping(CFG.armDamp)
          .setAngularDamping(CFG.armAngDamp)
          .setCcdEnabled(true)
          .setCanSleep(false),
      );
      const cap = world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(1, CFG.segLen / 2 - CFG.segR), CFG.segR)
          .setRotation(Math.PI / 2)
          .setMass(CFG.segMass)
          .setFriction(CFG.armFriction)
          .setCollisionGroups(groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP)),
        rb,
      );
      this.info.set(cap.handle, { kind: 'player', player: playerId, part: 'arm', arm: armIndex });
      segs.push(rb);
      cols.push(cap);
    }
    const last = segs[CFG.armSegs - 1] as RB;
    const hand = world.createCollider(
      RAPIER.ColliderDesc.ball(CFG.handR)
        .setTranslation(CFG.segLen / 2, 0)
        .setMass(CFG.handMass)
        .setFriction(CFG.armFriction)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP)),
      last,
    );
    this.info.set(hand.handle, { kind: 'player', player: playerId, part: 'hand', arm: armIndex });
    cols.push(hand);

    const shoulderJoint = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: side * CFG.shoulderDX, y: CFG.shoulderDY }, { x: -CFG.segLen / 2, y: 0 }),
      body,
      segs[0] as RB,
      true,
    ) as RAPIER.RevoluteImpulseJoint;
    shoulderJoint.configureMotorModel(RAPIER.MotorModel.AccelerationBased);
    const elbows: Joint[] = [];
    for (let k = 1; k < CFG.armSegs; k++) {
      elbows.push(
        world.createImpulseJoint(
          RAPIER.JointData.revolute({ x: CFG.segLen / 2, y: 0 }, { x: -CFG.segLen / 2, y: 0 }),
          segs[k - 1] as RB,
          segs[k] as RB,
          true,
        ),
      );
    }
    return { side, segs, cols, shoulder: shoulderJoint, elbows, grip: null, hand: { ...pose.end }, pts: [] };
  }

  private removePlayer(): void {
    const p = this.players.pop();
    if (!p) return;
    this.releaseAll(p);
    this.releaseGripsOn(p.id);
    for (const arm of p.arms) for (const rb of arm.segs) this.world.removeRigidBody(rb);
    this.world.removeRigidBody(p.rb);
    for (const [h, i] of [...this.info]) if (i.kind === 'player' && i.player === p.id) this.info.delete(h);
  }

  /** 第 i 个玩家的复活点：最近激活的检查点，没有就是起点；几个人并排错开。 */
  private spawnPoint(i: number): Pt {
    const cp = this.checkpoint >= 0 ? this.level.checkpoints?.[this.checkpoint] : undefined;
    if (cp) return { x: cp.x + i * 30, y: cp.y };
    return { x: this.level.spawn.x + i * 44, y: this.level.spawn.y };
  }

  // ---------------------------------------------------------------- 输入

  /** 摇杆归一（超过 1 缩回单位圆，死区 0.12），抓键按住就是抓。 */
  setInput(i: number, input: PadInput): void {
    const p = this.players[i];
    if (!p) return;
    let ax = input.ax;
    let ay = input.ay;
    const l = Math.hypot(ax, ay);
    if (l > 1) {
      ax /= l;
      ay /= l;
    }
    p.aim.x = l < 0.12 ? 0 : ax;
    p.aim.y = l < 0.12 ? 0 : ay;
    p.grab[0] = !!input.gl;
    p.grab[1] = !!input.gr;
    // 偶发动作：手柄会连发几帧保证送到，1 秒内同一个动作只算一次
    if ((input.act === 'summon' || input.act === 'emote') && this.time - p.actAt >= CFG.actCooldown) {
      p.actAt = this.time;
      p.pendingAct = input.act;
    }
  }

  /**
   * 把玩家搬到 (x, y)，速度清零，松开它抓的和抓它的手。
   * 手默认收在身侧；`hands` 可以指定每只手心摆到哪（比如正好放在绳尾上）。
   */
  teleport(i: number, x: number, y: number, opts: TeleportOpts = {}): void {
    const p = this.players[i];
    if (!p) return;
    this.releaseAll(p);
    this.releaseGripsOn(p.id);
    p.rb.setTranslation({ x, y }, true);
    p.rb.setLinvel({ x: 0, y: 0 }, true);
    p.arms.forEach((arm, k) => {
      const shoulder = { x: x + arm.side * CFG.shoulderDX, y: y + CFG.shoulderDY };
      const want = opts.hands?.[k] ?? { x: shoulder.x + arm.side * 55, y: shoulder.y - 20 };
      const pose = chainPose(shoulder, want);
      arm.segs.forEach((rb, s) => {
        const c = pose.centers[s] as Pt;
        rb.setTranslation({ x: c.x, y: c.y }, true);
        rb.setRotation(pose.angles[s] as number, true);
        rb.setLinvel({ x: 0, y: 0 }, true);
        rb.setAngvel(0, true);
      });
    });
    this.world.propagateModifiedBodyPositionsToColliders();
    p.dead = false;
    p.deadT = 0;
    p.heldBy = null;
    p.springCd = CFG.springCooldown;
    this.refreshPlayer(p);
  }

  // ---------------------------------------------------------------- 推进

  /** 推进 dt 秒：内部按固定 120 Hz 走整数步，多出来的零头攒到下一次。 */
  step(dt: number): void {
    if (this.won) {
      this.winT += dt;
      return;
    }
    this.events.length = 0;
    this.acc += dt;
    while (this.acc >= CFG.step - 1e-6) {
      this.substep();
      this.acc -= CFG.step;
      if (this.won) {
        this.acc = 0;
        break;
      }
    }
  }

  private substep(): void {
    const dt = CFG.step;
    this.time += dt;
    for (let i = 0; i < this.fadings.length; i++) this.tickFading(i);
    for (const s of this.springs) s.hit += dt;
    for (const p of this.players) if (!p.dead) this.control(p);
    for (const p of this.players) {
      if (p.dead) continue;
      p.arms.forEach((arm, k) => {
        if (p.grab[k] && !arm.grip) this.tryGrab(p, k);
        else if (!p.grab[k] && arm.grip) this.release(p, k);
        if (arm.grip) arm.grip.t += dt;
      });
    }
    this.world.step();
    for (const p of this.players) {
      const wasGround = p.ground;
      const vyBefore = p.body.vy;
      this.refreshPlayer(p);
      if (!p.dead && p.ground && !wasGround && vyBefore > CFG.landSpeed) this.events.push({ type: 'land', player: p.id, speed: vyBefore });
      if (p.ground) p.heldBy = null;
      p.springCd = Math.max(0, p.springCd - dt);
    }
    for (const rope of this.ropes) this.refreshRope(rope);
    for (const prop of this.props) {
      const t = prop.rb.translation();
      prop.x = t.x;
      prop.y = t.y;
      prop.angle = prop.rb.rotation();
    }
    this.lifeAndDeath(dt);
    this.acts();
    this.checkpoints();
    this.checkWin();
    for (const p of this.players) this.updateFace(p);
  }

  /** 手柄的偶发动作：召唤 = 摔死还没复活的队友立刻从你身上掉出来。 */
  private acts(): void {
    for (const p of this.players) {
      const act = p.pendingAct;
      p.pendingAct = null;
      if (!act || p.dead || act !== 'summon') continue;
      const who: number[] = [];
      for (const q of this.players) {
        if (!q.dead) continue;
        this.teleport(q.id, p.body.x, p.body.y - CFG.bodyR * 2);
        q.face = 'idle';
        who.push(q.id);
        this.events.push({ type: 'respawn', player: q.id, summoned: true });
      }
      if (who.length) this.events.push({ type: 'summon', player: p.id, who });
    }
  }

  /** 一步里的操作：挂着时对身体施力，没抓着的手伸向摇杆方向。 */
  private control(p: Player): void {
    const body = p.rb;
    body.resetForces(false);
    const aimed = p.aim.x !== 0 || p.aim.y !== 0;
    const gripping = p.arms.filter((a) => a.grip);
    body.setLinearDamping(gripping.length && !p.ground ? CFG.hangDamp : CFG.bodyDamp);
    p.bodyCol.setFriction(gripping.length && aimed ? CFG.bodyFrictionPulling : CFG.bodyFriction);
    if (gripping.length && aimed) {
      // 挂着时摇杆指「身体想去哪」，不是「手指哪」：往上推翻上去，左右推是荡。
      let tx = 0;
      let ty = 0;
      for (const arm of gripping) {
        tx += arm.hand.x + p.aim.x * CFG.pullReach - arm.side * CFG.shoulderDX;
        ty += arm.hand.y + p.aim.y * CFG.pullReach - CFG.shoulderDY;
      }
      tx /= gripping.length;
      ty /= gripping.length;
      const t = body.translation();
      const kx = p.ground ? CFG.pullKxGround : CFG.pullKx;
      const boost = p.ground ? CFG.swingBoostGround : CFG.swingBoost;
      body.addForce(
        {
          x: CFG.bodyMass * (kx * (tx - t.x) + boost * p.aim.x),
          y: CFG.bodyMass * (CFG.pullK * (ty - t.y)),
        },
        true,
      );
    }
    const t = body.translation();
    const armMass = CFG.armSegs * CFG.segMass + CFG.handMass;
    for (const arm of p.arms) {
      const seg0 = arm.segs[0] as RB;
      const last = arm.segs[CFG.armSegs - 1] as RB;
      for (const rb of arm.segs) {
        rb.resetForces(false);
        rb.resetTorques(false);
      }
      if (arm.grip) {
        // 抓着的手：肩电机关掉，让拉力顺着关节传到身体
        arm.shoulder.configureMotorVelocity(0, 0);
        continue;
      }
      const sx = t.x + arm.side * CFG.shoulderDX;
      const sy = t.y + CFG.shoulderDY;
      const dx = aimed ? p.aim.x : arm.side * CFG.restX;
      const dy = aimed ? p.aim.y : CFG.restY;
      // 手的弹簧：手心朝「肩 + 摇杆 × reach」
      const hx = sx + dx * CFG.reach;
      const hy = sy + dy * CFG.reach;
      const k = CFG.reachK * armMass;
      last.addForceAtPoint({ x: k * (hx - arm.hand.x), y: k * (hy - arm.hand.y) }, arm.hand, true);
      // 肩电机：上臂指向摇杆方向
      const target = Math.atan2(dy, dx);
      const err = wrapAngle(target - seg0.rotation());
      arm.shoulder.configureMotorVelocity(clamp(CFG.shoulderGain * err, -CFG.shoulderMaxVel, CFG.shoulderMaxVel), CFG.shoulderDamping);
    }
  }

  // ---------------------------------------------------------------- 抓与放

  private tryGrab(p: Player, k: number): void {
    const arm = p.arms[k] as Arm;
    const h = arm.hand;
    let best: { col: Col; point: Pt; d: number; info: ColInfo } | null = null;
    this.world.intersectionsWithShape(h, 0, this.grabShape, (col) => {
      const info = this.info.get(col.handle);
      // 关掉的碰撞体（消失中的饼干）这一步查询还查得到，自己跳过
      if (!info || !col.isEnabled()) return true;
      if (info.kind === 'player') {
        const other = this.players[info.player];
        if (info.player === p.id || !other || other.dead) return true;
      }
      if (info.kind === 'terrain' && info.rect.grab === false) return true;
      const proj = col.projectPoint(h, true);
      if (!proj) return true;
      const d = proj.isInside ? 0 : dist(proj.point, h);
      if (d <= GRAB_R && (!best || d < best.d)) best = { col, point: { x: proj.point.x, y: proj.point.y }, d, info };
      return true;
    });
    if (!best) return;
    const { col, point, info } = best as { col: Col; point: Pt; d: number; info: ColInfo };
    const target = col.parent();
    if (!target) return;
    const local = toLocal(target, point);
    const last = arm.segs[CFG.armSegs - 1] as RB;
    const joint = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: CFG.segLen / 2, y: 0 }, local),
      last,
      target,
      true,
    );
    joint.setContactsEnabled(false);
    const tether = this.world.createImpulseJoint(RAPIER.JointData.rope(TETHER_LEN, { x: 0, y: 0 }, local), p.rb, target, true);
    const kind: GripKind = info.kind === 'spring' ? 'terrain' : info.kind;
    const grip: GripInternal = {
      kind,
      x: point.x,
      y: point.y,
      t: 0,
      joint,
      tether,
      target,
      local,
    };
    if (info.kind === 'terrain' || info.kind === 'spring') grip.rect = info.rect;
    if (info.kind === 'player') grip.player = info.player;
    if (info.kind === 'rope') grip.rope = info.rope;
    if (info.kind === 'prop') grip.prop = info.prop;
    arm.grip = grip;
    this.grips.set(joint, { player: p.id, arm: k, g: grip });
    p.grabs++;
    p.heldBy = null;
    this.events.push({ type: 'grab', player: p.id, kind, x: point.x, y: point.y });
  }

  private release(p: Player, k: number): void {
    const arm = p.arms[k] as Arm;
    const g = arm.grip as GripInternal | null;
    if (!g) return;
    this.world.removeImpulseJoint(g.joint, true);
    this.world.removeImpulseJoint(g.tether, true);
    this.grips.delete(g.joint);
    arm.grip = null;
    // 松开的是队友，而队友此刻悬空又没抓着别的：记下来，几秒内摔死就是背叛
    if (g.kind === 'player' && g.player !== undefined && !p.dead) {
      const victim = this.players[g.player];
      if (victim && !victim.dead && !victim.ground && !victim.arms.some((a) => a.grip)) victim.heldBy = { by: p.id, t: this.time };
    }
    this.events.push({ type: 'release', player: p.id, kind: g.kind, x: g.x, y: g.y });
  }

  private releaseAll(p: Player): void {
    p.arms.forEach((arm, k) => {
      if (arm.grip) this.release(p, k);
    });
  }

  /** 松开所有抓着第 id 号玩家的手。 */
  private releaseGripsOn(id: number): void {
    for (const [, entry] of [...this.grips]) {
      if (entry.g.kind === 'player' && entry.g.player === id) {
        const holder = this.players[entry.player];
        if (holder) this.release(holder, entry.arm);
      }
    }
  }

  // ---------------------------------------------------------------- 状态刷新

  private refreshPlayer(p: Player): void {
    const t = p.rb.translation();
    const v = p.rb.linvel();
    p.body.x = t.x;
    p.body.y = t.y;
    p.body.vx = v.x;
    p.body.vy = v.y;
    for (const arm of p.arms) {
      const pts: Pt[] = [{ x: t.x + arm.side * CFG.shoulderDX, y: t.y + CFG.shoulderDY }];
      for (const rb of arm.segs) pts.push(toWorld(rb, { x: CFG.segLen / 2, y: 0 }));
      arm.pts = pts;
      const hand = pts[pts.length - 1] as Pt;
      arm.hand.x = hand.x;
      arm.hand.y = hand.y;
      const g = arm.grip as GripInternal | null;
      if (g) {
        const w = toWorld(g.target, g.local);
        g.x = w.x;
        g.y = w.y;
      }
    }
    // 地面：身体和某个碰撞体的接触法线朝上
    p.ground = false;
    let springHit = -1;
    this.world.contactPairsWith(p.bodyCol, (other) => {
      if (p.ground && springHit >= 0) return;
      this.world.contactPair(p.bodyCol, other, (manifold, flipped) => {
        if (manifold.numContacts() === 0) return;
        let close = false;
        for (let i = 0; i < manifold.numContacts(); i++) if (manifold.contactDist(i) < 1.5) close = true;
        if (!close) return;
        const n = manifold.normal();
        const ny = flipped ? -n.y : n.y;
        // 法线从身体指向对方：对方在身体下面时 y 为正（y 向下）
        if (ny > 0.5) {
          p.ground = true;
          const info = this.info.get(other.handle);
          if (info?.kind === 'spring') springHit = info.spring;
        }
      });
    });
    // 弹簧蜡烛：身体压在顶上就弹起来（冷却里不重复弹）
    if (springHit >= 0 && !p.dead && p.springCd <= 0) {
      const s = this.springs[springHit];
      if (s) {
        // 整个人一起弹：身体和两条胳膊都给同样的向上速度，不然胳膊的阻尼会把身体拽住
        const launch = CFG.springLaunch * s.power;
        p.rb.setLinvel({ x: p.body.vx, y: 0 }, true);
        p.rb.applyImpulse({ x: 0, y: -p.rb.mass() * launch }, true);
        for (const arm of p.arms) for (const rb of arm.segs) rb.applyImpulse({ x: 0, y: -rb.mass() * launch }, true);
        p.springCd = CFG.springCooldown;
        s.hit = 0;
        this.events.push({ type: 'bounce', player: p.id, spring: springHit });
      }
    }
  }

  private refreshRope(rope: Rope): void {
    const pts: Pt[] = [{ ...rope.anchor }];
    for (const rb of rope.links) pts.push(toWorld(rb, { x: 0, y: rope.segLen / 2 }));
    rope.pts = pts;
    const end = pts[pts.length - 1] as Pt;
    rope.handle.x = end.x;
    rope.handle.y = end.y;
  }

  private lifeAndDeath(dt: number): void {
    for (const p of this.players) {
      if (!p.dead && p.body.y > this.level.deathY) {
        p.dead = true;
        p.deadT = 0;
        p.deaths++;
        p.face = 'scream';
        this.events.push({ type: 'death', player: p.id, x: p.body.x, y: p.body.y });
        const held = p.heldBy;
        p.heldBy = null;
        if (held && this.time - held.t <= CFG.betrayalWindow) {
          const by = this.players[held.by];
          if (by) by.betrayals++;
          this.betrayals.push({ by: held.by, victim: p.id, t: this.time });
          this.events.push({ type: 'betrayal', by: held.by, victim: p.id });
        }
        this.releaseAll(p);
        this.releaseGripsOn(p.id);
      }
      if (p.dead) {
        p.deadT += dt;
        if (p.deadT >= CFG.respawnDelay) {
          const s = this.spawnPoint(p.id);
          this.teleport(p.id, s.x, s.y);
          p.face = 'idle';
          this.events.push({ type: 'respawn', player: p.id, summoned: false });
        }
      }
    }
  }

  private checkpoints(): void {
    const cps = this.level.checkpoints ?? [];
    for (let j = this.checkpoint + 1; j < cps.length; j++) {
      const cp = cps[j] as Pt;
      if (this.players.some((p) => !p.dead && dist(p.body, cp) < CFG.checkpointR)) {
        this.checkpoint = j;
        this.events.push({ type: 'checkpoint', index: j });
      }
    }
  }

  private checkWin(): void {
    if (this.won || this.players.length === 0) return;
    const g = this.level.goal;
    const allIn = this.players.every(
      (p) => !p.dead && p.body.x > g.x && p.body.x < g.x + g.w && p.body.y > g.y && p.body.y < g.y + g.h,
    );
    if (allIn) {
      this.won = true;
      this.winT = 0;
      this.events.push({ type: 'win' });
      for (const p of this.players) p.face = 'win';
    }
  }

  private updateFace(p: Player): void {
    if (this.won) {
      p.face = 'win';
      return;
    }
    if (p.dead) {
      p.face = 'scream';
      return;
    }
    const { vx, vy } = p.body;
    if (p.arms.some((a) => a.grip)) p.face = 'grab';
    else if (vy > 1000) p.face = 'scream';
    else if (Math.abs(vy) > 380 || Math.abs(vx) > 700) p.face = 'fly';
    else p.face = 'idle';
  }

  /** 释放 wasm 里的世界。 */
  destroy(): void {
    this.world.free();
  }
}

/**
 * 把一条 3 节胳膊从肩摆到手心目标：够得着就折成 Z 形正好够到，够不着就伸直指过去。
 * 返回每节的中心、角度和实际手心位置。
 */
export function chainPose(shoulder: Pt, hand: Pt): { centers: Pt[]; angles: number[]; end: Pt } {
  const L = CFG.segLen;
  const n = CFG.armSegs;
  let r = dist(hand, shoulder);
  const theta = r < 1e-6 ? -Math.PI / 2 : Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x);
  r = clamp(r, 1, n * L);
  // 3 节：e(θ+φ) + e(θ−φ) + e(θ) = (1 + 2cosφ)·e(θ)
  const phi = Math.acos(clamp((r / L - 1) / 2, -1, 1));
  const angles = n === 3 ? [theta + phi, theta - phi, theta] : Array.from({ length: n }, () => theta);
  const centers: Pt[] = [];
  let x = shoulder.x;
  let y = shoulder.y;
  for (let k = 0; k < n; k++) {
    const a = angles[k] as number;
    centers.push({ x: x + (L / 2) * Math.cos(a), y: y + (L / 2) * Math.sin(a) });
    x += L * Math.cos(a);
    y += L * Math.sin(a);
  }
  return { centers, angles, end: { x, y } };
}

/** 建一局：初始化 Rapier，然后按关卡搭世界、放 nPlayers 个人在起点。 */
export async function createSim(level: Level, nPlayers = 1): Promise<Sim> {
  await initPhysics();
  return new Sim(level, nPlayers);
}
