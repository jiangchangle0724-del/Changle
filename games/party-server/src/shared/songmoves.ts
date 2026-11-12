// The songs' own dances' moves (the library's 20 are games/dance's): what each is called, what it
// moves, at what tempo it's shown on /party/moves. The coach dances them (client/coach/songmoves.ts)
// and words.ts says how to do each. Drawn by the coach, not from asset files: no icon or clip.
import type { Move } from "./catalog";

const m = (id: string, name_zh: string, name_en: string, body: Move["body"], native_bpm: number, seated_ok = body === "arms"): Move => ({
  id,
  name_zh,
  name_en,
  difficulty: "easy",
  beats: 8,
  body,
  seated_ok,
  icon: "",
  clip: "",
  template: [0.8, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5],
  native_bpm,
});

export const SONG_MOVES: readonly Move[] = [
  // 江南Style
  m("gangnam-bounce", "小PSY律动", "Little PSY groove", "full", 132),
  m("horse-ride", "骑马舞", "Horse ride", "full", 132),
  m("hey-point", "嘿！指一下", "Point on hey", "arms+steps", 132),
  m("disco-point", "蹦迪指天", "Disco point", "full", 132),
  m("horse-lasso", "甩绳", "Lasso", "full", 132),
  m("sexy-lady", "叉腰抖臀", "Sexy lady hip shake", "full", 132),
  m("gangnam-strut", "嘚瑟走", "Strut", "full", 132),
  m("gangnam-pose", "收尾造型", "Final pose", "full", 132),
  // Macarena
  m("macarena-arms", "玛卡蕾娜手", "Macarena arms", "arms", 103),
  m("macarena-hips", "玛卡蕾娜扭胯", "Macarena hips", "full", 103),
  // 科目三
  m("kms-bow", "抱拳鞠躬", "Fist salute", "arms", 130),
  m("kms-swing", "摆手拐腿", "Swing and roll", "full", 130),
  m("kms-roll-throw", "绕手甩出", "Roll and throw", "arms+steps", 130),
  m("kms-guai", "左右拐腿", "Ankle rolls", "full", 130),
  m("kms-open-up", "开手上提", "Open and lift", "full", 130),
  m("kms-open-guai", "打开拐腿", "Open-arm rolls", "full", 130),
  m("kms-cross", "交叉开合", "Cross and open", "full", 130),
  m("kms-xiao", "销手", "Hand sweeps", "full", 130),
  m("kms-slow-xiao", "慢销手", "Slow sweeps", "full", 130),
  // 最炫民族风
  m("zx-swing", "甩手", "Swing the fists", "arms+steps", 127),
  m("zx-raise", "举手", "Hands up", "full", 127),
  m("zx-push-walk", "平举前进", "Push and walk", "full", 127),
  m("zx-oath", "宣誓", "Fist by the temple", "full", 127),
  m("zx-travel-clap", "行进拍手", "Travel and clap", "full", 127),
  m("zx-flower", "献花", "Offer the flower", "full", 127),
  m("zx-reach-pull", "伸手回收", "Reach and pull", "full", 127),
  m("zx-wave-high", "头上挥手", "Wave up high", "full", 127),
  m("zx-pose", "结束造型", "Final pose", "full", 127),
  // 爱你
  m("aini-wings", "展翅弹跳", "Wings and bounce", "arms+steps", 100),
  m("aini-jianzi", "踢毽子", "Shuttlecock kicks", "full", 100),
  m("aini-skip-turn", "转身小跳", "Skip and turn", "full", 100),
  m("aini-heart", "比心", "Finger heart", "arms", 100),
  // APT.
  m("apt-stack", "叠手", "Hand stack", "arms", 74.5),
  m("apt-drum", "拍腿打鼓", "Thigh drums", "arms+steps", 74.5),
  m("apt-rlr-clap", "右左右拍", "Right, left, right, clap", "arms+steps", 74.5),
  m("apt-climb", "往上爬", "Climb up", "arms+steps", 74.5),
  m("apt-headphones", "戴耳机", "Headphones", "arms+steps", 74.5),
];
