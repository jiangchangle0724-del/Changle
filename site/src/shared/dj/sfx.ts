/**
 * 打碟 · DJ Booth: the sound board (Steve on Nov 13: "首先对我的这些音效进行细致的分类…玩家看到的会先是这些分类
 * 进去之后才可以播放音效。把你的音效全部替换掉"): his own sound files, in categories. A phone shows the
 * categories first, then a category's sounds; a tap plays it on the big screen at once, over whatever
 * plays (the DJ, a song). The files are on the site (`/media/sfx/<id>.mp3`: trimmed of silence, at
 * most 20 s, brought to one loudness, mono MP3), made from his folder by a script (see CONTRACTS.md).
 *
 * The room knows a sound by its place in `SFX`: new ones go at the end, none is taken out of the
 * middle (a phone and a big screen a deploy apart would name each other's sounds wrong).
 */

export type SfxCat = "dj" | "mc" | "hype" | "funny" | "shock" | "fail" | "taunt" | "songs" | "rude";

/** The categories, in the order a phone shows them. */
export const SFX_CATS: { id: SfxCat; zh: string; en: string }[] = [
  { id: "dj", zh: "DJ 音效", en: "DJ effects" },
  { id: "mc", zh: "DJ 喊麦", en: "DJ shouts" },
  { id: "hype", zh: "高潮", en: "Hype" },
  { id: "funny", zh: "搞笑", en: "Funny" },
  { id: "shock", zh: "震惊", en: "Shock" },
  { id: "fail", zh: "失败", en: "Fail" },
  { id: "taunt", zh: "嘲讽", en: "Taunts" },
  { id: "songs", zh: "神曲", en: "Songs" },
  { id: "rude", zh: "粗口 · 慎点", en: "Explicit" },
];

/** One sound: its file's name, category, name in both languages, seconds. */
export type Sfx = { id: string; cat: SfxCat; zh: string; en: string; s: number };

