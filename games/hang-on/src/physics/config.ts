/**
 * 抓紧了 · Hang On — 手感参数（Rapier 版）。
 * 单位：像素、秒、质量单位（身体 = 1）。y 向下。
 * 每个值和原型 `proto/physics.js` 的 CFG 对照，差异和理由见 `docs/physics-notes.md`。
 */
export const CFG = {
  /** 重力，px/s²。和原型相同。 */
  gravity: 1700,
  /** 物理步长：固定 120 Hz，渲染端按需插值。 */
  step: 1 / 120,
  /** Rapier 的 lengthUnit：告诉引擎「典型物体大约多少像素」，它据此缩放允许穿透、预测距离等内部阈值。 */
  lengthUnit: 50,
  /** 约束求解迭代次数（Rapier 默认 4）。链和绳子的质量比大，多给几次更稳。 */
  solverIterations: 8,

  // ---- 身体 ----
  bodyR: 24,
  bodyMass: 1,
  /** 身体的线性阻尼（每秒指数衰减系数）。和原型 bodyDamp 相同。 */
  bodyDamp: 0.35,
  /** 身体对地形的摩擦系数（库仑）。原型是「每子步保留 85% 切向速度」，不是同一种模型，见 notes。 */
  bodyFriction: 0.5,
  /** 抓着东西并推摇杆（在拽自己）时身体的摩擦：低，不然库仑摩擦会把人黏在地上拽不动。 */
  bodyFrictionPulling: 0.15,

  // ---- 胳膊 ----
  /** 3 节胶囊，每节 30 px，总长 90 px（原型 6 × 15）。契约允许身高的 1.6 到 2.2 倍，即 77 到 106。 */
  armSegs: 3,
  segLen: 30,
  /** 胶囊半径。原型的臂点半径是 6。 */
  segR: 5.5,
  /** 每节质量。方案表里写的 0.05。 */
  segMass: 0.05,
  /** 手套（末节末端的小圆）质量；手的半径和原型一样。 */
  handR: 10,
  handMass: 0.03,
  /** 胳膊受重力的比例（面条下垂少一点）。和原型相同。 */
  armGravity: 0.55,
  /** 胳膊刚体的线性和角阻尼。原型 armDamp = 7。 */
  armDamp: 7,
  armAngDamp: 4,
  armFriction: 0.3,
  shoulderDX: 14,
  shoulderDY: -8,

  // ---- 抓 ----
  /** 抓取判定：手心到可抓物表面 ≤ handR + grabPad 就抓上，按下当帧建关节。 */
  grabPad: 7,
  /** 系绳：身体到抓点的 rope joint 长度 = 胳膊长 + 肩宽 + 2。 */
  tetherSlack: 2,

  // ---- 伸手 ----
  /** 没抓着时手心的目标点 = 肩 + 摇杆 × reach；摇杆推一半就伸一半。 */
  reach: 88,
  /** 手的弹簧刚度（每单位胳膊质量的加速度 / px，和原型 reachK 同义）。 */
  reachK: 140,
  /** 摇杆松开时的手的休息方向（相对肩，乘 reach）：垂下来略向外。 */
  restX: 0.35,
  restY: 0.75,
  /** 肩关节电机：目标角 = 摇杆方向；速度电机的比例增益和上限。 */
  shoulderGain: 10,
  shoulderMaxVel: 18,
  shoulderDamping: 20,

  // ---- 挂着时的操作（摇杆 = 身体想去的方向，不可改）----
  /**
   * 挂着时身体的目标点 = 抓点 + 摇杆 × pullReach − 肩偏移。
   * 原型是 reach × 0.9 = 79，比胳膊短，身体永远到不了「胳膊伸直」的位置，拽不动地上的箱子；
   * 这里放到胳膊长 + 肩宽再多 20，往上推能撑到胳膊伸直，往后推能把抓着的东西拖走。
   */
  pullReach: 124,
  /** 身体朝目标点的弹簧刚度（加速度 / px），竖直方向。和原型相同：往上推就能翻上去。 */
  pullK: 48,
  /**
   * 同一根弹簧的水平刚度，分两档：身体压在地上时（爬行、拖箱子）用原型的 48，
   * 悬空时（荡绳子、吊在边缘）用小得多的值。原型只有一档，因为它的软体求解自带内耗；
   * 刚体版悬空也用 48 会把人甩成直升机，见 notes。
   */
  pullKxGround: 48,
  pullKx: 12,
  /** 挂着时额外的横向推力（加速度，px/s²），同样分地上 / 悬空两档。原型 1100。 */
  swingBoostGround: 1100,
  swingBoost: 400,
  /** 抓着东西且脚不沾地时身体的线性阻尼（代替原型软体求解带来的内耗）；松手就回到 bodyDamp。 */
  hangDamp: 1.0,
  /**
   * 拽着悬空的队友、谁也没连到实在的地方时（world.ts 的 pullCounts）：往上快过这么多 px/s，或者离开实在的地方
   * 超过 airPullTime 秒，这个人的拉力就不算了，直到又站到、抓到实在的东西。不然两个人互相抓着推摇杆往上就一直往天上飞。
   * 录好的回放里这样拽人最快往上 538 px/s、最久离地 0.92 秒（van-10），照旧。
   */
  airPullRise: 600,
  airPullTime: 1.0,

  // ---- 绳子 ----
  /** 每节绳子的质量（原型每粒约 0.67，8 粒合 5.3 个身体重；这里 8 节合 2 个身体重，荡起来更活）。 */
  ropeLinkMass: 0.25,
  ropeHandleR: 9,
  ropeLinkR: 3,
  ropeDamp: 1.5,

  // ---- 生死 ----
  deathY: 1040,
  /** 掉出 deathY 后多久回最近检查点。契约：1 秒。原型是 0.7。 */
  respawnDelay: 1.0,
  /** 走到检查点多近算激活（身体中心到检查点）。 */
  checkpointR: 60,
  /** 被队友松开之后几秒内摔死算背叛（中间抓到东西或落地就不算）。 */
  betrayalWindow: 2.5,
  /** 落地事件的门槛：落地前竖直速度超过它才算「砸」下来（动效和音效用）。 */
  landSpeed: 420,

  // ---- 关卡物件（A3）----
  /** 饼干平台默认在几秒、消失几秒。 */
  fadeOn: 3,
  fadeOff: 2,
  /**
   * 弹簧蜡烛：power = 1 时整个人（身体和胳膊）弹起的初速度（px/s）。胳膊的阻尼会一路拽着身体，
   * 所以不是弹道的 v²/2g：1300 实测弹起约 250 px，5 个身高。
   */
  springLaunch: 1300,
  springCooldown: 0.35,
  /** 手柄的偶发动作（召唤）多久只算一次。 */
  actCooldown: 1.0,

  // ---- 模式（A7）----
  /** 比谁先（各跑各的）：第一个到了以后最多再等几秒，到点没到的按进度排。 */
  raceGrace: 40,
  /** 坐不住：一只手抓同一个地方最多几秒就滑脱，几秒起开始抖（提醒）。 */
  lastGripMax: 6,
  lastGripWarn: 4.5,
  /** 滑脱以后这只手多久抓不了东西（按着键也不会马上又抓回去）。 */
  slipCooldown: 0.8,
  /** 定时塌的东西（until）提前几秒开始抖。 */
  crumbleWarn: 2,

  // ---- 道具（A9）----
  /** 速冻：冻住几秒；冷却从用的那一下算（冻 4 秒，再等 8 秒）。 */
  freezeTime: 4,
  freezeCd: 12,
  /** 拉面：几节、每节多长（10 × 20 = 200 px，两个多身高）、留几秒、冷却；锚点离墙多远。 */
  noodleSegs: 10,
  noodleSegLen: 20,
  noodleTime: 10,
  noodleCd: 15,
  noodleGap: 6,
  /** 荷叶：撑几秒、冷却、往下掉最快多少 px/s（平时自由落体一秒就过 1000）、摇杆推着横着飘多快、多快到那个速度。 */
  leafTime: 5,
  leafCd: 12,
  leafFall: 150,
  leafDrift: 260,
  leafAccel: 900,

  // ---- 红包（A9b）----
  /** 红包有多大（半径）：身体或手心碰到它这么近就算拿到。 */
  envelopeR: 14,
};

export type Cfg = typeof CFG;

/** 胳膊总长（关节到手心）。 */
export const ARM_LEN = CFG.armSegs * CFG.segLen;
/** 系绳长度。 */
export const TETHER_LEN = ARM_LEN + CFG.shoulderDX + CFG.tetherSlack;
/** 抓取半径（手心到可抓物表面）。 */
export const GRAB_R = CFG.handR + CFG.grabPad;

/** 地形材质 → 摩擦系数（库仑）。关卡 JSON 的 material 字段。 */
export const MATERIAL_FRICTION: Record<string, number> = {
  cloth: 0.9,
  wood: 0.6,
  ceramic: 0.4,
  metal: 0.3,
  noodle: 0.6,
  ice: 0.05,
};
export const DEFAULT_FRICTION = 0.6;

/** 馅儿色，跟座位走：草莓粉、抹茶绿、芒果黄、苏打蓝、芋泥紫、椰奶白（最多 6 个人）。 */
export const PLAYER_COLORS = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8', '#B9A2E8', '#F1E7D8'];
