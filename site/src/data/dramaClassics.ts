import type { T } from "../i18n";
import type { DramaLevel } from "./drama";

/**
 * 戏精大赏 · 名场面: famous film and TV moments to act out. No culprit and no secret: the
 * audience gives stars, like the acting duel. Two sets, picked by the host: Chinese film and TV
 * (`zh`) and English (`en`); each scene in both languages, so a table of mixed readers plays the
 * same moment.
 *
 * Every scene is described in our own words. The only lines quoted are the famous short ones
 * everyone already knows (the reason the scene is famous); the rest of what anyone says is up to
 * the actor. `see` is a video search, not one clip that can go dead: Bilibili for the Chinese set,
 * YouTube for the English one.
 *
 * `roles` lists the parts the moment can't do without first (`min` of them, default all); the
 * rest join when more people want to act.
 */

export type ClassicSet = "zh" | "en";
export type ClassicRole = {
  name: T;
  /** how to come across: voice, face, hands */
  play: T;
  /** a line to open with (the famous one, where the part has it) */
  first: T;
};
export type ClassicScene = {
  id: string;
  set: ClassicSet;
  level: DramaLevel;
  /** the film or show (its year is `year`), with the other language's title where it helps a search */
  show: T;
  year: number;
  /** the moment */
  title: T;
  /** what happens, in our own words */
  setup: T;
  /** how the scene goes, step by step */
  beats: T[];
  roles: ClassicRole[];
  min?: number;
  /** what to search for to watch the original */
  see: string;
};

const t = (zh: string, en: string): T => ({ zh, en });
const r = (name: T, play: T, first: T): ClassicRole => ({ name, play, first });