export const SFX: Sfx[] = [
  { id: "dj-airhorn", cat: "dj", zh: "气笛", en: "Air horn", s: 7.59 },
  { id: "dj-scratch", cat: "dj", zh: "搓碟", en: "Scratch", s: 2.57 },
  { id: "dj-boom", cat: "dj", zh: "重低音 咚", en: "Boom", s: 0.89 },
  { id: "dj-riser", cat: "dj", zh: "往上冲", en: "Riser", s: 6.7 },
  { id: "dj-sweep", cat: "dj", zh: "扫频", en: "Sweep", s: 9.09 },
  { id: "dj-roll", cat: "dj", zh: "鼓点加速", en: "Drum roll", s: 6.28 },
  { id: "dj-stutter", cat: "dj", zh: "卡顿", en: "Stutter", s: 5.01 },
  { id: "dj-hits", cat: "dj", zh: "节奏连击", en: "Hits", s: 4.31 },
  { id: "dj-chop", cat: "dj", zh: "人声切片", en: "Vocal chop", s: 10.3 },
  { id: "dj-laser", cat: "dj", zh: "激光", en: "Lasers", s: 5.16 },
  { id: "dj-down", cat: "dj", zh: "掉下去", en: "Power down", s: 5.03 },
  { id: "dj-fill", cat: "dj", zh: "过门鼓", en: "Drum fill", s: 3.61 },
  { id: "mc-letsgo", cat: "mc", zh: "Let's go", en: "Let's go", s: 7.9 },
  { id: "mc-fire", cat: "mc", zh: "Give them that fire", en: "Give them that fire", s: 2.76 },
  { id: "mc-dj", cat: "mc", zh: "It's good to be a DJ", en: "It's good to be a DJ", s: 3.73 },
  { id: "mc-feel", cat: "mc", zh: "Listen, feel, meditate", en: "Listen, feel, meditate", s: 6.48 },
  { id: "mc-hey", cat: "mc", zh: "Hey hey hey", en: "Hey hey hey", s: 3.31 },
  { id: "hype-countdown", cat: "hype", zh: "The Final Countdown", en: "The Final Countdown", s: 20.0 },
  { id: "hype-legends", cat: "hype", zh: "Legends Never Die", en: "Legends Never Die", s: 17.75 },
  { id: "hype-firstblood", cat: "hype", zh: "First Blood", en: "First Blood", s: 2.41 },
  { id: "hype-bomb", cat: "hype", zh: "炸弹已安放", en: "Bomb has been planted", s: 1.52 },
  { id: "hype-explosion", cat: "hype", zh: "爆炸", en: "Explosion", s: 2.91 },
  { id: "hype-bell", cat: "hype", zh: "出场钟声", en: "Entrance bell", s: 4.05 },
  { id: "hype-king", cat: "hype", zh: "关中王来了", en: "Here comes the king", s: 5.0 },
  { id: "hype-edit", cat: "hype", zh: "燃曲", en: "Hype edit", s: 17.96 },
  { id: "hype-gong", cat: "hype", zh: "敲锣", en: "Gong", s: 5.98 },
  { id: "fun-carhorn", cat: "funny", zh: "傻喇叭", en: "Goofy horn", s: 2.75 },
  { id: "fun-fart", cat: "funny", zh: "放屁", en: "Fart", s: 0.26 },
  { id: "fun-chicken", cat: "funny", zh: "尖叫鸡", en: "Screaming chicken", s: 5.37 },
  { id: "fun-slap", cat: "funny", zh: "一巴掌", en: "Slap", s: 1.28 },
  { id: "fun-later", cat: "funny", zh: "片刻之后", en: "A few moments later", s: 1.99 },
  { id: "fun-rizz", cat: "funny", zh: "Rizz", en: "Rizz", s: 1.6 },
  { id: "fun-makka", cat: "funny", zh: "晚安玛卡巴卡", en: "Makka Pakka, good night", s: 3.09 },
  { id: "fun-bluetooth", cat: "funny", zh: "蓝牙已连接", en: "Bluetooth connected", s: 3.98 },
  { id: "fun-ringtone", cat: "funny", zh: "魔性铃声", en: "Chinese ringtone", s: 17.1 },
  { id: "fun-indian", cat: "funny", zh: "印度神曲", en: "Indian song", s: 6.57 },
  { id: "fun-spiderman", cat: "funny", zh: "蜘蛛侠之歌", en: "Spider-Man song", s: 12.4 },
  { id: "fun-laugh", cat: "funny", zh: "笑", en: "Laugh", s: 2.44 },
  { id: "fun-giggle", cat: "funny", zh: "憋不住笑", en: "Can't stop laughing", s: 5.47 },
  { id: "fun-roar", cat: "funny", zh: "哄堂大笑", en: "Everyone laughs", s: 13.01 },
  { id: "fun-pop", cat: "funny", zh: "啵", en: "Pop", s: 0.17 },
  { id: "fun-go", cat: "funny", zh: "快走", en: "Go!", s: 0.73 },
  { id: "shock-gasp", cat: "shock", zh: "震惊", en: "Shocked", s: 1.19 },
  { id: "shock-amongus", cat: "shock", zh: "Among Us 揭晓", en: "Among Us reveal", s: 4.1 },
  { id: "shock-alert", cat: "shock", zh: "被发现了！", en: "Alert!", s: 1.87 },
  { id: "shock-huh", cat: "shock", zh: "疑惑猫", en: "Huh cat", s: 0.3 },
  { id: "shock-wow", cat: "shock", zh: "动漫 哇哦", en: "Anime wow", s: 3.78 },
  { id: "shock-ahh", cat: "shock", zh: "动漫 啊", en: "Anime ahh", s: 0.6 },
  { id: "shock-fahhh", cat: "shock", zh: "FAHHH", en: "FAHHH", s: 1.86 },
  { id: "shock-steps", cat: "shock", zh: "有脚步声！", en: "Footsteps here!", s: 1.79 },
  { id: "shock-yell", cat: "shock", zh: "大喊", en: "Yell", s: 2.34 },
  { id: "fail-spongebob", cat: "fail", zh: "海绵宝宝失败", en: "SpongeBob fail", s: 3.36 },
  { id: "fail-hard", cat: "fail", zh: "我太难了", en: "Life is hard", s: 9.58 },
  { id: "fail-help", cat: "fail", zh: "救我救我救我", en: "Help me!", s: 1.43 },
  { id: "fail-medkit", cat: "fail", zh: "有没有急救包", en: "Anyone got a medkit?", s: 2.18 },
  { id: "fail-damage", cat: "fail", zh: "Emotional damage", en: "Emotional damage", s: 3.24 },
  { id: "fail-mistake", cat: "fail", zh: "That was a mistake", en: "That was a mistake", s: 5.52 },
  { id: "fail-cricket", cat: "fail", zh: "冷场（蟋蟀）", en: "Crickets", s: 3.9 },
  { id: "taunt-thatsit", cat: "taunt", zh: "就这点本事？", en: "That's all you've got?", s: 1.25 },
  { id: "taunt-likeme", cat: "taunt", zh: "你肯定很喜欢我", en: "You must like me", s: 4.13 },
  { id: "taunt-crazy", cat: "taunt", zh: "Are you out of your mind?", en: "Are you out of your mind?", s: 2.86 },
  { id: "taunt-gay", cat: "taunt", zh: "Gay", en: "Gay", s: 4.02 },
  { id: "taunt-bruh", cat: "taunt", zh: "Bruh", en: "Bruh", s: 0.79 },
  { id: "taunt-huh", cat: "taunt", zh: "Huh?", en: "Huh?", s: 0.64 },
  { id: "taunt-nice", cat: "taunt", zh: "Nice", en: "Nice", s: 2.02 },
  { id: "taunt-sick", cat: "taunt", zh: "你有病", en: "You're sick", s: 1.03 },
  { id: "taunt-fisherman", cat: "taunt", zh: "这个人特别渔夫", en: "So fisherman", s: 2.62 },
  { id: "taunt-longge", cat: "taunt", zh: "叫我龙哥就行了", en: "Just call me Brother Long", s: 3.64 },
  { id: "taunt-cards", cat: "taunt", zh: "我要验牌", en: "Let me check the cards", s: 1.12 },
  { id: "taunt-english", cat: "taunt", zh: "一句英文梗", en: "An English line", s: 1.46 },
  { id: "taunt-cantonese", cat: "taunt", zh: "一句粤语梗", en: "A Cantonese line", s: 1.0 },
  { id: "song-tebie", cat: "songs", zh: "特别的爱给特别的你", en: "Special love for special you", s: 14.34 },
  { id: "song-gongxi", cat: "songs", zh: "恭喜发财", en: "Gong xi fa cai", s: 7.2 },
  { id: "song-xuehua", cat: "songs", zh: "雪花飘飘", en: "Snowflakes drifting", s: 7.88 },
  { id: "song-nanwu", cat: "songs", zh: "南无观世音菩萨", en: "Namo Guanyin", s: 11.51 },
  { id: "song-shesobad", cat: "songs", zh: "抖音神曲", en: "TikTok song", s: 20.0 },
  { id: "song-earworm", cat: "songs", zh: "魔性 BGM", en: "Earworm", s: 6.53 },
  { id: "song-foreign", cat: "songs", zh: "外语神曲", en: "Foreign earworm", s: 7.9 },
  { id: "song-tune", cat: "songs", zh: "魔性小调", en: "Silly tune", s: 4.53 },
  { id: "song-didi", cat: "songs", zh: "滴滴滴", en: "Di di di", s: 8.23 },
  { id: "rude-bbq", cat: "rude", zh: "芭比Q了", en: "It's barbecued", s: 12.05 },
  { id: "rude-brother", cat: "rude", zh: "我日你的妈呀，兄弟", en: "Holy hell, brother", s: 2.63 },
  { id: "rude-maihua", cat: "rude", zh: "我打你妈卖花儿", en: "Cantonese curse", s: 1.62 },
  { id: "rude-likeme", cat: "rude", zh: "Can't be like me", en: "Can't be like me", s: 2.24 },
  { id: "rude-wtf", cat: "rude", zh: "What the f***", en: "What the f***", s: 11.55 },
  { id: "rude-omg", cat: "rude", zh: "Oh my god bro", en: "Oh my god bro", s: 9.9 },
  { id: "rude-hub", cat: "rude", zh: "那个片头", en: "That intro", s: 2.92 },
];

export const SFX_TIMES = {
  /** a phone sends one sound per gapMs */
  gapMs: 600,
  /** and the room takes one per takeMs from a phone (a little less: the network bunches presses) */
  takeMs: 500,
  /** the same sound, from anyone, once per roomGapMs (a table all on one button is one) */
  roomGapMs: 1500,
};

/** Where a sound's file is. */
export const sfxUrl = (x: Pick<Sfx, "id">) => `/media/sfx/${x.id}.mp3`;

/** A category's sounds, with their numbers in the room. */
export function sfxOf(cat: SfxCat): { i: number; x: Sfx }[] {
  return SFX.map((x, i) => ({ i, x })).filter((e) => e.x.cat === cat);
}
