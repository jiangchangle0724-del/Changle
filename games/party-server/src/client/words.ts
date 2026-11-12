// The words both pages use for a dance: the stages, the moves, the dances, the awards. Chinese and
// English, in the page's language (common.ts's tr), with the other language beside it where a
// mixed room reads it off the TV.
import type { Difficulty } from "../../../party-base/src/index";
import { routineById, type Move, type Routine } from "../shared/catalog";
import { songById, type Song } from "../shared/songs";
import { STEPS } from "../shared/steps";
import type { Results } from "../shared/protocol";
import type { Show, Stage } from "../shared/show";
import type { Verdict } from "../shared/taps";
import { el, getLang, tr } from "./common";

export function stageName(s: Stage): string {
  switch (s) {
    case "warmup":
      return tr("热身", "Warm-up");
    case "watch":
      return tr("看一遍", "Watch");
    case "follow":
      return tr("跟一遍", "Your turn");
    case "intro":
      return tr("前奏", "Intro");
    case "countdown":
      return tr("准备", "Get ready");
    case "dance":
      return tr("跳！", "Dance!");
    case "cooldown":
      return tr("收尾", "Cool-down");
  }
}

/** One line under the stage on the TV: what to do now. */
export function stageHint(s: Stage, metronome: boolean): string {
  if (metronome) return s === "countdown" ? tr("要开始了", "Here it comes") : tr("每一拍点一下手机", "Tap your phone on every beat");
  switch (s) {
    case "warmup":
      return tr("跟着拍子慢慢动，活动开", "Move gently with the beat to loosen up");
    case "watch":
      return tr("先看，放慢了", "Watch first, slowed down");
    case "follow":
      return tr("跟着做：手机拿在手里跳，或者每一拍点一下", "Do it with me: dance with your phone in hand, or tap it on every beat");
    case "intro":
      return tr("听前奏，准备好", "The intro: get ready");
    case "countdown":
      return tr("要开始了", "Here it comes");
    case "dance":
      return tr("手机拿在手里跳，或者每一拍点一下", "Dance with your phone in hand, or tap it on every beat");
    case "cooldown":
      return tr("慢下来，深呼吸", "Slow down and breathe");
  }
}

export const difficultyName = (d: Difficulty) => (d === "easy" ? tr("简单", "Easy") : d === "medium" ? tr("中等", "Medium") : tr("困难", "Hard"));
export const styleName = (s: Routine["style"]) => (s === "square" ? tr("广场舞", "Plaza dance") : tr("流行", "Pop"));

const zh = () => getLang() === "zh";
export const moveName = (m: Move) => (zh() ? m.name_zh : m.name_en);
/** The move's name in the other language. */
export const moveOther = (m: Move) => (zh() ? m.name_en : m.name_zh);
export const routineName = (r: Routine) => (zh() ? r.name_zh : r.name_en);
export const songTitle = (s: Song) => (zh() ? s.title_zh : s.title_en);
export const songArtist = (s: Song) => (zh() ? s.artist_zh : s.artist_en);
/** A dance's name by its id: one of the library's, or a song's title. */
export function danceName(id: string): string {
  const r = routineById(id);
  if (r) return routineName(r);
  const s = songById(id);
  return s ? songTitle(s) : "";
}

export function bodyHint(m: Move): string {
  if (m.body === "arms") return m.seated_ok ? tr("只动手臂，坐着也行", "Arms only, sitting is fine") : tr("只动手臂", "Arms only");
  return m.body === "arms+steps" ? tr("手臂加踏步", "Arms and steps") : tr("全身", "Whole body");
}

export function awardName(k: keyof Results["awards"]): string {
  return k === "steady" ? tr("最稳", "Steadiest") : k === "hype" ? tr("最嗨", "On fire") : tr("最努力", "Hardest worker");
}
export function awardWhy(k: keyof Results["awards"]): string {
  return k === "steady" ? tr("离拍子最近", "closest to the beat") : k === "hype" ? tr("连着踩准最多拍", "the longest run on the beat") : tr("动得最多", "moved on the most beats");
}