export const CLASSICS: ClassicScene[] = [
  /* ---------------------------------------------------------------- Chinese film and TV */
  {
    id: "zh-dahua-ten-thousand-years",
    set: "zh",
    level: "all",
    show: t("大话西游之大圣娶亲", "A Chinese Odyssey Part Two (大话西游)"),
    year: 1995,
    title: t("至尊宝的「一万年」", "Joker's ten-thousand-year vow"),
    setup: t(
      "紫霞仙子的剑抵在至尊宝的喉咙上。至尊宝看着她，说出了那段最有名的告白，一滴眼泪掉了下来。",
      "Zixia's sword is at Joker's throat. He looks at her and delivers the most famous love confession in Chinese film, and a single tear falls.",
    ),
    beats: [
      t("紫霞拔剑指着至尊宝，问他到底爱不爱自己。", "Zixia draws her sword on Joker and demands to know if he loves her."),
      t("至尊宝盯着剑尖，停顿很久，才慢慢开口。", "Joker stares at the blade, pauses for a long time, then slowly begins."),
      t("念那段告白，越念越深情，最后掉一滴眼泪。", "He delivers the confession, more heartfelt with every line, and one tear falls."),
      t("紫霞的剑慢慢放下来。一个人演的话，就对着空气说。", "Zixia slowly lowers the sword. Acting it alone? Say it all to thin air."),
    ],
    roles: [
      r(t("至尊宝", "Joker (Zhizunbao)"), t("开始很怂，盯着剑尖不敢动；说着说着变得特别深情，最后一句拖长音。", "Terrified at first, frozen with the tip at your throat; then, line by line, utterly sincere. Stretch out the last line."), t("「曾经有一份真诚的爱情放在我面前……」", "“Once, a true love was right in front of me…”")),
      r(t("紫霞仙子", "Zixia"), t("又凶又委屈，剑一直指着他，听到最后手开始发抖。", "Fierce and heartbroken at once, the sword steady at his throat, until your hand starts to shake."), t("「你说，你到底爱不爱我？」", "“Tell me. Do you love me or not?”")),
    ],
    min: 1,
    see: "大话西游 一万年 至尊宝 紫霞",
  },
  {
    id: "zh-king-of-comedy-seaside",
    set: "zh",
    level: "all",
    show: t("喜剧之王", "King of Comedy (喜剧之王)"),
    year: 1999,
    title: t("海边的「我养你啊」", "“I'll take care of you!” by the sea"),
    setup: t(
      "天快亮了，柳飘飘要走了。尹天仇追到海边，憋了半天，冲着她的背影大喊了一句。",
      "Dawn is breaking and Liu Piaopiao is leaving. Yin Tianchou chases her to the seafront, works up his courage, and shouts after her.",
    ),
    beats: [
      t("柳飘飘一个人往前走，尹天仇在后面追。", "Piaopiao walks away; Tianchou runs after her."),
      t("两个人隔着一段距离说话，谁都不好意思先开口。", "They talk from a distance, neither willing to say it first."),
      t("尹天仇终于大喊出那句话。", "Tianchou finally shouts the line."),
      t("柳飘飘回过头，又哭又笑地回他一句。", "Piaopiao turns, laughing and crying, and answers him."),
    ],
    roles: [
      r(t("尹天仇", "Yin Tianchou"), t("很穷但很认真，说话结巴，最后一句用尽全身力气喊出来。", "Broke but earnest, stammering, then shouting the last line with everything you've got."), t("「喂！……我养你啊！」", "“Hey! …I'll take care of you!”")),
      r(t("柳飘飘", "Liu Piaopiao"), t("装作不在乎，一直往前走，听到那句话停下来，眼泪憋不住。", "Acting like you don't care, walking away, then stopping dead at his words, fighting back tears."), t("「你先养活你自己吧，傻瓜。」", "“Take care of yourself first, you idiot.”")),
    ],
    see: "喜剧之王 我养你啊",
  },
  {
    id: "zh-infernal-affairs-rooftop",
    set: "zh",
    level: "all",
    show: t("无间道", "Infernal Affairs (无间道)"),
    year: 2002,
    title: t("天台上的「对不起，我是警察」", "“Sorry, I'm a cop” on the rooftop"),
    setup: t(
      "天台上，卧底十年的警察和混进警局的内鬼终于面对面。一个拿枪顶着另一个的头。",
      "On a rooftop, a cop who's spent ten years undercover finally faces the gang's mole inside the police. One has a gun to the other's head.",
    ),
    beats: [
      t("两个人在天台上对峙，谁都不先开口。", "A standoff on the rooftop; neither speaks first."),
      t("内鬼说自己想重新做人。", "The mole says he wants to start over and be a good man."),
      t("卧底冷笑一声，枪顶着对方的头，说出那句话。", "The undercover cop smirks, presses the gun to his head, and says the line."),
      t("两个人对视三秒，定格。", "They hold each other's stare for three seconds. Freeze."),
    ],
    roles: [
      r(t("陈永仁（卧底）", "Chan Wing-yan (the undercover cop)"), t("很冷，很累，说话慢，枪一直不放下。", "Cold and exhausted, speaking slowly, the gun never wavering."), t("「对不起，我是警察。」", "“Sorry. I'm a cop.”")),
      r(t("刘建明（内鬼）", "Lau Kin-ming (the mole)"), t("表面很镇定，眼神在求饶，说到「好人」时声音发抖。", "Calm on the surface, begging with your eyes; your voice shakes on “good man”."), t("「以前我没得选，现在我想做个好人。」", "“I had no choice before. Now I want to be a good man.”")),
    ],
    see: "无间道 天台 对不起我是警察",
  },
  {
    id: "zh-wulin-landlady-regrets",
    set: "zh",
    level: "all",
    show: t("武林外传", "My Own Swordsman (武林外传)"),
    year: 2006,
    title: t("佟掌柜的「我错了」", "Landlady Tong regrets everything"),
    setup: t(
      "客栈又出事了。佟掌柜坐在桌边，用一口陕西话开始她那段最有名的哭诉，伙计们在旁边不知道怎么劝。",
      "Something's gone wrong at the inn again. Landlady Tong sits at a table and launches into her famous lament in a thick country accent, while her staff have no idea how to calm her down.",
    ),
    beats: [
      t("佟掌柜一拍桌子，叹一口长气。", "Landlady Tong slaps the table and lets out an enormous sigh."),
      t("开始哭诉：后悔嫁过来，后悔开客栈，一句比一句惨。", "The lament begins: she regrets marrying into this, regrets the inn, each line sadder than the last."),
      t("伙计们想劝，她越说越来劲。", "The staff try to calm her down; she only gets louder."),
      t("最后一句「额滴神啊」，结束。", "End on her catchphrase, “Oh, my lord!”, in full accent."),
    ],
    roles: [
      r(t("佟湘玉", "Landlady Tong (Tong Xiangyu)"), t("带一点陕西口音，说话拖长音，一边说一边拍大腿。", "Put on a country drawl, stretch every vowel, slap your thigh as you go."), t("「我错了，我真的错了，我从一开始就不应该嫁过来……」", "“I was wrong. So wrong. I never should have married into this family…”")),
      r(t("白展堂", "Bai Zhantang"), t("嬉皮笑脸地劝，越劝越糟，最后自己也想哭。", "Grinning, trying to cheer her up, making it worse, until you're close to tears yourself."), t("「掌柜的，您先别激动……」", "“Boss, boss, just calm down a second…”")),
      r(t("郭芙蓉", "Guo Furong"), t("直来直去，一着急就想动手，被人拉住。", "Blunt and hot-headed, ready to throw a punch, held back by the others."), t("「谁惹掌柜的生气了？站出来！」", "“Who upset the boss? Step forward!”")),
      r(t("吕秀才", "Scholar Lü"), t("书呆子，一开口就讲大道理，谁都听不懂。", "A bookworm who answers everything with philosophy nobody understands."), t("「子曾经曰过，此事须从长计议。」", "“As the sage once said, this calls for careful thought.”")),
    ],
    min: 1,
    see: "武林外传 佟湘玉 我错了",
  },
  {
    id: "zh-gala-selling-crutches",
    set: "zh",
    level: "all",
    show: t("春晚小品《卖拐》", "Selling Crutches (Spring Gala sketch, 卖拐)"),
    year: 2001,
    title: t("「走两步，没病走两步」", "“Take a few steps!”"),
    setup: t(
      "一个大忽悠在路边拦住一个厨师，硬说他的腿有毛病，最后把一副拐卖给了他。忽悠的老伴在旁边帮腔。",
      "A smooth-talking con man stops a cook in the street, convinces him his perfectly good leg is failing, and sells him a pair of crutches. The con man's wife chimes in.",
    ),
    beats: [
      t("大忽悠拦住厨师，盯着他的腿看，一脸担心。", "The con man stops the cook and stares at his leg, looking worried."),
      t("大忽悠让厨师「走两步」，厨师越走越觉得腿不对劲。", "He makes the cook “take a few steps”, and the cook starts to feel something's wrong."),
      t("老伴在旁边帮腔，厨师终于相信自己的腿瘸了。", "The wife backs him up until the cook is convinced he's lame."),
      t("厨师拄着拐，千恩万谢地走了。", "The cook hobbles off on the crutches, thanking them over and over."),
    ],
    roles: [
      r(t("大忽悠", "The con man"), t("笑眯眯的，一副为你好的样子，说话不紧不慢，越说越玄。", "All smiles, as if he only wants to help, unhurried, more mysterious with every line."), t("「走两步，没病走两步！」", "“Take a few steps. If nothing's wrong, take a few steps!”")),
      r(t("厨师", "The cook"), t("开始很自信，越听越慌，走路越来越瘸。", "Confident at first, more panicked with every word, limping worse and worse."), t("「我这腿……好好的啊？」", "“My leg… is perfectly fine, isn't it?”")),
      r(t("忽悠的老伴", "The con man's wife"), t("在旁边一唱一和，表情夸张，时不时偷笑。", "Echoing everything he says, big reactions, sneaking a grin now and then."), t("「哎呀，你看他这腿，越看越不对劲！」", "“Oh my, look at that leg. The more I look, the worse it gets!”")),
    ],
    min: 2,
    see: "卖拐 赵本山 范伟 走两步",
  },
  {
    id: "zh-gala-white-cloud-black-earth",
    set: "zh",
    level: "all",
    show: t("春晚小品《昨天今天明天》", "Yesterday, Today, Tomorrow (Spring Gala sketch, 昨天今天明天)"),
    year: 1999,
    title: t("「我叫白云，我叫黑土」", "“I'm White Cloud.” “I'm Black Earth.”"),
    setup: t(
      "电视访谈节目请来一对农村老两口，主持人想聊聊他们这几十年，老两口却一个比一个能抢话。",
      "A TV talk show invites an old couple from the countryside to talk about their decades together. The host barely gets a word in.",
    ),
    beats: [
      t("主持人介绍嘉宾，老两口抢着自我介绍。", "The host introduces them, and they fight to introduce themselves."),
      t("主持人问他们当年怎么认识的，两个人说的版本完全不一样。", "Asked how they met, they tell completely different versions."),
      t("老太太越说越兴奋，老头一直想插话。", "She gets more excited the more she talks; he keeps trying to cut in."),
      t("最后两个人一起对着镜头说一句。", "To finish, they say one line to the camera together."),
    ],
    roles: [
      r(t("白云（老太太）", "White Cloud (the wife)"), t("嗓门大，爱显摆，一说起过去就停不下来。", "Loud, loves showing off, can't stop once she gets onto the old days."), t("「我叫白云！」", "“My name is White Cloud!”")),
      r(t("黑土（老头）", "Black Earth (the husband)"), t("憨憨的，慢半拍，总被老伴抢话，偶尔冒出一句狠的。", "Slow and simple, a beat behind, always talked over, then out comes one killer line."), t("「我叫黑土。……她是我老伴。」", "“I'm Black Earth. …She's my old lady.”")),
      r(t("主持人", "The host"), t("很专业地想控场，结果完全控制不住。", "Trying so hard to run a professional show, losing control completely."), t("「欢迎二位来到我们的节目，先介绍一下自己？」", "“Welcome to the show, you two! Would you like to introduce yourselves?”")),
    ],
    min: 2,
    see: "昨天今天明天 白云 黑土 小品",
  },
  {
    id: "zh-let-the-bullets-fly",
    set: "zh",
    level: "all",
    show: t("让子弹飞", "Let the Bullets Fly (让子弹飞)"),
    year: 2010,
    title: t("「让子弹飞一会儿」", "“Let the bullets fly a while”"),
    setup: t(
      "土匪头子张麻子带着弟兄埋伏，一枪打出去，什么都没发生。弟兄们急了，他却不慌不忙。",
      "Bandit chief Zhang and his men lie in ambush. He fires one shot, and nothing happens. His men panic; he doesn't.",
    ),
    beats: [
      t("张麻子瞄准，开枪，大家伸长脖子看。", "Zhang takes aim and fires; everyone cranes their necks."),
      t("什么都没发生，老二急得直跳脚。", "Nothing happens. His second-in-command hops with frustration."),
      t("张麻子慢悠悠地说出那句话。", "Zhang slowly says the line."),
      t("过了一会儿，大家才看到结果，一起欢呼，或者傻眼。", "A beat later the result arrives, and everyone cheers, or gapes."),
    ],
    roles: [
      r(t("张麻子", "Zhang Mazi"), t("特别淡定，嘴角带笑，说话很慢，好像一切都在掌握中。", "Utterly calm, a little smile, speaking slowly, as if everything's under control."), t("「让子弹飞一会儿。」", "“Let the bullets fly a while.”")),
      r(t("老二", "Number Two"), t("急性子，抓耳挠腮，追着大哥问个不停。", "Impatient, scratching your head, hounding the boss with questions."), t("「大哥，没打中啊？」", "“Boss, did you miss?”")),
      r(t("师爷", "The counsellor"), t("胆小又精明，一直在算账，一有动静就躲。", "Timid but crafty, always doing sums, ducking at every noise."), t("「这一枪，值多少钱？」", "“How much did that bullet cost us?”")),
    ],
    min: 2,
    see: "让子弹飞 让子弹飞一会儿",
  },
  {
    id: "zh-journey-west-queen",
    set: "zh",
    level: "all",
    show: t("西游记", "Journey to the West (西游记)"),
    year: 1986,
    title: t("女儿国国王留唐僧", "The Queen of the Women's Kingdom"),
    setup: t(
      "女儿国的国王爱上了取经的唐僧，想让他留下来一起治理国家。唐僧心里一动，可西天还得去。徒弟们在旁边干着急。",
      "The Queen of the Women's Kingdom falls for the monk Tang Seng and begs him to stay and rule beside her. He's tempted, but the journey west must go on, and his disciples are getting anxious.",
    ),
    beats: [
      t("国王深情地看着唐僧，请他留下来。", "The queen gazes at Tang Seng and asks him to stay."),
      t("唐僧低着头念经，又忍不住偷看国王一眼。", "He chants with his head down, then can't resist one glance at her."),
      t("孙悟空在旁边催师父快走，猪八戒却想留下。", "The Monkey King urges his master to hurry up and leave; Pigsy would rather stay."),
      t("唐僧含泪告别，国王目送他离开。", "Tang Seng says a tearful goodbye; the queen watches him go."),
    ],
    roles: [
      r(t("女儿国国王", "The Queen"), t("温柔又大胆，眼神一直追着唐僧，说话很慢。", "Gentle but bold, eyes following him everywhere, speaking slowly."), t("「御弟哥哥，留下来好不好？」", "“Dear brother monk, won't you stay?”")),
      r(t("唐僧", "Tang Seng"), t("双手合十，一直念「阿弥陀佛」，脸却越来越红。", "Palms pressed together, murmuring prayers, face getting redder and redder."), t("「阿弥陀佛……贫僧还要去西天取经。」", "“Amitabha… I must continue to the West.”")),
      r(t("孙悟空", "The Monkey King"), t("抓耳挠腮，跳来跳去，一直催师父走。", "Scratching, hopping about, nagging your master to leave."), t("「师父！咱们该上路啦！」", "“Master! Time to hit the road!”")),
      r(t("猪八戒", "Pigsy"), t("看哪儿都喜欢，一直想找借口留下来。", "Loving everything in sight, inventing excuses to stay."), t("「师父，要不……咱们多住几天？」", "“Master, how about… we stay a few more days?”")),
    ],
    min: 2,
    see: "西游记 女儿国 御弟哥哥",
  },
  {
    id: "zh-white-snake-umbrella",
    set: "zh",
    level: "all",
    show: t("新白娘子传奇", "New Legend of Madame White Snake (新白娘子传奇)"),
    year: 1992,
    title: t("西湖借伞", "The umbrella at West Lake"),
    setup: t(
      "西湖边下起了雨，白素贞和小青躲雨的时候，书生许仙把自己的伞借给了她们。一段姻缘就这么开始了。",
      "Rain falls on West Lake. As Bai Suzhen and her sister Xiaoqing take shelter, a young scholar, Xu Xian, lends them his umbrella. A love story begins.",
    ),
    beats: [
      t("雨下起来了，白素贞和小青躲在屋檐下。", "The rain starts; Bai Suzhen and Xiaoqing shelter under the eaves."),
      t("许仙打着伞走过来，犹豫了一下，把伞递过去。", "Xu Xian walks up with his umbrella, hesitates, and offers it."),
      t("白素贞问他的名字，小青在旁边偷笑。", "Bai Suzhen asks his name while Xiaoqing giggles."),
      t("许仙淋着雨跑开，白素贞望着他的背影。", "Xu Xian runs off into the rain; she watches him go."),
    ],
    roles: [
      r(t("白素贞", "Bai Suzhen"), t("温柔端庄，说话轻声细语，看许仙时害羞地笑。", "Graceful and gentle, soft-spoken, smiling shyly whenever you look at him."), t("「请问公子尊姓大名？」", "“May I ask your name, sir?”")),
      r(t("许仙", "Xu Xian"), t("老实书生，说话结巴，递伞的手一直抖。", "An honest, bashful scholar who stammers, hand trembling as you offer the umbrella."), t("「两位姑娘，这把伞……借给你们。」", "“Ladies, please… take my umbrella.”")),
      r(t("小青", "Xiaoqing"), t("活泼调皮，一直在旁边偷笑，推姐姐上前。", "Lively and mischievous, giggling, nudging her sister forward."), t("「姐姐，这个书生好像很喜欢你哦。」", "“Sister, I think this scholar likes you.”")),
    ],
    min: 2,
    see: "新白娘子传奇 西湖借伞",
  },
  {
    id: "zh-drawing-sword-cannon",
    set: "zh",
    level: "all",
    show: t("亮剑", "Drawing Sword (亮剑)"),
    year: 2005,
    title: t("「二营长，意大利炮呢？」", "“Where's my Italian cannon?”"),
    setup: t(
      "团长李云龙要拿下眼前的据点，火冒三丈地喊二营长把意大利炮拉上来。政委在旁边劝他冷静。",
      "Regiment commander Li Yunlong needs to take the fortified position ahead, and roars for his battalion commander to haul up the Italian cannon. The political commissar begs him to calm down.",
    ),
    beats: [
      t("李云龙举着望远镜看了半天，越看越火。", "Li Yunlong stares through his binoculars, angrier by the second."),
      t("他转过身，冲着二营长大喊那句话。", "He spins round and bellows the line at his battalion commander."),
      t("二营长手忙脚乱地「拉炮」，政委在旁边劝。", "The commander scrambles to “haul” the cannon while the commissar pleads for calm."),
      t("一声「开炮」，大家一起用嘴配出炮声。", "“Fire!” Everyone does the cannon blast, sound effects by mouth."),
    ],
    roles: [
      r(t("李云龙", "Li Yunlong"), t("嗓门极大，脾气火爆，一边吼一边挥手。", "A huge voice and a short fuse, waving your arms as you shout."), t("「二营长！意大利炮呢？给我拉上来！」", "“Battalion Two! Where's my Italian cannon? Haul it up here!”")),
      r(t("二营长", "The battalion commander"), t("被吼得一哆嗦，立正答「是」，然后手忙脚乱。", "Flinching at every shout, snapping to attention with “Yes, sir!”, then all thumbs."), t("「是！马上拉上来！」", "“Yes, sir! Right away, sir!”")),
      r(t("政委", "The commissar"), t("斯文冷静，一直想讲道理，每次都被打断。", "Calm and refined, always trying to reason, interrupted every time."), t("「老李，你冷静一点，咱们从长计议……」", "“Old Li, calm down. Let's think this through…”")),
      r(t("警卫员", "The bodyguard"), t("憨厚忠心，团长说什么都喊「好」，帮着推炮。", "Loyal and simple, shouting “Yes!” to everything the commander says, helping push the cannon."), t("「团长，炮来了！」", "“Commander, the cannon's here!”")),
    ],
    min: 2,
    see: "亮剑 二营长 意大利炮",
  },
  {
    id: "zh-flirting-scholar-couplets",
    set: "zh",
    level: "all",
    show: t("唐伯虎点秋香", "Flirting Scholar (唐伯虎点秋香)"),
    year: 1993,
    title: t("对穿肠斗对子", "The couplet duel"),
    setup: t(
      "号称对对子天下第一的对穿肠来挑战大才子唐伯虎。一个出上联，一个对下联，越对越快，越对越狠。",
      "The self-proclaimed couplet champion of the land challenges the great scholar Tang Bohu. One gives the first line, the other must match it, faster and sharper every round.",
    ),
    beats: [
      t("对穿肠摇着扇子出场，嚣张地出第一个上联。", "The champion swaggers in, fanning himself, and fires off the first line."),
      t("唐伯虎不慌不忙，对出下联。对子可以自己编，不押韵也没关系。", "Tang Bohu, unbothered, matches it. Make up your own lines; they don't need to rhyme."),
      t("两个人越对越快，围观的人跟着起哄。", "Faster and faster; the onlookers cheer."),
      t("对穿肠被对得说不出话，一口气没上来。", "The champion is left speechless and can't catch his breath."),
    ],
    roles: [
      r(t("唐伯虎", "Tang Bohu"), t("潇洒自信，摇着扇子，对得越快越得意。", "Suave and smug, fanning yourself, more pleased with every comeback."), t("「对对子？在下奉陪到底。」", "“A couplet duel? I'm at your service.”")),
      r(t("对穿肠", "The couplet champion"), t("嚣张傲慢，下巴抬得很高，被对住了就脸色发青。", "Arrogant, chin in the air, turning green whenever you're matched."), t("「天下对对子，我对穿肠第一！」", "“In couplets, nobody beats me!”")),
      r(t("宁王", "Prince Ning"), t("坐在一边看热闹，谁占上风就给谁鼓掌。", "Watching from the side, applauding whoever's winning."), t("「好！再来一个！」", "“Bravo! Another!”")),
    ],
    min: 2,
    see: "唐伯虎点秋香 对穿肠",
  },
  {
    id: "zh-empresses-plum-garden",
    set: "zh",
    level: "all",
    show: t("甄嬛传", "Empresses in the Palace (甄嬛传)"),
    year: 2011,
    title: t("倚梅园许愿", "The wish in the plum garden"),
    setup: t(
      "除夕夜，甄嬛在倚梅园的梅树下许愿，念了一句诗。路过的皇上听见了，问她是谁。甄嬛不想暴露身份，躲了起来。",
      "On New Year's Eve, Zhen Huan makes a wish beneath a plum tree in the palace garden and recites a line of poetry. The emperor, passing by, hears her and asks who's there. Not wanting to be recognized, she hides.",
    ),
    beats: [
      t("甄嬛对着梅树双手合十，轻声许愿，念一句诗。", "Zhen Huan clasps her hands before the plum tree, whispers a wish, and recites a line."),
      t("皇上从暗处走出来，问「是谁在那里」。", "The emperor steps out of the shadows: “Who's there?”"),
      t("甄嬛背过身，装成宫女，想办法脱身。", "She turns away, pretends to be a maid, and tries to slip off."),
      t("皇上想留住她，她还是溜走了。", "He tries to make her stay, but she escapes."),
    ],
    roles: [
      r(t("甄嬛", "Zhen Huan"), t("端庄又机灵，说话轻轻的，被发现时又慌又要装镇定。", "Poised and quick-witted, softly spoken, flustered but faking calm once discovered."), t("「逆风如解意，容易莫摧残。」", "“If the wind only understood, it would not be so cruel.”")),
      r(t("皇上", "The emperor"), t("很威严，声音低沉，越听越好奇，忍不住往前走。", "Commanding, deep voice, more curious with every word, drifting closer."), t("「是谁在那里？」", "“Who's there?”")),
      r(t("流朱（侍女）", "Liuzhu (her maid)"), t("急得团团转，一直拉小姐走。", "Frantic, tugging at your mistress to leave."), t("「小主，快走，有人来了！」", "“My lady, quick, someone's coming!”")),
    ],
    min: 2,
    see: "甄嬛传 倚梅园 逆风如解意",
  },
  {
    id: "zh-romance-rain-open-the-door",
    set: "zh",
    level: "all",
    show: t("情深深雨濛濛", "Romance in the Rain (情深深雨濛濛)"),
    year: 2001,
    title: t("雪姨敲门：「开门啊！」", "Auntie Xue at the door"),
    setup: t(
      "雪姨气势汹汹地来到傅文佩家，拼命拍门。屋里的傅文佩和依萍一个害怕，一个生气，就是不开门。",
      "Auntie Xue storms up to Fu Wenpei's house and pounds on the door. Inside, Wenpei is frightened and her daughter Yiping is furious, and neither will open it.",
    ),
    beats: [
      t("雪姨在门外拍门，一声比一声大。", "Auntie Xue bangs on the door, louder and louder."),
      t("屋里的两个人小声商量：开还是不开。", "Inside, the two whisper: open it or not?"),
      t("雪姨越喊越难听，依萍忍不住回嘴。", "Her shouting gets nastier, and Yiping can't help shouting back."),
      t("门最后开了，几个人面对面。或者就是不开。", "Finally the door opens and they face off. Or it stays shut."),
    ],
    roles: [
      r(t("雪姨", "Auntie Xue"), t("叉着腰，嗓门尖，拍门拍得手疼也不停。", "Hands on hips, shrill voice, pounding the door until your hand hurts."), t("「开门啊！开门啊！我知道你在家！」", "“Open the door! Open up! I know you're in there!”")),
      r(t("依萍", "Yiping"), t("倔强，咬着牙，忍到最后冲门外喊回去。", "Stubborn, jaw clenched, holding back until you finally shout through the door."), t("「你喊吧，我们就是不开！」", "“Shout all you want. We're not opening it!”")),
      r(t("傅文佩", "Fu Wenpei"), t("胆小温柔，抱着女儿发抖，一直劝她别出声。", "Timid and gentle, trembling, hugging your daughter, begging her to stay quiet."), t("「依萍，别出声，她一会儿就走了……」", "“Yiping, don't make a sound. She'll leave soon…”")),
      r(t("陆振华", "Commander Lu"), t("最后才到，威风凛凛，一开口大家都安静。", "Arriving last, an imposing presence; when you speak, everyone goes quiet."), t("「都给我住口！」", "“Silence, all of you!”")),
    ],
    min: 2,
    see: "情深深雨濛濛 雪姨 开门",
  },
  {
    id: "zh-wandering-earth-safety-first",
    set: "zh",
    level: "all",
    show: t("流浪地球", "The Wandering Earth (流浪地球)"),
    year: 2019,
    title: t("「道路千万条，安全第一条」", "“On every road, safety first”"),
    setup: t(
      "刘启偷开一辆运输车，带着妹妹冲出地下城。车里的语音提示却一遍又一遍地念交通安全标语。",
      "Liu Qi has stolen a transport truck and is racing his sister out of the underground city. The truck's voice assistant keeps reciting its road-safety slogan, over and over.",
    ),
    beats: [
      t("刘启发动车子，车载语音一本正经地开始念标语。", "Liu Qi starts the truck, and the voice assistant earnestly recites the slogan."),
      t("刘启猛踩油门，语音又念了一遍。", "He floors it; the voice says it again."),
      t("妹妹在旁边吐槽，语音念得越来越起劲。", "His sister heckles from the passenger seat; the voice only gets more enthusiastic."),
      t("最后大家一起把标语喊一遍。", "To finish, everyone shouts the slogan together."),
    ],
    roles: [
      r(t("车载语音", "The truck's voice"), t("像机器人一样，一个字一个字地念，越念越认真。", "Flat and robotic, word by word, more earnest every time."), t("「北京第三区交通委提醒您：道路千万条，安全第一条。」", "“Beijing Sector Three traffic authority reminds you: on every road, safety first.”")),
      r(t("刘启", "Liu Qi"), t("年轻气盛，开车很猛，被语音烦得直翻白眼。", "Young and reckless, driving hard, rolling your eyes at the voice."), t("「坐稳了，我们走！」", "“Hold on tight. Here we go!”")),
      r(t("韩朵朵", "Duoduo (his sister)"), t("又害怕又兴奋，一边尖叫一边吐槽。", "Scared and thrilled, shrieking and heckling at the same time."), t("「你到底会不会开车啊！」", "“Do you even know how to drive?!”")),
    ],
    min: 2,
    see: "流浪地球 道路千万条 安全第一条",
  },

  /* ---------------------------------------------------------------- English film and TV */
  {
    id: "en-titanic-flying",
    set: "en",
    level: "all",
    show: t("泰坦尼克号（Titanic）", "Titanic"),
    year: 1997,
    title: t("船头「我在飞」", "“I'm flying” at the bow"),
    setup: t(
      "夕阳下，杰克带着露丝来到船头，让她闭上眼睛、张开双臂。露丝睁开眼，觉得自己在飞。",
      "At sunset, Jack leads Rose to the bow of the ship and tells her to close her eyes and spread her arms. When she opens them, she feels like she's flying.",
    ),
    beats: [
      t("杰克牵着露丝走到船头，让她闭上眼睛。", "Jack leads Rose to the bow and tells her to close her eyes."),
      t("杰克扶着她站上栏杆，她慢慢张开双臂。", "He helps her up onto the rail; she slowly spreads her arms."),
      t("露丝睁开眼睛，喊出那句话。", "Rose opens her eyes and says the line."),
      t("两个人迎着风，定格三秒，背景音乐可以自己哼。", "They lean into the wind and hold it for three seconds. Hum your own soundtrack."),
    ],
    roles: [
      r(t("杰克", "Jack"), t("自信又温柔，站在她身后，说话轻轻的。", "Confident and gentle, standing behind her, speaking softly."), t("「相信我吗？」", "“Do you trust me?”")),
      r(t("露丝", "Rose"), t("开始有点紧张，睁开眼那一刻笑得特别灿烂，双臂张开。", "Nervous at first; the moment you open your eyes, a huge smile and arms wide open."), t("「杰克，我在飞！」", "“I'm flying, Jack!”")),
    ],
    see: "Titanic I'm flying scene",
  },
  {
    id: "en-empire-your-father",
    set: "en",
    level: "all",
    show: t("星球大战：帝国反击战（The Empire Strikes Back）", "The Empire Strikes Back"),
    year: 1980,
    title: t("「我是你父亲」", "“I am your father”"),
    setup: t(
      "云城的高台上，黑武士逼近受伤的卢克，说出了一个惊天秘密。卢克不敢相信。",
      "On a gantry high above Cloud City, Darth Vader corners the wounded Luke and reveals a shocking secret. Luke refuses to believe it.",
    ),
    beats: [
      t("黑武士一步步逼近，呼吸声又重又慢。", "Vader closes in, step by step, breathing heavily."),
      t("卢克退到边上，抓着栏杆不肯投降。", "Luke backs to the edge, clinging to the rail, refusing to give in."),
      t("黑武士说出那句话。", "Vader says the line."),
      t("卢克崩溃大喊，然后纵身一跳，或者定格。", "Luke screams in denial, then leaps. Or freeze."),
    ],
    roles: [
      r(t("黑武士", "Darth Vader"), t("每句话前先「呼——哈——」喘一下，声音低沉，伸出一只手。", "Breathe in and out heavily before every line, deep voice, one hand reaching out."), t("「不，我是你父亲。」", "“No. I am your father.”")),
      r(t("卢克", "Luke"), t("受了伤又很倔强，听到真相时整个人崩溃。", "Hurt and defiant, completely shattered when you hear the truth."), t("「不！这不是真的！不可能！」", "“No! That's not true! That's impossible!”")),
    ],
    see: "Empire Strikes Back I am your father scene",
  },
  {
    id: "en-friends-pivot",
    set: "en",
    level: "all",
    show: t("老友记（Friends）", "Friends"),
    year: 1999,
    title: t("「转！转！」搬沙发", "“Pivot!”"),
    setup: t(
      "罗斯买了一张新沙发，拉着钱德勒和瑞秋一起把它搬上窄窄的楼梯。沙发卡住了，罗斯一直喊同一个词。",
      "Ross has bought a new couch and drags Chandler and Rachel into carrying it up a narrow staircase. It gets stuck, and Ross keeps shouting the same word.",
    ),
    beats: [
      t("大家抬着「沙发」走到楼梯口，罗斯开始指挥。", "Everyone carries the “couch” to the stairs; Ross starts directing."),
      t("沙发卡住了，罗斯大喊「转！」，越喊越大声。", "It jams. Ross yells “Pivot!”, louder each time."),
      t("钱德勒受不了了，冲罗斯吼回去。", "Chandler snaps and yells back."),
      t("沙发最后……断成了两半，或者就卡在那儿。", "The couch finally… ends up in two pieces. Or stays stuck."),
    ],
    roles: [
      r(t("罗斯", "Ross"), t("越来越激动，挥着手指挥，每喊一次「转」声音都更高。", "More and more worked up, conducting with your hands, each “Pivot!” higher than the last."), t("「转！转！转啊！」", "“Pivot! Pivot! PIVOT!”")),
      r(t("钱德勒", "Chandler"), t("一直在抱怨，最后忍无可忍地大吼。", "Grumbling the whole time, until you finally explode."), t("「闭嘴！闭嘴！闭嘴！」", "“Shut up! Shut up! Shut up!”")),
      r(t("瑞秋", "Rachel"), t("抬得很吃力，一脸茫然，不知道该往哪边转。", "Straining under the weight, totally lost about which way to turn."), t("「往哪边转？你倒是说清楚啊！」", "“Pivot which way? Be specific!”")),
    ],
    min: 2,
    see: "Friends pivot couch scene",
  },
  {
    id: "en-few-good-men-truth",
    set: "en",
    level: "all",
    show: t("义海雄风（A Few Good Men）", "A Few Good Men"),
    year: 1992,
    title: t("「你承受不了真相！」", "“You can't handle the truth!”"),
    setup: t(
      "军事法庭上，年轻的律师卡菲步步紧逼，非要上校说出真相。上校终于爆发了。",
      "In a military courtroom, young lawyer Kaffee pushes and pushes until the colonel on the stand finally explodes.",
    ),
    beats: [
      t("卡菲站在证人席前，一个问题接一个问题地逼问。", "Kaffee stands before the witness box, firing question after question."),
      t("上校一开始很冷静，越来越不耐烦。", "The colonel starts out cool and grows more and more irritated."),
      t("卡菲大喊「我要真相！」，上校拍案而起。", "Kaffee shouts “I want the truth!”, and the colonel leaps to his feet."),
      t("法官敲槌，全场安静。没人演法官的话，大家一起「咚」一声。", "The judge bangs the gavel; silence. No judge? Everyone goes “bang”."),
    ],
    roles: [
      r(t("杰塞普上校", "Colonel Jessep"), t("开始高高在上，冷笑；被逼急了，青筋暴起地吼出来。", "Superior and sneering at first; pushed too far, veins popping, you roar."), t("「你承受不了真相！」", "“You can't handle the truth!”")),
      r(t("卡菲中尉", "Lieutenant Kaffee"), t("年轻气盛，越问越快，最后一句吼出来。", "Young and fired up, asking faster and faster, shouting the last line."), t("「我要知道真相！」", "“I want the truth!”")),
      r(t("法官", "The judge"), t("一脸严肃，时不时敲一下槌，喊「肃静」。", "Stern, banging the gavel now and then."), t("「肃静！肃静！」", "“Order! Order in the court!”")),
    ],
    min: 2,
    see: "A Few Good Men you can't handle the truth scene",
  },
  {
    id: "en-jerry-maguire-money",
    set: "en",
    level: "all",
    show: t("甜心先生（Jerry Maguire）", "Jerry Maguire"),
    year: 1996,
    title: t("「给我看钱！」", "“Show me the money!”"),
    setup: t(
      "体育经纪人杰瑞打电话求球员罗德留下来。罗德只有一个条件：让杰瑞对着电话大喊那句话。",
      "Sports agent Jerry calls his last client, Rod, begging him to stay. Rod has one condition: Jerry has to scream a certain phrase down the phone.",
    ),
    beats: [
      t("杰瑞拿着电话，低声下气地求罗德。", "Jerry, phone in hand, begs Rod to stay."),
      t("罗德一边跳舞一边要杰瑞大声喊。", "Rod dances around demanding Jerry say it louder."),
      t("杰瑞越喊越大声，越喊越投入。", "Jerry yells it louder and louder, really getting into it."),
      t("两个人一起对着电话狂喊，最后都笑了。", "They both scream it down the phone, then crack up."),
    ],
    roles: [
      r(t("罗德", "Rod Tidwell"), t("跳来跳去，特别嗨，一直喊「大声点！」", "Dancing around, hyped up, constantly shouting “Louder!”"), t("「给我看钱！大声点！」", "“Show me the money! Louder!”")),
      r(t("杰瑞", "Jerry"), t("开始很尴尬，小声说；后来豁出去了，喊得比谁都响。", "Mortified at first, mumbling; then you let go and shout louder than anyone."), t("「好吧……给你看钱……」", "“Fine… show you the money…”")),
    ],
    see: "Jerry Maguire show me the money scene",
  },
  {
    id: "en-forrest-gump-run",
    set: "en",
    level: "all",
    show: t("阿甘正传（Forrest Gump）", "Forrest Gump"),
    year: 1994,
    title: t("「快跑，阿甘，快跑！」", "“Run, Forrest, run!”"),
    setup: t(
      "几个坏孩子追打腿上绑着支架的小阿甘，好朋友珍妮大喊让他快跑。阿甘跑着跑着，支架散了，他越跑越快。",
      "Bullies chase young Forrest, his legs in braces. His friend Jenny screams at him to run. As he runs, the braces fly apart and he goes faster and faster.",
    ),
    beats: [
      t("坏孩子骑着「自行车」追过来，阿甘吓得不敢动。", "The bullies ride up on their “bikes”; Forrest freezes."),
      t("珍妮大喊那句话。", "Jenny yells the line."),
      t("阿甘一瘸一拐地跑，支架一块块掉下来。", "Forrest hobbles off, the braces falling apart piece by piece."),
      t("阿甘越跑越快，所有人都看呆了。原地跑就行。", "He runs faster and faster while everyone stares. Running on the spot is fine."),
    ],
    roles: [
      r(t("阿甘", "Forrest"), t("憨厚，眼神单纯，开始跑得很笨拙，最后跑得飞快。", "Sweet and simple, running awkwardly at first, then flying."), t("「珍妮……我该怎么办？」", "“Jenny… what do I do?”")),
      r(t("珍妮", "Jenny"), t("急得跺脚，双手拢在嘴边大喊。", "Stamping with worry, hands cupped around your mouth, shouting."), t("「快跑，阿甘！快跑！」", "“Run, Forrest! Run!”")),
      r(t("坏孩子", "The bully"), t("一脸坏笑，假装骑车追，嘴里喊「抓住他」。", "Nasty grin, “riding” after him, yelling “Get him!”"), t("「抓住他！」", "“Get him!”")),
    ],
    min: 2,
    see: "Forrest Gump run Forrest run scene",
  },
  {
    id: "en-home-alone-disappear",
    set: "en",
    level: "all",
    show: t("小鬼当家（Home Alone）", "Home Alone"),
    year: 1990,
    title: t("「我把家人变没了！」", "“I made my family disappear!”"),
    setup: t(
      "凯文一觉醒来，发现全家人都去旅行了，偏偏把他忘在家里。他先是害怕，然后高兴得疯了。",
      "Kevin wakes up to find his whole family has left on their trip, and forgotten him. First he's scared; then he goes wild with joy.",
    ),
    beats: [
      t("凯文揉着眼睛下楼，喊爸爸妈妈，没人答应。", "Kevin comes downstairs rubbing his eyes, calling for Mom and Dad. No answer."),
      t("凯文找遍整个房子，慢慢明白过来。", "He searches the whole house and slowly realizes."),
      t("凯文高兴地喊出那句话，开始乱蹦乱跳。", "He shouts the line in delight and starts jumping around."),
      t("对着镜子拍须后水，疼得双手捂脸大叫。", "He slaps on his dad's aftershave in the mirror, and screams, hands on his cheeks."),
    ],
    roles: [
      r(t("凯文", "Kevin"), t("从害怕到狂喜，表情越夸张越好，最后那声尖叫要捂着脸。", "From scared to ecstatic, the bigger the faces the better; do the final scream with your hands on your cheeks."), t("「我把家人变没了！」", "“I made my family disappear!”")),
    ],
    see: "Home Alone I made my family disappear scene",
  },
  {
    id: "en-lion-king-pride-rock",
    set: "en",
    level: "all",
    show: t("狮子王（The Lion King）", "The Lion King"),
    year: 1994,
    title: t("荣耀石上举起辛巴", "Simba is presented at Pride Rock"),
    setup: t(
      "清晨，所有动物聚到荣耀石下。狒狒拉飞奇走到高处，把刚出生的小狮子举过头顶。国王和王后在旁边骄傲地看着。",
      "At dawn the animals gather beneath Pride Rock. Rafiki the baboon climbs to the edge and lifts the newborn cub high above his head, while the king and queen look on with pride.",
    ),
    beats: [
      t("拉飞奇摇着手杖走上「荣耀石」，一张椅子就行。", "Rafiki shakes his staff and climbs “Pride Rock”. A chair will do."),
      t("国王和王后把小狮子交给他，抱一个靠枕当小狮子。", "The king and queen hand him the cub. A cushion makes a fine cub."),
      t("拉飞奇慢慢把小狮子举过头顶，所有人一起欢呼。", "He slowly lifts it high above his head, and everyone cheers."),
      t("动物们一起鞠躬，定格。", "All the animals bow. Freeze."),
    ],
    roles: [
      r(t("拉飞奇", "Rafiki"), t("神神叨叨，摇头晃脑，举小狮子时一脸庄严。", "Eccentric, bobbing and chuckling, then deadly solemn as you lift the cub."), t("「哈哈！就是今天！」", "“Ha ha! Today is the day!”")),
      r(t("木法沙（国王）", "Mufasa"), t("威严慈祥，站得很稳，声音低沉。", "Majestic and kind, rooted to the spot, deep voice."), t("「拉飞奇，这是我的儿子。」", "“Rafiki, this is my son.”")),
      r(t("沙拉碧（王后）", "Sarabi"), t("温柔骄傲，一直看着小狮子笑。", "Gentle and proud, smiling at the cub the whole time."), t("「他会是一个好国王的。」", "“He'll make a wonderful king.”")),
      r(t("动物们", "The animals"), t("跪下、鞠躬、欢呼，演什么动物都行：大象、长颈鹿、斑马。", "Kneel, bow and cheer as any animal you like: elephant, giraffe, zebra."), t("「（大象叫）呜——！」", "“(elephant trumpet) Pawooo!”")),
    ],
    min: 1,
    see: "Lion King Circle of Life Simba presented scene",
  },
  {
    id: "en-mean-girls-pink",
    set: "en",
    level: "all",
    show: t("贱女孩（Mean Girls）", "Mean Girls"),
    year: 2004,
    title: t("「星期三我们穿粉色」", "“On Wednesdays we wear pink”"),
    setup: t(
      "新来的转学生凯蒂第一次坐到学校最红的小团体的午餐桌，被她们的各种规矩搞晕了。",
      "New girl Cady sits at the Plastics' lunch table for the first time and gets a crash course in their rules.",
    ),
    beats: [
      t("蕾吉娜示意凯蒂坐下，上下打量她。", "Regina waves Cady to a seat and looks her up and down."),
      t("格雷琴一条一条宣布小团体的规矩。", "Gretchen announces the group's rules, one by one."),
      t("有人说了一句没头没脑的话，大家沉默。", "Someone says something completely clueless; silence."),
      t("蕾吉娜宣布：凯蒂可以加入了，不过有一个条件。", "Regina announces that Cady can join, on one condition."),
    ],
    roles: [
      r(t("蕾吉娜", "Regina"), t("高高在上，笑容甜但眼神冷，说话不紧不慢。", "Queen bee: sweet smile, icy eyes, never in a hurry."), t("「坐吧。我们先问你几个问题。」", "“Sit. We're going to ask you some questions.”")),
      r(t("格雷琴", "Gretchen"), t("紧张兮兮，急着讨好老大，说话又快又尖。", "Anxious to please the boss, talking fast and high."), t("「星期三我们穿粉色！」", "“On Wednesdays we wear pink!”")),
      r(t("凯蒂", "Cady"), t("一脸懵，一直点头，偷偷观察每个人。", "Totally lost, nodding along, quietly studying everyone."), t("「呃……星期三穿粉色？好的。」", "“Um… pink on Wednesdays. Got it.”")),
      r(t("凯伦", "Karen"), t("天真得过头，说话慢半拍，一脸认真。", "Sweetly clueless, a beat behind, completely serious."), t("「我能感觉到要下雨了……大概吧。」", "“I can always tell when it's going to rain. Probably.”")),
    ],
    min: 3,
    see: "Mean Girls on Wednesdays we wear pink scene",
  },
  {
    id: "en-harry-potter-wizard",
    set: "en",
    level: "all",
    show: t("哈利·波特与魔法石（Harry Potter）", "Harry Potter and the Philosopher's Stone"),
    year: 2001,
    title: t("「你是个巫师，哈利」", "“You're a wizard, Harry”"),
    setup: t(
      "暴风雨夜，海边小屋的门被撞开，巨人海格走进来，告诉哈利一个他从来不知道的秘密。弗农姨父想拦也拦不住。",
      "On a stormy night the door of the seaside hut crashes open. The giant Hagrid strides in and tells Harry something he never knew about himself. Uncle Vernon can't stop him.",
    ),
    beats: [
      t("门被撞开，海格弯着腰走进来，大家吓一跳。", "The door bursts open; Hagrid ducks inside and everyone jumps."),
      t("海格送上生日蛋糕，弗农姨父冲上来阻止。", "Hagrid hands Harry a birthday cake; Uncle Vernon charges in to stop him."),
      t("海格说出那句话，哈利愣住了。", "Hagrid says the line; Harry is stunned."),
      t("达力偷吃蛋糕，被海格「施法」长出一条猪尾巴。", "Dudley sneaks some cake, and Hagrid gives him a pig's tail with a flick."),
    ],
    roles: [
      r(t("海格", "Hagrid"), t("大嗓门，动作很大，温柔又笨拙。", "Booming voice, big movements, gentle and clumsy."), t("「你是个巫师，哈利。」", "“You're a wizard, Harry.”")),
      r(t("哈利", "Harry"), t("瘦小，惊讶，眼睛瞪得大大的，不敢相信。", "Small, astonished, eyes huge, can't believe it."), t("「我是个……什么？」", "“I'm a… what?”")),
      r(t("弗农姨父", "Uncle Vernon"), t("气得满脸通红，挥着拳头，又怕又凶。", "Red-faced with rage, shaking a fist, terrified and blustering."), t("「我不许你跟他说！」", "“I forbid you to tell him!”")),
      r(t("达力", "Dudley"), t("贪吃，一直盯着蛋糕，被施法后捂着屁股尖叫。", "Greedy, eyes on the cake, clutching your backside and squealing after the spell."), t("「蛋糕……我能吃一块吗？」", "“Cake… can I have some?”")),
    ],
    min: 2,
    see: "Harry Potter you're a wizard Harry scene",
  },
  {
    id: "en-love-actually-cards",
    set: "en",
    level: "all",
    show: t("真爱至上（Love Actually）", "Love Actually"),
    year: 2003,
    title: t("门口的告白卡片", "The cue cards at the door"),
    setup: t(
      "圣诞夜，马克敲开朱丽叶家的门，一句话都不说，一张一张翻手里的卡片，把藏了很久的心意告诉她。",
      "On Christmas Eve, Mark knocks on Juliet's door. Without saying a word, he flips through a stack of cue cards, telling her what he's kept hidden for so long.",
    ),
    beats: [
      t("马克敲门，朱丽叶开门，马克竖起手指示意「嘘」。", "Mark knocks; Juliet opens; he holds a finger to his lips."),
      t("马克一张一张翻「卡片」，用手比划，或者真的写几张。", "He flips the “cards” one by one. Mime them, or actually write a few."),
      t("朱丽叶越看越感动，捂住了嘴。", "Juliet's hand goes to her mouth as she reads."),
      t("马克转身走开，朱丽叶追了出来……", "Mark turns to go, and Juliet runs after him…"),
    ],
    roles: [
      r(t("马克", "Mark"), t("全程不说话，表情认真又害羞，卡片翻得很慢。", "Not a single word; earnest and shy; flip each card slowly."), t("（举起第一张卡片：请帮我打个掩护）", "(Hold up the first card: “Just play along.”)")),
      r(t("朱丽叶", "Juliet"), t("开门时很惊讶，看卡片时一点点被感动，最后忍不住追出去。", "Surprised at the door, moved little by little as you read, then you can't help running after him."), t("「谁呀？……马克？」", "“Who is it? …Mark?”")),
    ],
    see: "Love Actually cue cards scene",
  },
  {
    id: "en-back-to-the-future-gigawatts",
    set: "en",
    level: "all",
    show: t("回到未来（Back to the Future）", "Back to the Future"),
    year: 1985,
    title: t("「一点二一吉瓦！」", "“1.21 gigawatts!”"),
    setup: t(
      "布朗博士算出时光车需要多少电，吓得在实验室里大叫。马蒂完全听不懂，只想知道怎么回去。",
      "Doc Brown works out how much power the time machine needs and shrieks in horror. Marty has no idea what he's talking about and just wants to get home.",
    ),
    beats: [
      t("博士在黑板前算数，越算越激动。", "Doc scribbles calculations on a blackboard, more and more agitated."),
      t("算出结果，博士抓着头发大喊。", "The answer: Doc grabs his hair and screams."),
      t("马蒂一头雾水，问「吉瓦是什么」。", "Marty, baffled, asks what a gigawatt is."),
      t("两个人一起想到了用闪电的办法，定格。", "Together they hit on the lightning idea. Freeze."),
    ],
    roles: [
      r(t("布朗博士", "Doc Brown"), t("头发乱糟糟，眼睛瞪得溜圆，说话一惊一乍。", "Wild hair, bulging eyes, every line a startled exclamation."), t("「一点二一吉瓦！老天爷！」", "“1.21 gigawatts! Great Scott!”")),
      r(t("马蒂", "Marty"), t("又急又懵，一直挠头，总想快点回家。", "Anxious and confused, scratching your head, desperate to get home."), t("「博士，什么是吉瓦？」", "“Doc, what the heck is a gigawatt?”")),
    ],
    see: "Back to the Future 1.21 gigawatts scene",
  },
  {
    id: "en-et-phone-home",
    set: "en",
    level: "all",
    show: t("E.T. 外星人（E.T.）", "E.T. the Extra-Terrestrial"),
    year: 1982,
    title: t("「E.T. 打电话回家」", "“E.T. phone home”"),
    setup: t(
      "艾略特和妹妹格蒂发现外星人 E.T. 学会了说话。E.T. 指着窗外的天空，说出了它最想做的事。",
      "Elliott and his little sister Gertie discover that E.T. has learned to talk. Pointing at the sky, E.T. says what it wants most of all.",
    ),
    beats: [
      t("格蒂教 E.T. 说话，E.T. 学得磕磕巴巴。", "Gertie teaches E.T. to speak; E.T. stumbles over the words."),
      t("艾略特冲进来，看到 E.T. 在说话，惊呆了。", "Elliott rushes in and is stunned to hear E.T. talking."),
      t("E.T. 慢慢抬起手指，指着窗外，说出那句话。", "E.T. slowly raises one long finger toward the window and says the line."),
      t("大家一起看着天空，安静三秒。", "Everyone gazes at the sky in silence for three seconds."),
    ],
    roles: [
      r(t("E.T.", "E.T."), t("动作很慢，声音沙哑，伸出一根手指，脖子一伸一缩。", "Move very slowly, raspy voice, one finger extended, neck stretching in and out."), t("「E.T.……打电话……回家。」", "“E.T.… phone… home.”")),
      r(t("艾略特", "Elliott"), t("又惊又喜，蹲下来和 E.T. 平视。", "Amazed and excited, crouching to look E.T. in the eye."), t("「你会说话了？！」", "“You can talk?!”")),
      r(t("格蒂", "Gertie"), t("天真烂漫的小妹妹，像老师一样一个字一个字地教。", "The wide-eyed little sister, teaching word by word like a tiny teacher."), t("「跟我说：你——好。」", "“Say it with me: hel-lo.”")),
    ],
    min: 2,
    see: "ET phone home scene",
  },
  {
    id: "en-schitts-creek-cheese",
    set: "en",
    level: "all",
    show: t("富家穷路（Schitt's Creek）", "Schitt's Creek"),
    year: 2015,
    title: t("「把奶酪折进去！」", "“Fold in the cheese!”"),
    setup: t(
      "从没下过厨的莫伊拉和儿子大卫，照着家里的食谱做墨西哥卷饼。食谱上写着「把奶酪折进去」，可两个人都不知道什么意思。",
      "Moira and her son David, who have never cooked a thing in their lives, attempt enchiladas from a family recipe. It says “fold in the cheese”. Neither has any idea what that means.",
    ),
    beats: [
      t("莫伊拉念食谱，大卫拿着锅铲站在旁边。", "Moira reads the recipe; David stands by with a spatula."),
      t("念到「把奶酪折进去」，两个人愣住了。", "They hit “fold in the cheese” and freeze."),
      t("大卫一遍遍问怎么折，莫伊拉一遍遍说「就是折进去」。", "David keeps asking how; Moira keeps saying “You just fold it in!”"),
      t("两个人吵起来，奶酪还是没折进去。", "They bicker, and the cheese remains unfolded."),
    ],
    roles: [
      r(t("莫伊拉", "Moira"), t("说话像在演舞台剧，用词夸张，其实什么都不会。", "Talk like a grand stage actress, with extravagant words and no idea what you're doing."), t("「你只要把奶酪折进去就行了，大卫。」", "“You just fold in the cheese, David.”")),
      r(t("大卫", "David"), t("快崩溃了，一直比划手势，声音越来越尖。", "On the verge of a meltdown, gesturing wildly, voice climbing higher."), t("「什么叫『折进去』？你给我示范一下！」", "“What does ‘fold it in’ mean? Can you show me?”")),
    ],
    see: "Schitt's Creek fold in the cheese",
  },
  {
    id: "en-princess-bride-inigo",
    set: "en",
    level: "all",
    show: t("公主新娘（The Princess Bride）", "The Princess Bride"),
    year: 1987,
    title: t("「我叫伊尼戈·蒙托亚」", "“My name is Inigo Montoya”"),
    setup: t(
      "剑客伊尼戈终于找到了杀父仇人。他一遍又一遍地报出自己的名字，每说一遍就逼近一步，仇人越来越慌。",
      "Swordsman Inigo has finally found the man who killed his father. He repeats his introduction again and again, advancing with every word, while his enemy grows more and more desperate.",
    ),
    beats: [
      t("伊尼戈拿着「剑」，摇摇晃晃地站起来。", "Inigo staggers to his feet, “sword” in hand."),
      t("伊尼戈报上名字，一步步逼近。", "He states his name and advances."),
      t("仇人求饶，许诺给他钱、给他权，伊尼戈还是那句话。", "His enemy begs, offering money and power; Inigo just repeats himself."),
      t("最后一剑，定格。", "One final thrust. Freeze."),
    ],
    roles: [
      r(t("伊尼戈", "Inigo Montoya"), t("每说一遍声音更大、更坚定，带一点西班牙口音。", "Louder and steadier every time you say it, with a touch of a Spanish accent."), t("「你好。我叫伊尼戈·蒙托亚。」", "“Hello. My name is Inigo Montoya.”")),
      r(t("鲁根伯爵", "Count Rugen"), t("开始很傲慢，后来越来越慌，一边后退一边求饶。", "Arrogant at first, then increasingly panicked, backing away and begging."), t("「别再说了！」", "“Stop saying that!”")),
    ],
    see: "Princess Bride my name is Inigo Montoya scene",
  },
];

/** The two sets, as the host and the playbill name them. */
export const CSET_NAME: Record<ClassicSet, T> = {
  zh: t("中文影视", "Chinese film & TV"),
  en: t("英文影视", "English film & TV"),
};

/** For someone who has never acted, before a famous scene: five things that get the laugh. */
export const CLASSIC_TIPS: T[] = [
  t("不用一字不差：记住那句最有名的台词，其他的用自己的话说。", "No need to be word-perfect: nail the one famous line and say the rest your own way."),
  t("先学一个大家一眼认得出的东西：一个手势、一个眼神、一种走路的样子。", "Copy one thing everyone recognizes first: a gesture, a look, a way of walking."),
  t("演得夸张比演得像更好笑。声音放大，动作放慢。", "Bigger beats accurate. Louder voice, slower moves."),
  t("没看过原片？先点「看原片」看半分钟再上。", "Never seen it? Tap “Watch the original” for thirty seconds first."),
  t("忘词了，就看着对方把上一句重复一遍，观众会以为你是故意的。", "Lost your line? Repeat the other person's last line back at them. It'll look deliberate."),
];
