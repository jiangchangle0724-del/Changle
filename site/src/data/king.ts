import type { T } from "../i18n";

/**
 * King's commands. {a} {b} {c} are chopstick numbers the app fills in at random.
 * The king calls numbers, never names: nobody knows who holds which number until they move.
 */
/** `custom`: the command when the table plays for its own penalty instead of drinks. */
export type Command = T & { people: 1 | 2 | 3; custom?: T };

const c1 = (zh: string, en: string, custom?: T): Command => ({ zh, en, people: 1, ...(custom ? { custom } : {}) });
const c2 = (zh: string, en: string, custom?: T): Command => ({ zh, en, people: 2, ...(custom ? { custom } : {}) });
const c3 = (zh: string, en: string, custom?: T): Command => ({ zh, en, people: 3, ...(custom ? { custom } : {}) });
const alt = (zh: string, en: string): T => ({ zh, en });

/** A command in the words of the table's penalty: drinking, or the host's own. */
export function commandText(c: Command, custom: boolean): T {
  return custom && c.custom ? c.custom : { zh: c.zh, en: c.en };
}

export const COMMANDS: Command[] = [
  c2("{a}号给{b}号捶背一分钟。", "No. {a} gives No. {b} a one-minute back massage."),
  c2("{a}号模仿{b}号说话，直到大家笑出来。", "No. {a} imitates No. {b} until the table laughs."),
  c2("{a}号和{b}号对视 30 秒，谁先笑谁喝。", "No. {a} and No. {b} hold eye contact for 30 seconds. First to laugh drinks.", alt("{a}号和{b}号对视 30 秒，谁先笑谁受罚。", "No. {a} and No. {b} hold eye contact for 30 seconds. First to laugh takes the penalty.")),
  c2("{a}号给{b}号讲一个笑话，不好笑的话{a}号喝。", "No. {a} tells No. {b} a joke. If it isn't funny, No. {a} drinks.", alt("{a}号给{b}号讲一个笑话，不好笑的话{a}号受罚。", "No. {a} tells No. {b} a joke. If it isn't funny, No. {a} takes the penalty.")),
  c2("{a}号用方言或口音向{b}号表白。", "No. {a} confesses love to No. {b} in a dialect or an accent."),
  c2("{a}号和{b}号交换座位，到下一局。", "No. {a} and No. {b} swap seats until next round."),
  c2("{a}号唱一句歌，{b}号接下一句，接不上的喝。", "No. {a} sings a line, No. {b} sings the next. Miss it and drink.", alt("{a}号唱一句歌，{b}号接下一句，接不上的受罚。", "No. {a} sings a line, No. {b} sings the next. Miss it and take the penalty.")),
  c2("{a}号给{b}号倒满，{b}号一口干。", "No. {a} fills No. {b}'s glass. No. {b} downs it.", alt("{b}号受罚，{a}号在旁边监督，不许偷工减料。", "No. {b} takes the penalty while No. {a} makes sure no corners are cut.")),
  c2("{a}号夸{b}号三句，不许重复。", "No. {a} compliments No. {b} three times. No repeats."),
  c3("{a}号、{b}号、{c}号一起喝。", "Nos. {a}, {b} and {c} drink together.", alt("{a}号、{b}号、{c}号一起受罚。", "Nos. {a}, {b} and {c} take the penalty together.")),
  c2("{a}号给{b}号拍一张照，{b}号用它当头像到明天。", "No. {a} takes a photo of No. {b}. No. {b} uses it as a profile picture until tomorrow."),
  c2("{a}号背着{b}号绕桌子走一圈。", "No. {a} carries No. {b} piggyback once around the table."),
  c2("{a}号喂{b}号吃一口东西。", "No. {a} feeds No. {b} a bite of something."),
  c2("{a}号给{b}号起个外号，今晚大家都这么叫。", "No. {a} gives No. {b} a nickname. Everyone uses it tonight."),
  c2("{a}号用屁股写一个字，{b}号猜，猜错两人都喝。", "No. {a} writes a word with their hips. No. {b} guesses. Wrong and both drink.", alt("{a}号用屁股写一个字，{b}号猜，猜错两人都受罚。", "No. {a} writes a word with their hips. No. {b} guesses. Wrong and both take the penalty.")),
  c2("{a}号和{b}号剪刀石头布三局，输的喝。", "Nos. {a} and {b} play rock-paper-scissors, best of three. Loser drinks.", alt("{a}号和{b}号剪刀石头布三局，输的受罚。", "Nos. {a} and {b} play rock-paper-scissors, best of three. Loser takes the penalty.")),
  c2("{a}号对{b}号说一句真心话。", "No. {a} says one honest thing to No. {b}."),
  c2("{a}号跳一段舞，{b}号伴唱。", "No. {a} dances. No. {b} sings the backing track."),
  c2("{a}号用最温柔的声音骂{b}号十秒。", "No. {a} scolds No. {b} in the gentlest voice for ten seconds."),
  c2("{a}号公主抱{b}号三秒。", "No. {a} lifts No. {b} bridal-style for three seconds."),
  c2("{a}号和{b}号额头夹一张纸巾，撑 10 秒。", "Nos. {a} and {b} hold a napkin between their foreheads for ten seconds."),
  c2("{a}号说{b}号一个优点，{b}号说{a}号一个缺点。", "No. {a} names one strength of No. {b}. No. {b} names one flaw of No. {a}."),
  c2("{a}号当{b}号的服务员，到下一局。", "No. {a} is No. {b}'s waiter until next round."),
  c2("{a}号用一个词形容{b}号，{b}号用一个词形容{a}号。", "One word each: No. {a} describes No. {b}, then the other way round."),
  c2("{a}号模仿国王，{b}号模仿{a}号。", "No. {a} imitates the king. No. {b} imitates No. {a}."),
  c2("{a}号给{b}号即兴编一首两句的诗。", "No. {a} improvises a two-line poem for No. {b}."),
  c2("{a}号和{b}号只用眼神交流 30 秒，不许笑。", "Nos. {a} and {b} talk with their eyes only for 30 seconds. No laughing."),
  c3("{a}号给{b}号捏肩，{c}号监督质量。", "No. {a} massages No. {b}'s shoulders. No. {c} supervises."),
  c2("{a}号喝一口，{b}号喝两口。", "No. {a} takes one sip. No. {b} takes two.", alt("{a}号受罚一次，{b}号受罚两次。", "No. {a} takes the penalty once. No. {b} takes it twice.")),
  c2("{a}号表演{b}号喝醉的样子。", "No. {a} acts out No. {b} drunk."),
  c2("{a}号教{b}号一个舞步，两人一起跳。", "No. {a} teaches No. {b} a dance move. They do it together."),
  c2("{a}号换一种语言向{b}号自我介绍。", "No. {a} introduces themselves to No. {b} in a different language."),
  c2("{a}号闭眼摸{b}号的脸猜是谁，猜错喝。", "No. {a}, eyes closed, touches No. {b}'s face and guesses who it is. Wrong and drink.", alt("{a}号闭眼摸{b}号的脸猜是谁，猜错受罚。", "No. {a}, eyes closed, touches No. {b}'s face and guesses who it is. Wrong and take the penalty.")),
  c2("{a}号给{b}号唱生日歌，不管是不是生日。", "No. {a} sings happy birthday to No. {b}, birthday or not."),
  c2("{a}号说三件今天发生的事，一真两假，{b}号猜哪件是真的。", "No. {a} tells three things about today, one true. No. {b} finds the truth."),
  c2("{a}号当{b}号的翻译一局，{b}号说什么都要翻。", "No. {a} translates everything No. {b} says for one round."),
  c2("{a}号和{b}号互相喂对方喝一口。", "Nos. {a} and {b} feed each other a sip.", alt("{a}号和{b}号互相喂对方吃一口东西。", "Nos. {a} and {b} feed each other a bite of something.")),
  c2("{a}号发一条消息给{b}号：“我今晚不回家了。”", "No. {a} texts No. {b}: “I'm not coming home tonight.”"),
  c2("{a}号扮一种动物向{b}号求偶。", "No. {a} courts No. {b} as an animal of their choosing."),
  c2("{a}号给{b}号整理衣领或系鞋带。", "No. {a} fixes No. {b}'s collar or ties their shoelaces."),
  c1("全桌给国王敬酒，{a}号带头说祝酒词。", "Everyone toasts the king. No. {a} leads the toast.", alt("全桌起立向国王致敬，{a}号带头说一段贺词。", "Everyone rises to honour the king. No. {a} leads with a speech.")),
  c1("{a}号大喊“国王万岁”，声音不够大就重来。", "No. {a} shouts “long live the king!” Too quiet? Again."),
  c2("{a}号讲一件{b}号的糗事，讲不出就喝。", "No. {a} tells an embarrassing story about No. {b}. None? Drink.", alt("{a}号讲一件{b}号的糗事，讲不出就受罚。", "No. {a} tells an embarrassing story about No. {b}. None? Take the penalty.")),
  c2("{a}号和{b}号比赛憋气，输的喝。", "Nos. {a} and {b} hold their breath. Loser drinks.", alt("{a}号和{b}号比赛憋气，输的受罚。", "Nos. {a} and {b} hold their breath. Loser takes the penalty.")),
  c2("{a}号出一个谜语，{b}号猜不出就喝。", "No. {a} asks a riddle. No. {b} drinks if stumped.", alt("{a}号出一个谜语，{b}号猜不出就受罚。", "No. {a} asks a riddle. No. {b} takes the penalty if stumped.")),
  c1("{a}号给国王按摩一分钟。", "No. {a} gives the king a one-minute massage."),
  c1("{a}号用三句话赞美国王。", "No. {a} praises the king in three sentences."),
  c3("{a}号、{b}号、{c}号排成一排跳一段舞。", "Nos. {a}, {b} and {c} line up and dance together."),
];