/** The phone's big button while nothing is scored: what to do instead. */
export function restHint(s: Stage): string {
  switch (s) {
    case "warmup":
      return tr("跟着大屏慢慢动", "Move gently with the TV");
    case "watch":
      return tr("先看大屏", "Watch the TV first");
    case "countdown":
      return tr("准备好", "Get ready");
    case "cooldown":
      return tr("慢下来，深呼吸", "Slow down and breathe");
    default:
      return verdictText(null);
  }
}

export function verdictText(v: Verdict | null): string {
  if (v === "hit") return tr("踩准了", "On the beat");
  if (v === "close") return tr("差一点", "Almost");
  if (v === "miss") return tr("动起来", "Move it");
  return tr("跟着拍子点", "Tap with the beat");
}

/** "about 5 min" for a whole show: lead, count-in, dance and cool-down. */
export function showMinutes(show: Show): string {
  const ms = show.leadMs + show.countIn * show.beatMs + show.danceMs + show.tailMs;
  const min = Math.max(1, Math.round(ms / 60000));
  return tr(`约 ${min} 分钟`, `about ${min} min`);
}

/** m:ss */
export const clockOf = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** How to do each move, in one line (the coach shows it; this says it). Mirrored like the coach: "right" is your right. */
const HOW: Record<string, [string, string]> = {
  "clap-2x": ["拍手两下，再把双手打开", "Clap twice, then open your hands out"],
  "raise-arms": ["双手往上举，再收回肩膀", "Throw both arms up, then back to your shoulders"],
  "side-wave": ["双手举过头，左右摇摆", "Arms up over your head, wave them side to side"],
  "handkerchief-flower": ["双手在两边转圈，一高一低再换", "Twirl your hands at your sides, one high, one low, then swap"],
  "shoulder-roll": ["双肩往后绕圈，手臂放松", "Roll your shoulders back in circles, arms loose"],
  "forward-push": ["双手往前推，再收回胸前", "Push both hands forward, then pull them back to your chest"],
  "open-arms": ["双臂张开挺胸，再收回胸前", "Open your arms wide, chest up, then bring them in"],
  "alternating-reach": ["右手往上伸，再换左手", "Reach up with your right hand, then your left"],
  "side-step-touch": ["往左跨一步，右脚并过去拍手，再往右", "Step left, bring the right foot in and clap, then go right"],
  "march-clap": ["原地踏步，每两拍拍一下手", "March on the spot, clap every second beat"],
  "cross-step": ["右脚往左前交叉，左脚后退，右脚往右，左脚回来", "Right foot crosses in front, left steps back, right steps out, left comes back"],
  "yangge-twist": ["一前一后踏步扭腰，双手甩起来", "Step forward and back, twist your hips, swing your arms"],
  "heel-tap": ["双手叉腰，脚跟轮流往前点地", "Hands on hips, tap one heel forward, then the other"],
  "v-step": ["右脚左脚往前分开，再一只一只收回，手跟着举", "Right then left foot step out wide, then back in, arms up with them"],
  "step-knee-lift": ["踏一步，另一只膝盖抬起来，手往下碰膝盖", "Step, lift the other knee, bring your hands down to it"],
  "eight-step-sway": ["左右摇摆，前四拍手在头上，后面放低，最后拍手", "Sway side to side: arms up for four, then low, then a clap"],
  "kemusan-hand-twirl": ["双手在身前绕圈，左右换边，脚轻轻踢出去", "Roll your hands round each other, side to side, flick your feet out"],
  "grapevine-turn": ["往右跨，后交叉，再跨一步转一圈拍手，再往左", "Step right, cross behind, step and spin, clap; then back to the left"],
  "squat-reach": ["蹲下双手前伸，站起来双手举高", "Squat with your arms forward, stand up and reach high"],
  "side-lunge-punch": ["往右弓步出拳，回来，再往左", "Lunge right and punch, come back, then the left"],
  // the songs' own dances (src/shared/songmoves.ts)
  "horse-ride": ["两手腕交叉像握着缰绳，膝盖弯：右、左、右右，左、右、左左地跳", "Wrists crossed like holding the reins, knees bent: hop right, left, right-right, then left, right, left-left"],
  "horse-lasso": ["左手横在胸前，右手举过头顶转圈甩绳，脚继续骑马", "Left forearm across your chest, right hand circling over your head like a lasso, feet still riding"],
  "sexy-lady": ["双手叉腰，胯一拍往右顶、一拍往左顶，抖起来", "Hands on your hips, pop your hips right, then left, a beat each: shake it"],
  "disco-point": ["蹲低，左手往左上方指天、右手往下指地，弹四下；再双手举高摇", "Stay low, left arm pointing up and out, right hand pointing down, bounce four times; then both arms up, swaying"],
  "gangnam-strut": ["右手贴胸口，左右迈步点地，肩膀跟着甩", "Right hand on your chest, step and tap side to side, shoulders swinging with it"],
  "gangnam-bounce": ["拳头放胸前，膝盖弹一下、胯往前顶一下", "Fists at your chest: bounce your knees, then push your hips forward"],
  "hey-point": ["左右晃三拍，第四拍往前一指（嘿！），再换手", "Sway for three, point forward on four (hey!), then the other hand"],
  "gangnam-pose": ["右腿往外踢出去，身体往右斜，右手往上，定住", "Kick your right leg out, lean right, right arm up, and hold"],
  "macarena-arms": ["右手往前伸手心向下，左手也是；翻成手心向上；右手搭左肩，左手搭右肩；右手放脑后，左手也是", "Right arm out palm down, then the left; turn the palms up; right hand to left shoulder, left to right; right hand behind your head, then the left"],
  "macarena-hips": ["右手放左边胯前，左手放右边；右手放右后兜，左手放左后兜；扭三下胯，跳起来往左转（嘿！）", "Right hand to the front of your left hip, left to the right; hands to your back pockets; roll your hips three times, jump and turn left (hey!)"],
  "kms-bow": ["右拳包在左掌里，弯腰鞠躬，再起来", "Right fist in your left palm, bow, then come up"],
  "kms-swing": ["双手在胸前一起往右摆，右脚踝往外一拐，再往左；手腕一直翻", "Both hands swing right at your chest as your right ankle rolls out, then left; keep the wrists flipping"],
  "kms-roll-throw": ["双手在胸前绕两圈，第五拍往右甩出去", "Roll your hands round each other twice in front of your chest, then throw them out to the right"],
  "kms-guai": ["右脚踝往外拐，膝盖跟着出去，再换左边；脚轻轻点，不要压上去", "Roll your right ankle out, knee with it, then the left; just tip it, don't put weight on it"],
  "kms-open-up": ["双手打开左右拐两下，再举过头顶摇花手，脚交叉着拐", "Arms open, roll each ankle once, then hands up over your head twirling, feet crossing"],
  "kms-open-guai": ["双手打开不动，左右拐腿四下", "Hold your arms open and roll your ankles four times"],
  "kms-cross": ["手臂在胸前交叉成X再打开，每次配一个拐腿", "Cross your forearms in an X at your chest, then open them, an ankle roll each time"],
  "kms-xiao": ["交叉打开两次，再拐脚把右手从上往下削，换左手", "Cross and open twice, then roll an ankle as your right hand sweeps down, then the left"],
  "kms-slow-xiao": ["先拐左脚，右手慢慢往下削；再拐右脚，左手慢慢削", "Roll your left ankle as your right hand slowly sweeps down; then the right ankle and the left hand"],
  "zx-swing": ["双脚分开，重心左右换，拳头在胸前跟着甩", "Feet apart, shift your weight side to side, fists at your chest swinging with it"],
  "zx-raise": ["右脚往外一步双手直直举高，收回；再换左边", "Step out on the right with both arms straight up, come back; then the left"],
  "zx-push-walk": ["往前走三步双手往前推，并脚；再退回来", "Walk forward three steps pushing your hands forward, feet together; then walk back"],
  "zx-oath": ["右脚往外一步，右拳举到太阳穴边，左手叉腰，收回；再换左边", "Step out on the right, right fist up by your temple, left hand on your hip; back in; then the other side"],
  "zx-travel-clap": ["往左走两步并脚，第四拍拍手；小跳着到右肩上、左肩上拍手，回来", "Step together to the left twice, clap on four; hop back with a clap over each shoulder"],
  "zx-flower": ["右脚往右前方一步，双手捧起往前上方送出去，收回；再换左边", "Step to the front right, offer your cupped hands up and forward, come back; then the left"],
  "zx-reach-pull": ["右脚往前一步双手平伸手心向上，拳头收回腰边；再换左脚", "Step forward on the right, reach both arms out palms up, pull your fists back to your waist; then the left"],
  "zx-wave-high": ["左右并步，双手在头上举成V字跟着摆", "Step together side to side, arms up in a V swaying with you"],
  "zx-pose": ["右手直直往上，左手往前平举，右脚尖点在前面", "Right arm straight up, left arm forward, right toes pointed in front"],
  "aini-wings": ["双手往两边斜下打开像翅膀，膝盖跟着拍子弹", "Arms out and down at your sides like wings, bounce your knees on the beat"],
  "aini-jianzi": ["双手打开，左右脚轮流从里面往上踢，像踢毽子", "Arms out, kick each foot up on the inside in turn, like kicking a shuttlecock"],
  "aini-skip-turn": ["小跳着转一圈，左手叉腰，右手在头上画半圈；再双手叉腰扭四下", "Skip round in a circle, left hand on your waist, right hand drawing a half circle over your head; then hands on your waist, twist four times"],
  "aini-heart": ["双手在下巴边比个心，左右摇", "Make a heart with your hands by your chin, sway side to side"],
  "apt-stack": ["拳头一上一下往上叠到下巴（아파트 游戏），再点头", "Stack your fists one on top of the other up to your chin (the 아파트 game), then nod"],
  "apt-drum": ["膝盖弹，两手轮流拍大腿打鼓，拍手，右手举起来", "Bounce and drum on your thighs, clap, then right hand up"],
  "apt-rlr-clap": ["身体斜一点：右手举、左手举、右手举，拍手；再换另一边", "Turn a little to the side: right hand up, left, right, clap; then the other side"],
  "apt-climb": ["左右小步，双手一节一节往上爬，再张开双手点点头", "Small side steps as your hands climb up hand over hand, then open your arms wide and nod"],
  "apt-headphones": ["往右一步伸出右手，收回；往左一步；拍手，双手放耳边像戴耳机", "Step right reaching out, back; step left; clap, then hands to your ears like headphones"],
  "cupid-right": ["往右跨一步、并一步，一共四次", "Step right and close, four times over"],
  "cupid-left": ["往左跨一步、并一步，一共四次", "Step left and close, four times over"],
  "cupid-kick": ["右脚踢、收，左脚踢、收，来两遍", "Kick right, back; kick left, back; twice"],
  "cupid-walk": ["原地走八步，同时往左转四分之一圈", "Walk eight steps on the spot, turning a quarter to the left"],
  "cha-left": ["左脚往左跨一大步，右脚贴着地拖过去", "A big step left, the right foot dragged in along the floor"],
  "cha-right": ["右脚往右跨一大步，左脚贴着地拖过去", "A big step right, the left foot dragged in along the floor"],
  "cha-back": ["往后退四步：右、左、右、左", "Four steps back: right, left, right, left"],
  "cha-hop": ["双脚一起往前跳一下", "Jump forward once, both feet together"],
  "cha-hop2": ["双脚一起往前跳两下", "Jump forward twice, both feet together"],
  "cha-hops": ["双脚一起，一拍跳一下，一直跳", "Both feet together, a hop on every beat, keep going"],
  "cha-stomp-r": ["右脚抬起来，用力往下跺一下", "Lift your right foot and stamp it down hard"],
  "cha-stomp-l": ["左脚抬起来，用力往下跺一下", "Lift your left foot and stamp it down hard"],
  "cha-stomp2-r": ["右脚跺两下", "Stamp your right foot twice"],
  "cha-stomp2-l": ["左脚跺两下", "Stamp your left foot twice"],
  "cha-cha": ["右脚往前点一下、收回，原地恰恰恰；再换左脚", "Rock forward on the right, back, then cha-cha-cha on the spot; then the left"],
  "cha-turn": ["原地踩着小步，往左转四分之一圈", "Little steps on the spot, turning a quarter to the left"],
  "cha-criss": ["跳起来双脚交叉落地，再跳起来分开落地", "Jump and land with your feet crossed, jump again and land them apart"],
  "cha-knees": ["弯腰双手扶膝盖，膝盖往里往外开合", "Bend over, hands on your knees, the knees swinging in and out"],
  "cha-funky": ["随便扭：身体波浪，肩膀抖起来", "Anything goes: roll your body, shake your shoulders"],
  "cha-clap": ["左右踏步，每一拍拍一下手", "Step side to side, a clap on every beat"],
  "cha-freeze": ["定住！一动不动", "Freeze! Not a move"],
  "cha-low": ["膝盖往外打开，一拍比一拍蹲得更低", "Knees out, a little lower on every beat"],
  "cha-top": ["从蹲着慢慢站起来，双手举到最高", "Up from low, slowly, your hands up as high as they go"],
  "cha-reverse": ["跳起来转半圈，面向后面", "Jump and turn halfway round, to face the back"],
  "cha-charlie": ["右脚往前踩、左脚往前踢；左脚往后踩、右脚往后点，前后摇", "Right foot forward and kick the left; left foot back and touch the right behind; rock forward and back"],
  "ymca-groove": ["左右踏步，脚并过来时拍手", "Step side to side, clapping as the feet come together"],
  "ymca-pump": ["踏步，右拳往天上打一下，再换左拳", "Step side to side, punching your right fist up to the sky, then the left"],
  "ymca-letters": ["用双臂摆出字母：Y、M、C、A，一拍一个；再踏步拍手", "Make the letters with your arms, one a beat: Y, M, C, A; then step and clap"],
  "wm-watch": ["手指先指自己眼睛，再指向大家，然后肩膀跟着拍子弹", "Point at your eyes, then out at everyone, then bounce your shoulders"],
  "wm-whip": ["弹两下，右手往前一甩、身体往后靠（Whip）；再举右手左右挥（Nae Nae）", "Two bounces, then throw your right arm out front and lean back (whip); then wave your right hand up high (nae nae)"],
  "wm-whip2": ["Whip 两下，再举右手左右挥（Nae Nae）", "Whip twice, then wave your right hand up high (nae nae)"],
  "wm-stanky": ["右膝弯着往里扣、往外转，四拍后换左腿；手臂张开放低", "Bend your right knee and roll it in and out, then the left leg after four beats; arms out low"],
  "wm-break": ["膝盖往里扣、脚跟往外踢，再放平，左右换着来", "Knees knocked in, heels kicked out, then flat again, side to side"],
  "wm-bop": ["踮着脚弹，手在身前一前一后划，往左挪几步再回来", "Bounce on your toes, arms rowing in front, a few steps over to the left and back"],
  "wm-yule": ["身体后靠，拳头在胯边轮流往前转（Yule）；再跳起来双手往前伸，一条腿往后踢（超人）", "Lean back and crank your fists by your hips (yule); then jump, arms out in front, one leg kicked back (Superman)"],
  "wm-duff": ["双手张开放在脸两边，胯左右顶着弹", "Hands open beside your face, bouncing your hips from side to side"],
  "ketchup-sway": ["左右踏步扭胯，脚并过来时轻轻拍手", "Step side to side swinging your hips, a soft clap as your feet come together"],
  "ketchup-hands": ["手心朝下在身前交叉、分开两次；右拇指、左拇指往肩后指；双拳绕圈", "Palms down, cross and sweep your hands apart twice; right thumb, then left thumb over your shoulders; roll your fists"],
  "ketchup-head": ["右手搭在额头往远处看，左手叉腰，胯左右扭", "Right hand to your forehead looking far off, left hand on your hip, wiggle your hips"],
  "gee-groove": ["拳头放下巴前，左右踏步，头一歪一歪", "Fists by your chin, step side to side, tilting your head"],
  "gee-crab": ["膝盖往外弯、手掌朝下放在胯边拍，往右挪四小步，再往左挪回来", "Knees bent out, hands flat by your hips patting the air, four little steps right, then back left"],
  "gee-shy": ["双手捂着脸颊，身体左右摇", "Hands on your cheeks, swaying side to side"],
  "gee-sparkle": ["双手放在眼睛旁边一张一合地闪，头左右转", "Hands by your eyes flashing open and shut, head turning side to side"],
  "gee-surprise": ["小跳一下往后缩，双手捂嘴，两次", "A little jump back, hands to your mouth, twice"],
  "gee-shiver": ["双手抱住自己，肩膀快速地抖", "Hug yourself and let your shoulders shiver"],
  "hc-seaweed": ["双手举过头顶左右摇，像海草；再放到身前像水波一样摆", "Arms over your head swaying like seaweed; then down in front, waving like water"],
  "hc-look": ["右手搭额头往右看，四拍后换左手往左看", "Right hand shading your eyes, look right; after four beats, the left hand, look left"],
  "hc-float": ["双手在身前低低地像水一样摆，膝盖一蹲一起", "Hands waving low in front like water, knees bobbing down and up"],
  "hc-dream": ["双手合起来贴在脸边像睡觉，左右摇", "Hands together by your cheek as if asleep, swaying side to side"],
  "hc-where": ["双手在胸前比心，再伸出右手找人", "A heart at your chest, then reach out your right hand, searching"],
  "hc-bounce": ["左右踏步，拳头一拍一边往上打", "Step side to side, punching a fist up, one side then the other"],
  "hc-hero": ["先蹲低、双手捧着像小草；再站起来右拳举高，当英雄", "Crouch low, hands cupped like a little blade of grass; then stand tall, right fist up: the hero"],
};

