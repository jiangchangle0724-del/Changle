// Party forfeits (派对惩罚), used only when the host turns party mode on. A general set for any table:
// no drinking, no touching, nothing personal, doable sitting down in half a minute, in any language.
// Some belong to what triggered them (a huge rent, Immigration, going broke, Seoul, Shanghai); the
// rest can come up any time. The room picks one and puts its number in the feed.
import type { Text } from "../engine";
import type { PartyWhy } from "./protocol";

export interface Forfeit {
  /** Only for this trigger; without it, for any. */
  why?: PartyWhy;
  text: Text;
}

const f = (zh: string, en: string, why?: PartyWhy): Forfeit => ({ why, text: { zh, en } });

export const FORFEITS: Forfeit[] = [
  f("向收你租金的队鞠一躬，用最隆重的语气说：「谢谢房东！」", "Bow to the team you paid and say, as grandly as you can: \"Thank you, landlord!\"", "rent"),
  f("用 15 秒哭穷：这笔租金让你取消了哪一趟旅行？", "Plead poverty for 15 seconds: which trip did that rent just cancel?", "rent"),
  f("入境审查：用 10 秒向「海关官员」（你右手边的人）解释此行的目的。", "Immigration check: explain the purpose of your visit to the officer (the player on your right) in 10 seconds.", "jail"),
  f("等候审查时，用机场广播腔播一条寻物启事：你丢了护照。", "While you wait, make an airport announcement in your best PA voice: you've lost your passport.", "jail"),
  f("向你失去的城市致告别辞，15 秒。", "Give a 15-second farewell speech to the cities you've lost.", "broke"),
  f("摆一个「滞留机场的旅客」的姿势，保持 5 秒。", "Strike your best stranded-at-the-airport pose and hold it for 5 seconds.", "broke"),
  f("你打破了安静：接下来说的三句话都只能用耳语。", "You broke the silence: whisper your next three sentences.", "sound"),
  f("像图书馆管理员一样对全桌「嘘——」一声，再向大家道歉。", "Shush the whole table like a librarian, then apologise to everyone.", "sound"),
  f("10 秒内说出三样属于可回收物的东西。", "Name three things that go in the recycling, in 10 seconds.", "quiz"),
  f("像垃圾分类志愿者一样，给大家喊一句分类口号。", "Like a recycling volunteer, give the table a one-line slogan for sorting rubbish.", "quiz"),
  f("用三种语言说「你好」，游戏里学到的城市问候语也算。", "Say hello in three languages. The city greetings from this game count."),
  f("像导游一样，用 20 秒把你们所在的房间介绍成一个景点。", "Like a tour guide, spend 20 seconds presenting the room you're in as a tourist attraction."),
  f("摆一个「到此一游」的拍照姿势，保持 5 秒。", "Strike your best \"I was here\" tourist pose and hold it for 5 seconds."),
  f("用机场广播腔播一条登机通知：「前往＿＿的航班现在开始登机……」", "In your best airport voice: \"Flight to ___ is now boarding…\""),
  f("10 秒内说出五个国家的首都。", "Name five capital cities in 10 seconds."),
  f("用手比划一个世界著名地标，让大家猜。", "Act out a famous landmark with your hands; the table guesses which."),
  f("哼一首歌名里有城市的歌，让大家猜歌名。", "Hum a song with a city in its title; the table guesses the song."),
  f("到你的下个回合为止，说话前都要先说「各位旅客请注意」。", "Until your next turn, start everything you say with \"Attention, passengers\"."),
  f("用你的第二语言（或任何一门外语）从一数到十。", "Count from one to ten in a language that isn't your first."),
  f("30 秒讲一个你最难忘的旅行小插曲。", "Tell your most memorable travel mishap in 30 seconds."),
  f("用三个词描述你梦想的目的地，让大家猜是哪里。", "Describe your dream destination in three words; the table guesses where."),
  f("表演在行李转盘上终于看到自己行李的那一刻。", "Act out the moment your bag finally appears on the baggage carousel."),
  f("像房产中介一样，用一句话推销你最值钱的城市（还没有城市就推销你最想要的）。", "Like an estate agent, sell your most valuable city in one sentence (no city yet? the one you want most)."),
  f("表演一位遇上气流的乘客，5 秒。", "Act out a passenger hitting turbulence for 5 seconds."),
  f("跳 10 秒桑巴，坐着跳也算。", "Dance 10 seconds of samba. Sitting down counts."),
  f("给你们队的行李箱角色起个外号，再用它的口吻说一句话。", "Give your team's luggage character a nickname, then say one line in its voice."),
  f("选一位玩家，用一门外语夸夸对方。", "Pick a player and pay them a compliment in another language."),
  f("像美食节目主持人一样，向全桌推荐一道你吃过的异国美食。", "Like a food-show host, recommend a dish you've had abroad to the table."),
  f("说出一件你出门旅行一定会带的奇怪东西。", "Name the one odd thing you always pack for a trip."),
];