export function moveHow(m: Move): string {
  const h = HOW[m.id];
  return h ? tr(h[0], h[1]) : "";
}

/** A move step by step in this page's language: how to stand, each count's line, what to keep in mind; null for a move without them. */
export function moveSteps(m: Move): { ready: string; lines: { from: number; to: number; counts: string; text: string }[]; tip: string } | null {
  const s = STEPS[m.id];
  if (!s) return null;
  return {
    ready: tr(s.ready[0], s.ready[1]),
    lines: s.counts.map(([from, to, zh, en]) => ({ from, to, counts: from === to ? String(from) : `${from}-${to}`, text: tr(zh, en) })),
    tip: s.tip ? tr(s.tip[0], s.tip[1]) : "",
  };
}

/** The list of a move's steps, the count being danced lit up by litCount; null for a move without them. */
export function stepsList(m: Move): HTMLElement | null {
  const s = moveSteps(m);
  if (!s) return null;
  const box = el("div", "coach-steps");
  const list = el("ol");
  for (const l of s.lines) {
    const li = el("li");
    li.dataset.from = String(l.from);
    li.dataset.to = String(l.to);
    li.append(el("b", "", l.counts), document.createTextNode(l.text));
    list.append(li);
  }
  box.append(el("p", "steps-ready", `${tr("准备：", "Ready: ")}${s.ready}`), list);
  if (s.tip) box.append(el("p", "steps-tip", s.tip));
  return box;
}

/** Lights up the line of a steps list (stepsList) that has this count; 0 lights none. */
export function litCount(box: HTMLElement | null | undefined, count: number) {
  if (!box) return;
  for (const li of box.querySelectorAll<HTMLElement>("li")) {
    const on = count >= Number(li.dataset.from) && count <= Number(li.dataset.to);
    li.classList.toggle("is-now", on);
  }
}
