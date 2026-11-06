import type { T } from "../i18n";
import { SCENES } from "./drama";
import { GROUP_GUIDES } from "./dramaGroupGuides";

/**
 * 戏精大赏 · how to act a scene, for people who never have.
 *
 * `beats`: what happens, in four steps everyone reads (the playbill shows them through the scene).
 * `roles`, in the same order as the scene's roles: `play` is how to come across (voice, face,
 * hands) in one line, everyone sees it; `first` is a line to open with, on the actor's own card.
 *
 * Written for two audiences, not translated: the English says it the way an English speaker would.
 * Every built-in scene has one (a test checks); a scene players write gets `GENERIC_BEATS`.
 */
export type RoleGuide = { play: T; first: T };
export type SceneGuide = { beats: T[]; roles: RoleGuide[] };

const t = (zh: string, en: string): T => ({ zh, en });
const r = (play: T, first: T): RoleGuide => ({ play, first });

/** How any scene can go, when it has no guide of its own. */
export const GENERIC_BEATS: T[] = [
  t("开场：一个人发现出事了，把大家叫过来。", "Someone discovers what's happened and calls everyone over."),
  t("每个人说自己当时在干什么，别人追问一个细节。", "Each person says where they were; the others press for one detail."),
  t("剧情反转弹出来以后，大家重新解释一次。", "When the twist pops up, everyone explains themselves again."),
  t("最后每人说一句话，让观众相信你。", "To finish, one line each to convince the audience."),
];

/** Five things that make anyone's scene work, for a first-timer. */
export const FIRST_TIME_TIPS: T[] = [
  t("不用背台词，用自己的话说，说错了也没关系。", "No lines to learn. Say it your own way; nobody minds a stumble."),
  t("一开口先说清楚你是谁、你在干什么，比如「我是奶奶，我刚包完饺子」。", "Open by saying who you are and what you're doing: “I'm Grandma, and I just finished the dumplings.”"),
  t("声音大一点、说慢一点，说话时看着对方，别看手机。", "Louder and slower than feels natural. Look at the others, not your phone."),
  t("别人说完，你接一句「等一下，你刚才说……」，戏就接下去了。", "When someone finishes, jump in with “Hold on, you just said...” and the scene keeps rolling."),
  t("每个人都有秘密：好人也要藏，坏人别承认。被问住了，就反问回去。", "Everyone has a secret. The innocent hide theirs too; the culprit never confesses. Stuck? Answer with a question."),
];

export const GUIDES: Record<string, SceneGuide> = {
  "family-new-year-dumplings": {
    beats: [
      t("奶奶端着饺子出来，发现硬币饺子不见了，把大家叫到桌前站好。", "Grandma carries out the dumplings, finds the coin one gone, and lines everyone up at the table."),
      t("每人说说下午都在干什么，奶奶挨个闻闻谁嘴里有韭菜味。", "Each person says what they did all afternoon. Grandma sniffs everyone's breath for chives."),
      t("反转以后，硬币能换全部红包，每个人都想说是自己吃到的。", "After the twist, the coin is worth every red envelope, so suddenly everyone wants to have eaten it."),
      t("最后每人对奶奶说一句好话，求她相信自己。", "To finish, each person sweet-talks Grandma with one last line."),
    ],
    roles: [
      r(t("说话慢、声音大，一只手叉腰，一只手拿筷子指人。", "Slow and loud. One hand on your hip, the other pointing chopsticks at people."), t("「谁动了我的饺子？都给我站好！」", "“Who touched my dumplings? Everybody, line up!”")),
      r(t("一直在笑，笑得有点假；一提到工作就赶紧换话题。", "Smile a lot, slightly too much, and change the subject whenever work comes up."), t("「奶奶，今天的饺子真香，我帮您端吧？」", "“Grandma, these smell amazing. Let me carry them for you!”")),
      r(t("手机攥在手里，时不时瞄一眼；说话前先清清嗓子。", "Phone clutched in your hand, sneaking glances at it; clear your throat before you speak."), t("「我一直在厨房洗碗，真的，你们看我的手还是湿的。」", "“I've been washing up the whole time. Look, my hands are still wet.”")),
    ],
  },
  "show-livestream-sales": {
    beats: [
      t("主播对着手机镜头卖锅，煎蛋时蛋粘住了，弹幕开始骂。", "The host sells the pan to the camera; the egg sticks mid-demo and the comments turn nasty."),
      t("主播一边笑着救场，一边小声问另外两个人：谁干的？", "The host keeps smiling for the camera while hissing at the other two: who did this?"),
      t("十万人刷「退钱」以后，三个人轮流对着镜头解释。", "Once a hundred thousand viewers demand refunds, all three take turns explaining to the camera."),
      t("最后一起喊「三、二、一，上链接」，看谁喊得最心虚。", "Finish with everyone shouting “Three, two, one, link's up!” and see whose voice cracks."),
    ],
    roles: [
      r(t("语速飞快，对着镜头永远在笑，一转头脸就冷下来。", "Talk at top speed and beam at the camera; turn away and your face drops instantly."), t("「家人们看好了！这口锅，煎蛋一点都不粘！」", "“Okay, fam, watch this! This pan? Nothing sticks. Nothing!”")),
      r(t("什么都抢着递、抢着喊，一被点名就结巴。", "Grab everything, shout everything, and stammer the moment you're named."), t("「来来来，三、二、一，上链接！」", "“Here we go! Three, two, one, link's up!”")),
      r(t("抱着胳膊坐在镜头外，盯着销量直叹气。", "Arms folded off camera, staring at the sales numbers and sighing."), t("「这锅我们厂做了二十年，从来没出过问题。」", "“Our factory has made this pan for twenty years. Not one complaint.”")),
    ],
  },
  "family-cake-floor": {
    beats: [
      t("大家等着蛋糕，送货员打来电话：蛋糕已经送到隔壁楼了。", "Everyone's waiting for the cake when the courier calls: it's been delivered next door."),
      t("三个人抢着看送货手机，每人说自己只按过哪一个键。", "All three grab for the delivery phone, each swearing which single button they pressed."),
      t("隔壁楼请全家过去以后，大家商量谁去把蛋糕认领回来。", "When the neighbours invite everyone over, decide who has to go and claim the cake."),
      t("最后一起给寿星唱生日歌，唱完各说一句自己不是坏人。", "End by singing happy birthday together, then one line each on why it wasn't you."),
    ],
    roles: [
      r(t("嘴上说不在乎，眼睛一直往门口瞟。", "Say you don't care; keep glancing at the door anyway."), t("「没有蛋糕也没关系，真的，我一点都不在乎。」", "“Honestly, no cake is fine. I really don't care. At all.”")),
      r(t("讲话像在算账，动不动就提运费。", "Talk like you're doing the accounts, and keep mentioning the delivery fee."), t("「运费可是我出的，谁动了我的订单？」", "“I paid for delivery. Who touched my order?”")),
      r(t("把手机举得老远，眯着眼看，说话声音特别大。", "Hold the phone at arm's length, squint at it, and talk far too loudly."), t("「手机的事交给我，我最懂这个！」", "“Leave the phone to me. I'm the tech guy here!”")),
    ],
  },
  "family-group-vote": {
    beats: [
      t("两人各自看手机，发现家庭群全票通过了洗碗的事。", "You both check your phones and find the dishwashing vote has passed unanimously."),
      t("轮流把手机给对方看「我没投」，谁都不肯先打开原始投票。", "Take turns showing each other “I never voted,” but neither wants to open the original poll first."),
      t("被安排洗碗的人回了消息以后，两人联手想办法甩锅。", "After the chosen dishwasher's reply lands, team up to dodge the blame."),
      t("最后各自给家庭群「发一条语音」，大声说出来。", "To finish, each of you “sends a voice message” to the family chat, said out loud."),
    ],
    roles: [
      r(t("说话像发通知，一句一句很正式。", "Talk like you're posting announcements: short, formal sentences."), t("「各位家人注意了，这个投票我需要核实一下。」", "“Attention, everyone. I need to verify this vote.”")),
      r(t("话很少，只会点头、笑，每句话都先「嗯……」。", "Say very little: nod, smile, and start every sentence with “Umm...”"), t("「嗯……我就发了个笑脸啊。」", "“Umm... I just sent a smiley.”")),
    ],
  },
  "love-proposal-subtitles": {
    beats: [
      t("求婚的人单膝跪下彩排，一抬头，屏幕上写着「先排队」。", "The proposer kneels for a rehearsal, looks up, and the screen says “Take a number.”"),
      t("三个人围着遥控器吵，每人都说自己只调过亮度。", "All three crowd around the remote, each insisting they only touched the brightness."),
      t("路人排起队以后，三个人只好装作这是活动的一部分。", "Once passers-by start queuing, the three of you pretend it's all part of the plan."),
      t("最后求婚的人再跪一次，大家一起数「一、二、三」。", "To finish, the proposer kneels one more time while everyone counts “one, two, three.”"),
    ],
    roles: [
      r(t("很紧张，一直摸口袋里的戒指盒，说话有点抖。", "Nervous. Keep patting the ring box in your pocket; your voice wobbles."), t("「好，从跪下开始再来一遍……屏幕上写的什么？」", "“Okay, from the kneel again... wait, what does the screen say?”")),
      r(t("遥控器举得高高的，谁伸手你就躲。", "Hold the remote up high and dodge anyone who reaches for it."), t("「别碰遥控器！我只调了一下亮度！」", "“Hands off the remote! I only touched the brightness!”")),
      r(t("一直看天气、看手表，假装很忙。", "Keep checking the weather and your watch, acting busy."), t("「再过十分钟就要下雨了，大家抓紧！」", "“Rain in ten minutes, people. Let's move!”")),
    ],
  },
  "love-noodle-review": {
    beats: [
      t("两人看到约会群里那条一星差评，一下子愣住了。", "Both of you see the one-star review in the date chat and freeze."),
      t("做饭的说面没问题，送饭的说路上很稳，两人互相查手机。", "The cook defends the noodles, the courier defends the trip, and you check each other's phones."),
      t("收便当的人回复以后，两人一起去「隔壁桌」看个究竟。", "After the recipient's reply, go together to look at “the other table.”"),
      t("最后各自尝一口面，说一句最真心的评价。", "Finish by each tasting the noodles and giving your most honest review."),
    ],
    roles: [
      r(t("很骄傲，讲起配方来两只手比划个不停。", "Proud. Talk about the recipe with big chef's hands."), t("「这是我奶奶传下来的配方，面怎么可能坨？」", "“That's my grandma's recipe. Those noodles did not give up.”")),
      r(t("一直护着保温袋，说话很快，有点心虚。", "Hug the delivery bag, talk fast, a little too defensive."), t("「我一路抱着它，连咖啡都没停下来买！」", "“I carried it like a baby the whole way. I didn't even stop for coffee!”")),
    ],
  },
  "office-party-speech": {
    beats: [
      t("老板站在台上照着提词器念，念出了「我最大的贡献是少开会」。", "The boss reads the teleprompter on stage and blurts out “My greatest achievement was cancelling meetings.”"),
      t("三个人围着控制平板，每人都说自己只按过翻页。", "All three gather round the control tablet, each claiming they only pressed “next.”"),
      t("上级要听十分钟以后，老板只好硬着头皮讲，另外两人帮腔。", "When the big boss wants ten minutes on it, the boss has to wing it while the others chime in."),
      t("最后三人一起鞠躬，说一句年会祝福。", "Finish with all three bowing and wishing everyone a great year."),
    ],
    roles: [
      r(t("笑得很用力，说话一顿一顿，偷看手心的小抄。", "Smile too hard, speak in careful chunks, sneak looks at your palm."), t("「各位同事，大家好……我最大的贡献是……少开会？」", "“Dear colleagues... my greatest achievement was... cancelling meetings?”")),
      r(t("拿着对讲机满场跑，什么事都说「没问题」。", "Rush about with a walkie-talkie and say “No problem!” to everything."), t("「没问题没问题，这是我们设计好的互动环节！」", "“No problem! This is our interactive segment!”")),
      r(t("站在角落，手指一直悬在平板上，一有人看就缩回来。", "Stand in a corner, finger hovering over the tablet; snatch it back when anyone looks."), t("「我、我只是负责翻页的……」", "“I-I just do the slides...”")),
    ],
  },
  "office-fridge-label": {
    beats: [
      t("两人同时走进茶水间，盯着冰箱上的通知和空饭盒。", "You both walk into the kitchen at the same moment and stare at the note and the empty container."),
      t("互相问：你手里为什么拿着筷子？你的饭盒怎么空了？", "Ask each other: why are you holding chopsticks? Why is your lunchbox empty?"),
      t("经理加了那行字以后，两人都拼命说自己一口没吃。", "After the manager adds that line, you both swear you never ate a thing."),
      t("最后各自对着冰箱发誓，说一句最狠的话。", "Finish by each swearing an oath to the fridge, as dramatically as you can."),
    ],
    roles: [
      r(t("抱着空饭盒，像丢了宝贝一样难过。", "Cradle the empty lunchbox like you've lost a treasure."), t("「我的饺子呢？我早上五点起来包的！」", "“Where are my dumplings? I got up at five to make them!”")),
      r(t("把筷子藏在身后，一直说「我就路过」。", "Hide the chopsticks behind your back and keep saying “Just passing through.”"), t("「我就路过，真的，就是来接杯水。」", "“Just passing through. Honestly. Getting some water.”")),
    ],
  },
  "crime-open-house-cookie": {
    beats: [
      t("经纪人带客人走进厨房，正要介绍获奖饼干，发现托盘空了。", "The agent leads the buyer into the kitchen to show off the prize cookie, and the cradle is empty."),
      t("经纪人一边介绍房子一边盘问，客人一边量尺寸一边躲。", "The agent sells the house while interrogating; the buyer measures things while dodging."),
      t("烘焙师来电以后，两人都想证明自己根本咬不动那块硬饼干。", "After the baker calls, both of you try to prove you could never bite that rock-hard cookie."),
      t("最后两人握手，各说一句自己为什么是清白的。", "Finish with a handshake and one line each on why you're innocent."),
    ],
    roles: [
      r(t("永远热情，满口销售腔，一紧张就把数字说错。", "Relentlessly upbeat, full sales voice; get the numbers wrong when nervous."), t("「欢迎欢迎！这个厨房最大的亮点，就是这块获奖饼干……咦？」", "“Welcome! The star of this kitchen is our award-winning cookie... oh.”")),
      r(t("拿着卷尺什么都量，说话很专业，眼神发虚。", "Measure everything with the tape, sound very expert, avoid eye contact."), t("「我主要是来研究户型的，这面墙有几米？」", "“I'm really here for the floor plan. How long is this wall?”")),
    ],
  },
  "crime-museum-squeak": {
    beats: [
      t("馆长给捐助人介绍玉雕，一碰展柜，里面传出橡皮鸭的叫声。", "The curator presents the jade carving to donors, touches the case, and it squeaks like a rubber duck."),
      t("三个人围着展柜，轮流说自己最后一次碰展柜是什么时候。", "All three circle the case, each saying when they last touched it."),
      t("捐助人要买鸭子以后，大家突然都想说鸭子是自己放的。", "Once a donor wants to buy the duck, suddenly everyone wants credit for it."),
      t("最后一起摆出博物馆合影的姿势，每人说一句讲解词。", "Finish by striking a museum group-photo pose, each giving one line of tour-guide patter."),
    ],
    roles: [
      r(t("说话文绉绉，站得笔直，用身子挡住身后的标签。", "Speak grandly, stand very straight, and block the label behind you."), t("「各位请看，这件千年玉雕……（嘎）……」", "“Ladies and gentlemen, this thousand-year-old carving... (squeak)...”")),
      r(t("双手背在身后来回踱步，脚一动就掉亮片。", "Hands behind your back, pacing, shedding glitter with every step."), t("「我一秒钟都没离开过岗位，一秒都没有！」", "“I never left my post. Not for one second!”")),
      r(t("手里拿着抹布，一边擦一边慌，什么都说「我不知道」。", "Hold a cloth, wipe things nervously, and answer everything with “I don't know.”"), t("「我只是擦了擦玻璃，鸭子不是我放的！」", "“I only cleaned the glass! I never put a duck in there!”")),
    ],
  },
  "palace-dragon-robe": {
    beats: [
      t("两人展开龙袍准备大典，发现短了三寸，还露出一圈小鸭子。", "You unfold the dragon robe for the ceremony: three inches short, with a border of little ducks."),
      t("掌衣官查针脚，礼仪官查流程，互相指着对方怀里的布卷。", "The keeper checks the stitches, the officer checks the schedule, and you point at each other's fabric rolls."),
      t("圣旨要全改成小鸭以后，两人抢着说这是自己的设计。", "When the decree orders ducks everywhere, both of you claim it was your design."),
      t("最后一起向「皇上」跪下，各说一句吉祥话。", "Finish by kneeling to “the emperor,” each offering a lucky blessing."),
    ],
    roles: [
      r(t("说话细声细气，动不动摸布料，嫌这嫌那。", "Soft fussy voice, always stroking the fabric, finding fault with everything."), t("「我的针脚从来不出错，一定是有人动过！」", "“My stitches are never wrong. Someone has tampered with this!”")),
      r(t("每句话都很庄重，走路一步一顿，偷看袖口。", "Say everything with great ceremony, walk in stately steps, sneak looks at your cuff."), t("「大典马上开始，每一步都要庄严……这龙袍怎么了？」", "“The ceremony is about to begin. Every step must be dignified... what happened to this robe?”")),
    ],
  },
  "palace-lantern-wish": {
    beats: [
      t("总管举起灯笼检查，念出上面的字：「明天全体睡到午时」。", "The steward holds up the lantern to inspect it and reads aloud: “Let everyone sleep until noon.”"),
      t("三个人对着灯面认字迹、认画法，互相怀疑。", "All three study the handwriting and brushwork, suspecting one another."),
      t("皇上批准但要先守夜以后，三人开始互相推：你守，我先睡。", "Once the emperor approves but demands an all-night vigil first, pass the buck: you stay up, I'll sleep."),
      t("最后三人一起举起灯笼，各许一个愿。", "Finish by raising the lantern together, each making a wish out loud."),
    ],
    roles: [
      r(t("背着手巡视，说话一字一顿，对字体特别挑剔。", "Hands behind your back, inspecting, every word clipped; obsessed with handwriting."), t("「这字，是谁写的？给我站出来！」", "“This calligraphy. Who wrote it? Step forward!”")),
      r(t("很自恋，一说到画就停不下来，偷偷护着龙脸那一块。", "Vain; can't stop talking about your art; secretly shield the dragon's face."), t("「这灯面上的龙，每一片鳞都是我亲手画的。」", "“Every scale on that dragon was painted by my own hand.”")),
      r(t("一直打哈欠，站着都能睡着，被叫到就猛地立正。", "Yawn constantly, nearly asleep on your feet; snap to attention when called."), t("「（打哈欠）……我一直在巡夜，什么都没看见。」", "“(yawn)... I was on patrol all night. Saw nothing.”")),
    ],
  },
  "show-talent-mute": {
    beats: [
      t("主持人试麦，每说一句话，麦克风就放一声搞笑的气声。", "The host tests the mic, and every sentence triggers a ridiculous raspberry noise."),
      t("两人对着音控台互相怀疑，主持人一开口就被气声打断。", "You suspect each other at the sound desk; the host keeps getting interrupted by the noise."),
      t("导演要庄严示范以后，两人轮流一本正经地「配合」气声。", "After the director demands a solemn demonstration, take turns performing with the noise, completely straight-faced."),
      t("最后一起说一句节目口号，看谁先笑场。", "Finish by saying the show's slogan together and see who cracks first."),
    ],
    roles: [
      r(t("声音洪亮、很端庄，被气声打断时拼命忍住不笑。", "Booming, dignified voice; fight not to laugh each time the noise cuts in."), t("「欢迎来到才艺秀决赛现场！（噗——）」", "“Welcome to the talent show final! (pffbbt)”")),
      r(t("戴着耳机狂按按钮，什么都说是「设备问题」。", "Headphones on, jabbing buttons, blaming everything on “equipment issues.”"), t("「设备问题，设备问题，马上就好！」", "“Equipment issue! Equipment issue! Give me one second!”")),
    ],
  },
  "show-pet-finalist": {
    beats: [
      t("主播正要宣布冠军，屏幕上出现了一只毛绒拖鞋。", "The presenter is about to announce the winner, and a fluffy slipper appears on screen."),
      t("三个人轮流解释拖鞋怎么拿到满票的，越解释越乱。", "Take turns explaining how a slipper got every vote; each explanation makes it worse."),
      t("原冠军的主人来电以后，大家想办法让宠物和拖鞋一起领奖。", "After the real winner's owner calls, figure out how a pet and a slipper can share the prize."),
      t("最后三人一起宣布冠军，摆出颁奖的姿势。", "Finish by announcing the champion together in a full awards pose."),
    ],
    roles: [
      r(t("声音甜、表情夸张，一出事就假笑。", "Sweet voice, big expressions; flash a fake smile the moment anything goes wrong."), t("「今晚的萌宠冠军就是……一只拖鞋？」", "“And tonight's cutest pet is... a slipper?”")),
      r(t("一直护着电脑，说话全是数字。", "Guard the computer and speak only in numbers."), t("「投票数据完全正常，一百票，全是拖鞋。」", "“The data is completely normal. One hundred votes. All slipper.”")),
      r(t("抱着鞋盒不放，一被问就抱得更紧。", "Hug the shoe box; squeeze it tighter whenever you're questioned."), t("「这个鞋盒？里面什么都没有，真的。」", "“This box? There's nothing in it. Really.”")),
    ],
  },
  "crime-costco-massage-chair": {
    beats: [
      t("两人在车里翻小票，发现多了一台 899 块的按摩椅。", "Going through the receipt in the car, you find an $899 massage chair."),
      t("轮流回忆在店里的每一步：试吃了什么、去过哪几区。", "Retrace every step in the store: which samples, which aisles."),
      t("送货公司来电以后，两人争着说自己今晚不在家。", "After the delivery company calls, argue over who won't be home tonight."),
      t("最后各自拍着后备箱发誓，说一句最狠的话。", "Finish by each slapping the trunk and swearing an oath."),
    ],
    roles: [
      r(t("两手一直握着方向盘，眼睛老往后备箱瞟。", "Hands glued to the steering wheel, eyes darting to the trunk."), t("「899？我一路都在推车，电器区我连看都没看！」", "“$899? I pushed the cart the whole time. I never even looked at electronics!”")),
      r(t("钱包抓在手里，说话像在查账。", "Wallet in hand, talking like an auditor."), t("「卡一直在我钱包里，那就只剩一种可能了……」", "“The card never left my wallet, so there's only one explanation...”")),
    ],
  },
  "palace-mooncake-crescent": {
    beats: [
      t("礼官捧着月饼走到皇上面前，揭开一看，缺了一弯新月。", "The master of ceremonies presents the mooncake, lifts the cover, and a crescent is missing."),
      t("女官说月饼没离开过视线，礼官说一路捧得稳稳的，两人互相闻嘴里有没有馅味。", "The matron says it never left her sight, the MC says he carried it perfectly; you sniff each other for filling."),
      t("皇上命咬月饼的人连夜咬完以后，两人都说自己最不爱吃月饼。", "Once the emperor orders the nibbler to bite every mooncake by dawn, both of you suddenly hate mooncakes."),
      t("最后两人一起对着月亮吟一句诗。", "Finish by reciting one line of poetry to the moon, together."),
    ],
    roles: [
      r(t("说话快，手很巧，一直拍身上的面粉。", "Quick talker, deft hands, forever brushing flour off yourself."), t("「这月饼从烤炉出来，一刻都没离开过我的眼睛！」", "“From the oven to this tray, that mooncake never left my sight!”")),
      r(t("说话拖长音，像在主持大典，时不时抬头看月亮。", "Draw out every word like you're hosting a ceremony; keep gazing up at the moon."), t("「皇上，请赏月饼……这、这月饼怎么缺了一块？」", "“Your Majesty, the mooncake... w-why is a piece missing?”")),
    ],
  },
  "office-money-tree": {
    beats: [
      t("两人一进门，就看到枯黄的发财树，和老板留的便条：「谁干的？」", "You both walk in to the yellowed money tree and a note from the boss: “Who did this?”"),
      t("轮流说这一周自己怎么照顾的树，互相闻花盆里的咖啡味。", "Take turns describing how you cared for the tree this week; sniff the pot for coffee."),
      t("花店来电以后，两人都说那棵新树不是自己订的。", "After the plant shop calls, both of you deny ordering the replacement."),
      t("最后两人一起对着发财树道歉，每人说一句。", "Finish by apologizing to the money tree, one line each."),
    ],
    roles: [
      r(t("说话温柔，护着发财树，手里拿着小剪刀却没察觉。", "Gentle voice, protective of the tree, absent-mindedly holding little scissors."), t("「我每天都照着单子浇水，一滴都没多浇！」", "“I watered it exactly by the sheet. Not one drop extra!”")),
      r(t("背着电脑包，满嘴术语，手里一杯冰美式。", "Laptop bag on your shoulder, all jargon, iced coffee in hand."), t("「我周末一直在机房修服务器，根本没空管这棵树。」", "“I spent the whole weekend fixing the server. I didn't have time for a plant.”")),
    ],
  },
  "office-skytrain-laptop": {
    beats: [
      t("两人走出天车站，项目经理伸手要电脑，发现谁手里都没有。", "Out of the SkyTrain station, the manager reaches for the laptop. Neither of you has it."),
      t("轮流回忆在车上坐哪、拿了什么、看了什么，互相翻包。", "Retrace where you sat, what you held and what you looked at; search each other's bags."),
      t("奶茶店发了动态以后，两人争论到底谁爱喝黑糖珍珠奶茶。", "After the bubble tea shop's post, argue over who drinks brown sugar milk tea."),
      t("最后各自给老板「打电话」，说一句怎么解释。", "Finish by each “calling the boss” with your explanation."),
    ],
    roles: [
      r(t("很累，说话有气无力，一着急就提高八度。", "Exhausted and flat-voiced, jumping an octave when panicked."), t("「电脑给我……电脑呢？电脑在你那儿吧？」", "“Hand me the laptop... the laptop? You've got it, right?”")),
      r(t("一直低头发消息，被问话才抬头，说话很快。", "Head down texting; look up only when questioned, then talk fast."), t("「不在我这儿啊，下车的时候是你拿着的！」", "“Not me! You were holding it when we got off!”")),
    ],
  },
  "family-mom-phone-locked": {
    beats: [
      t("茶几上的手机显示「已停用，一小时后再试」，妈妈在厨房喊：谁动我手机了？", "The phone on the coffee table says “Disabled. Try again in 1 hour.” Mom shouts from the kitchen: who touched my phone?"),
      t("两人互相问刚才在干什么，谁离茶几最近。", "Grill each other about what you were doing and who was closest to the coffee table."),
      t("手机解锁以后，两人抢着解释那句「那张千万别发」是谁打的。", "When the phone unlocks, scramble to explain who typed “Do NOT post that one.”"),
      t("最后两人一起对妈妈撒个娇，求她别生气。", "Finish by sweet-talking Mom together so she won't be mad."),
    ],
    roles: [
      r(t("瘫在沙发上懒洋洋的，一紧张就坐直。", "Sprawled lazily on the sofa; sit bolt upright when nervous."), t("「我一直在看电视，遥控器都没离过手。」", "“I've been watching TV the whole time. I never let go of the remote.”")),
      r(t("抱着作业本，说话很乖，眼睛一直瞄手机。", "Hugging your homework, extra polite, eyes on the phone."), t("「我在房间写作业呢，你看，我都写到第五题了。」", "“I was doing homework. Look, I'm already on question five.”")),
    ],
  },
  "family-new-car-scratch": {
    beats: [
      t("两人站在爸爸的新车旁，看着车门上那道抹了指甲油的划痕。", "You both stand by Dad's new car, staring at the polish-covered scratch."),
      t("轮流说周末开车去了哪儿、停在哪儿，互相闻有没有指甲油味。", "Take turns saying where you drove and parked this weekend; sniff each other for nail polish."),
      t("爸爸想起行车记录仪以后，两人一起找存储卡，越找越慌。", "Once Dad remembers the dashcam, search for the memory card together, getting more and more panicked."),
      t("最后两人一起对爸爸说一句保证。", "Finish with both of you making Dad one solemn promise."),
    ],
    roles: [
      r(t("装得很成熟，说话慢条斯理，手一直插在兜里。", "Play it cool and grown-up, speak slowly, hands stuck in your pockets."), t("「我就去机场接了个朋友，来回都开得特别小心。」", "“I just did an airport run. I drove super carefully both ways.”")),
      r(t("刚拿驾照很得意，一被怀疑就急得跺脚。", "Proud of your new licence; stamp your foot the moment you're suspected."), t("「我练停车可认真了，一次线都没压！」", "“I practised parking perfectly. I didn't touch a single line!”")),
    ],
  },
  "show-rehearsal-leak": {
    beats: [
      t("两人打开手机，看到彩排视频播放破万，愣在原地。", "You both open your phones, see the rehearsal at ten thousand views, and freeze."),
      t("轮流查对方手机：私密动态、相册、小号，越查越像对方干的。", "Check each other's phones (stories, camera roll, secret accounts); each looks guiltier than the last."),
      t("主办方宣布宣传大使以后，两人都想当，又都不敢承认。", "After the ambassador announcement, both of you want the title but can't admit to the video."),
      t("最后两人合唱一句，看谁先跑调。", "Finish by singing one line together and see who goes off key first."),
    ],
    roles: [
      r(t("说话像唱歌，情绪起伏很大，一激动就捂胸口。", "Speak almost in song, big mood swings, hand on heart when upset."), t("「我的歌！我写了三个月的歌！谁发出去的？」", "“My song! Three months I spent on that song! Who posted it?”")),
      r(t("一边说一边比划动作停不下来，手机攥得紧紧的。", "Dance a little while you talk, can't keep still, phone clenched tight."), t("「我录视频只是为了练动作，我发誓！」", "“I only film to practise the moves, I swear!”")),
    ],
  },
  "love-library-letter": {
    beats: [
      t("两人整理还书时，小说里掉出一封情书，一起念出抬头。", "Sorting returns, a love letter falls out of a novel; you read the greeting out loud together."),
      t("互相猜是谁写的，对比彼此的字迹和常用的笔。", "Guess who wrote it; compare each other's handwriting and favourite pens."),
      t("窗边那个人约见面以后，两人都假装不在乎，又都想去。", "After the person by the window proposes a meeting, both pretend not to care and both want to go."),
      t("最后两人各写一句「回信」，大声念出来。", "Finish by each “writing” one line of reply and reading it aloud."),
    ],
    roles: [
      r(t("说话轻声细语，动作很规矩，一看到紫色就紧张。", "Soft library voice, very orderly; flinch at anything purple."), t("「嘘，图书馆里要小声……这是什么？一封信？」", "“Shh, library voice... what's this? A letter?”")),
      r(t("抱着一摞书，老往窗边看，一被问就脸红。", "Hugging a stack of books, glancing at the window; blush when questioned."), t("「我、我只是因为周三人少，才来帮忙的。」", "“I-I just come Wednesdays because it's quiet.”")),
    ],
  },
  "crime-porch-package": {
    beats: [
      t("两人在门廊碰面，看到门口空了，房东的快递不见了。", "You meet on the porch: the landlord's package is gone."),
      t("轮流说那二十分钟自己在干什么，互相找对方故事里的破绽。", "Take turns saying what you did in those twenty minutes, poking holes in each other's story."),
      t("门铃摄像头的录像出来以后，两人比一比那只袖子像谁的。", "When the doorbell clip comes in, compare whose sleeve it looks like."),
      t("最后两人一起给房东「发一条消息」，大声念出来。", "Finish by “texting” the landlord together, reading it aloud."),
    ],
    roles: [
      r(t("戴着耳机在家上班，说话快，老拿手机看时间。", "Work-from-home headset on, fast talker, checking the time on your phone."), t("「我一直在开视频会议，窗外什么都没注意。」", "“I was on a video call the whole time. Didn't notice a thing outside.”")),
      r(t("假装用毛巾擦着湿头发，一听到鸡叫就大声咳嗽盖过去。", "Rub your “wet” hair with an imaginary towel; cough loudly whenever anything clucks."), t("「我在洗澡，水声那么大，什么都听不见。」", "“I was in the shower. With the water running, I couldn't hear a thing.”")),
    ],
  },
  "palace-decree-extra-stroke": {
    beats: [
      t("两人在工地展开圣旨，工匠们欢呼「赏银千两」，两人脸色都变了。", "You unroll the decree at the building site; the builders cheer “a thousand!” and both your faces fall."),
      t("轮流说圣旨从写好到送到经过了哪些地方，互相检查对方的手和袖子。", "Retrace the decree's journey from brush to building site, checking each other's hands and sleeves."),
      t("皇上要亲自宣读以后，两人都想把圣旨抢过来再看一遍。", "Once the emperor wants to read it himself, both of you grab for one more look at the scroll."),
      t("最后一起跪下，各给皇上一个解释。", "Finish by kneeling and each offering the emperor your explanation."),
    ],
    roles: [
      r(t("说话文绉绉，手指沾着墨，袖子一直往里收。", "Speak in flowery formal phrases, inky fingers, sleeves tucked in tight."), t("「这道圣旨是臣一笔一画亲手写的，绝无差错。」", "“Your servant wrote every stroke himself. There is no mistake.”")),
      r(t("声音尖细，走小碎步，一提到封口就慌。", "High thin voice, tiny quick steps; panic whenever the seal is mentioned."), t("「圣旨到——！工匠们，快来接旨！」", "“Imperial decree! Builders, come and receive it!”")),
    ],
  },
  "family-banquet-lobster": {
    beats: [
      t("服务员说龙虾已经上了，可八号桌的盘子是空的，大姨举着手机拍空盘子。", "The waiter says the lobster's been served, but table eight's plate is empty. Auntie photographs the empty plate."),
      t("三人互相看包、看手机、看桌牌，每人说自己刚才去了哪儿。", "Check each other's bags, phones and table cards; each says where they just were."),
      t("司仪宣布龙虾抽奖以后，三人一起去找龙虾的下落。", "Once the MC announces the lobster raffle, all three go hunting for it."),
      t("最后一起举杯祝福新人，每人说一句祝福，再加一句「不是我」。", "Finish with a toast to the couple: one blessing and one “it wasn't me” each."),
    ],
    roles: [
      r(t("声音大、爱指挥，什么都要拍照，手提包抱得紧紧的。", "Loud and bossy, photographing everything, handbag clamped tight."), t("「服务员！我们八号桌的龙虾呢？我都准备好拍照了！」", "“Waiter! Where's table eight's lobster? I had my camera ready!”")),
      r(t("坐不住，一会儿站起来一会儿坐下，嘴里还含着甜品。", "Can't sit still, up and down, mouth full of dessert."), t("「我就去拿了个甜品，回来龙虾就没了！」", "“I went for one dessert and the lobster was gone!”")),
      r(t("很客气，谁都不认识，一直低头打字。", "Overly polite, knows nobody, keeps typing on your phone."), t("「不好意思，我是新娘的同学，我什么都没看见……」", "“Sorry, I'm the bride's friend from school. I didn't see anything...”")),
    ],
  },
  "show-magic-rabbit": {
    beats: [
      t("魔术师念完咒语揭开帽子，里面是个毛绒玩具，全场安静。", "The magician says the magic words and lifts the hat: a stuffed toy. Total silence."),
      t("魔术师硬说这是魔术的一部分，另外两人帮忙找兔子。", "The magician insists it's part of the act while the other two search for the rabbit."),
      t("小朋友要听歌以后，三个人轮流唱一句。", "When the child demands a song, take turns singing a line each."),
      t("最后魔术师宣布「兔子回来了」，大家一起鞠躬谢幕。", "Finish with the magician declaring “The rabbit is back!” and everyone taking a bow."),
    ],
    roles: [
      r(t("动作夸张，披风一甩一甩，说话像在念咒语。", "Huge gestures, cape swishing, everything said like a spell."), t("「各位观众，见证奇迹的时刻到了！」", "“Ladies and gentlemen, prepare to be amazed!”")),
      r(t("一直在找兔子，蹲下看桌子底下，嘴里叫着「兔兔」。", "Hunt for the rabbit, crouch under tables, softly calling “bunny, bunny.”"), t("「兔兔？兔兔你在哪儿？我给你带了胡萝卜！」", "“Bunny? Where are you, bunny? I brought you a carrot!”")),
      r(t("很配合，配合得过头，每句话都像背过的。", "Very helpful, too helpful; every line sounds rehearsed."), t("「哇！好神奇！我刚才完全没看出来！」", "“Wow! Amazing! I had no idea how you did that!”")),
    ],
  },
  "office-printer-cats": {
    beats: [
      t("两人走进办公室，打印机还在一张接一张地吐猫的照片。", "You walk into the office and the printer is still spitting out cat photos, one after another."),
      t("一个人想关打印机，一个人拦着说要先查记录，两人抢着按按钮。", "One tries to switch it off, the other insists on checking the logs first; you fight over the buttons."),
      t("老板要把照片裱起来以后，两人都说这只猫是自己家的。", "After the CEO wants the photo framed, both of you claim it's your cat."),
      t("最后一起把猫照片举起来，每人夸这只猫一句。", "Finish by holding up a cat photo together and each paying the cat a compliment."),
    ],
    roles: [
      r(t("动作麻利，一边捡纸一边念叨，抽屉护得紧紧的。", "Brisk, gathering paper and muttering, guarding your drawer."), t("「一大早的，这打印机疯了吗？」", "“It's eight in the morning. Has this printer lost its mind?”")),
      r(t("说话很专业，术语一大堆，其实什么都不懂。", "Sound very technical, lots of jargon, actually know nothing."), t("「别动，这是驱动程序的问题，我来看看日志。」", "“Don't touch it. It's a driver issue. Let me check the logs.”")),
    ],
  },
  "love-three-blind-dates": {
    beats: [
      t("三个人坐在同一张桌子前，都说自己是来相亲的。", "Three people end up at the same table, each claiming to be the blind date."),
      t("每人拿出「证据」（照片、聊天记录、预约短信），轮流考对方问题。", "Each produces “proof” (a photo, a chat, a booking text) and quizzes the others."),
      t("相亲对象回来说是行业交流以后，三人一起装作在谈生意。", "When the date returns and calls it a networking lunch, all three pretend to talk business."),
      t("最后每人对相亲对象说一句最有魅力的话。", "Finish with each of you giving the date your most charming line."),
    ],
    roles: [
      r(t("坐得笔直，一直看表，说话客气又有点紧张。", "Sit bolt upright, keep checking the time, polite and a bit nervous."), t("「我提前半小时就到了，我才是约好的那一位。」", "“I got here half an hour early. I'm the one who was invited.”")),
      r(t("捧着花很得意，说话像飞机上的广播。", "Proudly holding the roses; talk like a pilot making an announcement."), t("「各位好，这束花是送给我的相亲对象的。」", "“Good afternoon, everyone. These roses are for my date.”")),
      r(t("一直往嘴里塞点心，时不时偷看隔壁桌。", "Keep popping dim sum in your mouth and glancing at the next table."), t("「菜我都点好了，你们要不要尝尝虾饺？」", "“I've already ordered. Want to try the shrimp dumplings?”")),
    ],
  },
  "palace-dowager-cricket": {
    beats: [
      t("太监打开笼子准备喂蛐蛐，发现笼子空了，吓得大叫。", "The keeper opens the cage to feed the cricket, finds it empty, and shrieks."),
      t("三个人在屋里到处找，每人说自己昨晚在干什么。", "All three search the room, each saying what they did last night."),
      t("屋里响起蛐蛐叫以后，大家轮流学蛐蛐叫，找声音从哪儿来。", "When chirping fills the room, take turns imitating it to find where it's coming from."),
      t("最后一起跪下，向太后保证明天一定把蛐蛐找回来。", "Finish by kneeling together and swearing to the dowager the cricket will be back by tomorrow."),
    ],
    roles: [
      r(t("声音尖，动作碎，抱着空笼子快要哭出来。", "High-pitched and fidgety, hugging the empty cage, close to tears."), t("「我的大将军！我的大将军不见了！」", "“My General! My little General is gone!”")),
      r(t("低着头说话，非常小心，一提到王爷就紧张。", "Speak with your head bowed, very careful; tense whenever the prince comes up."), t("「奴婢今早来喂的时候，笼子就已经空了。」", "“When I came to feed it this morning, the cage was already empty.”")),
      r(t("嘴上说最爱虫子，一听见虫叫就往后跳。", "Say you adore insects; leap back every time something chirps."), t("「我最喜欢虫子了，我来帮忙找！（往后退）」", "“I love insects! Let me help look! (backs away)”")),
    ],
  },
  /* ---------------------------------------------------------------- second batch: hard all-ages, easy spicy */
  "love-anniversary-gift": {
    beats: [
      t("女朋友举着香水从车里出来，当着两个人的面问这是给谁的。", "The girlfriend marches out of the car holding the perfume and asks, in front of both of them, who it's for."),
      t("男朋友解释香水的来历，闺蜜在旁边打圆场。", "The boyfriend explains where it came from while the best friend tries to smooth things over."),
      t("反转以后，大家开始猜「老地方」到底是哪里。", "After the twist, everyone starts guessing where “the usual place” is."),
      t("最后每人说一句话，证明自己没有劈腿。", "To finish, one line each to prove you're not the cheat."),
    ],
    roles: [
      r(t("举着香水不放，越问越大声，眼眶有点红。", "Won't let go of the perfume, gets louder with every question, eyes a little red."), t("「这瓶香水，你给我解释清楚。」", "“Explain this perfume. Right now.”")),
      r(t("笑得很尴尬，一直挠头，回答前先看闺蜜一眼。", "Awkward grin, keeps scratching your head, glances at the best friend before every answer."), t("「这、这是给我妈的生日礼物啊！」", "“It's, uh, it's for my mom's birthday!”")),
      r(t("抱着蛋糕当挡箭牌，一直说「大家冷静」，眼睛老往后备箱瞟。", "Holding the cake like a shield, telling everyone to calm down, eyes drifting to the trunk."), t("「好啦好啦，今天是纪念日，先吃蛋糕好不好？」", "“Okay, okay, it's your anniversary! Cake first, maybe?”")),
    ],
  },
  "office-missing-bonus": {
    beats: [
      t("财务发现箱子里少了最厚的红包，老板把大家叫到会议室。", "Finance discovers the fattest envelope is gone, and the boss calls everyone into the meeting room."),
      t("每个人说说今天什么时候靠近过那个柜子。", "Everyone says when they went near the cabinet today."),
      t("反转以后，大家开始猜是谁在箱子前蹲了三分钟。", "After the twist, everyone wonders who was crouching by the box."),
      t("最后每人说一句话，证明红包不在自己身上。", "To finish, one line each to prove the envelope isn't on you."),
    ],
    roles: [
      r(t("背着手来回踱步，一提奖金多少就打哈哈。", "Pacing with your hands behind your back; laugh it off whenever the bonus amounts come up."), t("「今年的红包可是我自掏腰包！谁拿了，自己交出来。」", "“Those bonuses came out of my own pocket! Whoever took it, hand it over.”")),
      r(t("抱着账本，说话一字一顿，一提钥匙就紧张。", "Clutching the ledger, slow and precise; tense whenever keys come up."), t("「箱子一直锁着，钥匙一直在我身上……基本上。」", "“The box was locked, and the key never left me… mostly.”")),
      r(t("缩着脖子，什么都想说又不敢说，怀里抱着一摞纸。", "Shoulders hunched, dying to say something but not daring to, hugging a stack of paper."), t("「我是最后一个走的，但我真的什么都没拿！」", "“I was the last to leave, but I swear I didn't take anything!”")),
      r(t("嗓门大，自信爆棚，三句话不离业绩。", "Loud and supremely confident; every third sentence is about your sales numbers."), t("「最厚的那个本来就该是我的，我还用得着偷？」", "“The fattest one was mine anyway. Why would I need to steal it?”")),
    ],
  },
  "crime-mansion-wine": {
    beats: [
      t("灯亮了，有人发现古董红酒被倒进了花盆，大家都围过来。", "The lights come back, someone spots the vintage wine in the plant pot, and everyone gathers round."),
      t("每个人说说灭灯那十秒自己在哪里、在干什么。", "Everyone says where they were and what they were doing in those ten seconds."),
      t("反转以后，大家开始检查每个人的袖口。", "After the twist, everyone starts checking each other's cuffs."),
      t("最后每人说一句话，给自己一个完美的不在场证明。", "To finish, everyone gives themselves one perfect alibi."),
    ],
    roles: [
      r(t("站得笔直，说话慢条斯理，一提酒窖就清嗓子。", "Standing ramrod straight, speaking slowly and properly; clear your throat whenever the cellar comes up."), t("「先生的酒，我保管了三十年，从没出过差错。」", "“I have looked after this house's wine for thirty years without a single mistake.”")),
      r(t("吊儿郎当，手机不离手，一有人提钱就变脸。", "Slouching, phone always in hand; your face changes whenever money comes up."), t("「我爸的酒？我才不稀罕喝那玩意儿。」", "“Dad's wine? I wouldn't even want to drink that stuff.”")),
      r(t("很专业，不停地提醒大家别刺激老爷，自己却最紧张。", "Very professional, constantly warning everyone not to upset the old man, while being the most nervous person there."), t("「大家小声点，他的心脏可经不起这么折腾。」", "“Everyone keep it down. His heart can't take this kind of excitement.”")),
    ],
  },
  "family-heirloom-receipt": {
    beats: [
      t("有人把花瓶翻过来，发现底下粘着一张昨天的退货小票。", "Someone turns the vase over and finds yesterday's return receipt stuck to the bottom."),
      t("每个人说说这周自己碰过花瓶没有、拿它干过什么。", "Everyone says whether they touched the vase this week, and what for."),
      t("反转以后，大家争着描述真花瓶的裂纹，越说越对不上。", "After the twist, everyone competes to describe the real crack, and none of the stories match."),
      t("最后每人说一句话，在长辈来之前统一口径，或者甩锅。", "To finish, one line each to get your story straight before the elder arrives, or to pass the blame."),
    ],
    roles: [
      r(t("一直拿袖子擦花瓶，谁靠近就护住。", "Keep polishing the vase with your sleeve, and shield it from anyone who comes near."), t("「这花瓶我锁了二十年，谁都没碰过！」", "“I've kept this vase locked up for twenty years. Nobody's touched it!”")),
      r(t("举着相机拿照片跟花瓶比来比去，越比越皱眉。", "Holding up your camera to compare the photos with the vase, frowning more each time."), t("「我昨天刚拍的特写，你们看……怎么不太一样？」", "“I took close-ups yesterday. Look… hang on, that's not quite right.”")),
      r(t("说话像鉴宝节目，什么都报个价，被问细节就打岔。", "Talk like an antiques-show expert, put a price on everything, change the subject if pressed for details."), t("「这釉色，这包浆，起码值这个数。」", "“This glaze, this patina… we're looking at five figures, easy.”")),
      r(t("很勤快，一直在收拾东西，一提包装盒就心虚。", "Very busy, always tidying something; go shifty whenever the box comes up."), t("「搬家的时候我可小心了，每个箱子都是我亲手搬的。」", "“I was super careful during the move. I carried every box myself.”")),
    ],
  },
  "family-ex-seating": {
    beats: [
      t("有人举着座位表进来：前任俩被排在了点着心形蜡烛的双人桌。", "Someone storms in waving the seating chart: the two exes are at a tiny table with heart-shaped candles."),
      t("三个人互相质问，每个人都说座位表不是自己改的。", "The three organizers grill each other; each swears they didn't change the chart."),
      t("反转以后，大家赶紧想办法再加两个座位。", "After the twist, everyone scrambles to find two more seats."),
      t("最后每人说一句话，提出自己的座位方案。", "To finish, everyone pitches their own seating plan in one line."),
    ],
    roles: [
      r(t("乐呵呵的，什么问题都说「吃顿饭就好了」，一数座位就慌。", "Cheerful, convinced dinner fixes everything; panic whenever anyone counts the seats."), t("「哎呀，大家坐下来吃一顿，什么都好说嘛！」", "“Oh, come on, once everyone's eating, it'll all work out!”")),
      r(t("抱着座位表不放，嘴上说早放下了，手机却捂得紧紧的。", "Clutching the seating chart, saying it's all in the past, while hiding your phone screen."), t("「那都是多少年前的事了，我早就不记得了。」", "“That was years ago. I barely even remember it.”")),
      r(t("一直摆弄蜡烛，说什么都是餐厅送的，眼睛不敢看人。", "Fiddling with the candles, insisting the restaurant threw them in, avoiding eye contact."), t("「蜡烛是餐厅送的！我就是顺手摆一下。」", "“The candles came free with the booking! I just put them out.”")),
    ],
  },
  "love-rainy-umbrella": {
    beats: [
      t("雨伞一抖，四张票掉在地上，两个朋友正好出现在门口。", "The umbrella shakes open, four tickets fall out, and two friends appear at the door."),
      t("每个人解释自己为什么会在这里，票又是怎么回事。", "Everyone explains why they're here and what's going on with the tickets."),
      t("反转以后，大家发现空位多出一堆，开始抢着邀请别人。", "After the twist, everyone realizes there are seats to spare and starts inviting people."),
      t("最后每人说一句话，说说今晚原本的打算。", "To finish, one line each about what you really had planned tonight."),
    ],
    roles: [
      r(t("很想保持浪漫，可一直把票藏在手心里。", "Desperate to keep it romantic, hiding the tickets in your palm."), t("「今晚就我们两个人，我保证！」", "“Tonight is just the two of us, I promise!”")),
      r(t("很深情，可总忍不住低头看自己的手心。", "Deeply sincere, but you keep glancing down at your palm."), t("「我有一些话，想在今晚……呃……对你说。」", "“There's something I've been wanting to tell you tonight… um…”")),
      r(t("甩着雨伞装路过，手老是缩在袖子里。", "Shaking off an umbrella like you just happened by, hands tucked up your sleeves."), t("「好巧啊！我就是进来躲个雨。」", "“What a coincidence! I'm just ducking in out of the rain.”")),
      r(t("嘴上说最讨厌凑热闹，背包却鼓鼓的，逮着人就想聊。", "Claim to hate crowds, but your backpack is stuffed and you keep trying to start a conversation."), t("「我本来没打算来的，真的。」", "“I wasn't even going to come, honestly.”")),
    ],
  },
  "love-key-under-pot": {
    beats: [
      t("有人挪花盆时发现底下有一把写着「老地方」的钥匙，三个人都愣住了。", "Someone moves the plant pot and finds a key tagged “our usual place”. All three freeze."),
      t("每个人猜这把钥匙是谁的，旧账一笔一笔翻出来。", "Everyone guesses whose key it is, and old history starts coming out."),
      t("反转以后，大家开始吵这笔仓储费该谁出。", "After the twist, everyone argues over who should pay the storage bill."),
      t("最后每人说一句话：自己是不是真的放下了。", "To finish, one line each: are you really over it?"),
    ],
    roles: [
      r(t("很努力地装作不在乎，一直说「我早就翻篇了」。", "Trying very hard to look like you don't care; keep saying “I've moved on.”"), t("「我们早就结束了，这把钥匙跟我没关系。」", "“We're done. That key has nothing to do with me.”")),
      r(t("抱着箱子说马上就走，脚却一步都没动。", "Holding a box, saying you're leaving any second, not moving an inch."), t("「东西还完我就走，真的，就五分钟。」", "“I'll just drop this off and go. Five minutes, tops.”")),
      r(t("对每个抽屉都熟门熟路，谁问话都先笑一笑。", "Know every drawer by heart; smile before answering anything."), t("「这个柜子？我知道，这里面以前放的是……没什么。」", "“This cabinet? Oh, that used to hold… never mind.”")),
    ],
  },
  "office-remote-beach": {
    beats: [
      t("视频会议一开始，海浪声一阵一阵传出来，背景全变成了海边度假屋。", "The video call starts, waves keep crashing through someone's mic, and every background is a beach house."),
      t("每个人都说自己的网络和设备没问题，互相要求打开摄像头。", "Everyone insists their setup is fine and demands that the others turn their cameras on."),
      t("反转以后，客户突然进来了，大家赶紧装专业。", "After the twist, the client is suddenly there and everyone scrambles to look professional."),
      t("最后每人说一句话，向客户汇报今天的进度。", "To finish, everyone gives the client a one-line project update."),
    ],
    roles: [
      r(t("坐得笔直，从来不站起来，一直催大家开摄像头。", "Sitting bolt upright, never standing, constantly telling everyone to turn their cameras on."), t("「所有人把摄像头打开，客户马上就到！」", "“Cameras on, everyone! The client joins in one minute!”")),
      r(t("一直在换背景，嘴上说马上就好，手忙脚乱。", "Constantly switching backgrounds, saying it's almost fixed, all thumbs."), t("「模板我来改，大家别动背景！」", "“I'll fix the template. Nobody touch your background!”")),
      r(t("说话断断续续，假装网卡，一听到「嘀」声就紧张。", "Talk in choppy bursts, pretend your connection is bad, flinch at every beep."), t("「喂？喂？我这边信号不太好……」", "“Hello? Hello? You're breaking up on my end…”")),
      r(t("满嘴专业名词，什么都说「十秒就好」，十秒过了还在说。", "Full of tech jargon, everything takes “ten seconds”, and you're still talking long after."), t("「小问题，我重启一下路由器，十秒就好。」", "“Easy fix. I'll just reboot the router. Ten seconds.”")),
    ],
  },
  "office-secret-reference": {
    beats: [
      t("两个人在打印机旁看到那封推荐信已经发进了全员群。", "The two of them watch the reference letter land in the company chat, right there by the printer."),
      t("互相质问：是不是你想把我送走？", "Each accuses the other of trying to push them out."),
      t("反转以后，两个人一起商量怎么回老板的消息。", "After the twist, the two have to work out together how to answer the boss."),
      t("最后每人说一句话：自己到底想不想走。", "To finish, one line each: do you actually want to leave?"),
    ],
    roles: [
      r(t("又委屈又生气，把手机举到对方面前，一提简历就转移话题。", "Hurt and angry, shoving your phone at the other person; change the subject whenever résumés come up."), t("「『适合更广阔的平台』？你什么意思？」", "“‘Ready for opportunities elsewhere’? What's that supposed to mean?”")),
      r(t("很镇定，笑里藏刀，一直挡在打印机前面。", "Calm, smiling through gritted teeth, always standing in front of the printer."), t("「换工作是个人选择，我可从来不管别人的事。」", "“Career moves are personal. I never get involved in other people's business.”")),
    ],
  },
  "crime-library-last-page": {
    beats: [
      t("主持人翻到最后，发现最后一页被撕掉了。", "The host turns to the end and finds the last page torn out."),
      t("每个人说说自己读到了哪里，怎么证明没看过结局。", "Everyone says how far they got and proves they never read the ending."),
      t("反转以后，大家开始给这本书编自己的结局。", "After the twist, everyone starts inventing their own ending for the book."),
      t("最后每人说一句话，宣布谁是真正的凶手：书里的，或者这屋里的。", "To finish, everyone names the real culprit: the one in the book, or the one in this room."),
    ],
    roles: [
      r(t("一本正经地主持，问题都很笼统，被追问细节就偷看封底。", "Very formal, asking vague questions; when pressed for details, sneak a look at the back cover."), t("「我们按章节来，第一章大家有什么感想？」", "“Let's go chapter by chapter. Thoughts on chapter one?”")),
      r(t("抱着书不让人碰，一直提醒大家别折书脊。", "Hugging the book, warning everyone not to bend the spine."), t("「小心！这是绝版，书脊不能折！」", "“Careful! It's out of print. Don't you dare crack that spine!”")),
      r(t("很得意，什么都说「我早猜到了」，手里攥着一块橡皮。", "Smug, say “I called it” about everything, clutching an eraser."), t("「凶手是谁，我第三章就猜到了。」", "“I figured out the killer by chapter three.”")),
      r(t("热情地发纸杯和书签，一直用东西挡着书的封面。", "Eagerly handing out cups and bookmarks, always covering the book with something."), t("「大家先喝点东西吧！我带了书签，一人一个。」", "“Drinks, everyone! And I brought bookmarks, one each!”")),
    ],
  },
  "crime-chalet-ransom": {
    beats: [
      t("有人发现装旅行基金的铁盒不见了，桌上只剩一张纸条。", "Someone notices the trip-fund tin is gone; only a note is left on the table."),
      t("三个人开始翻旧账：谁欠谁多少钱。", "The three start digging up old debts: who owes whom, and how much."),
      t("反转以后，大家发现吵的根本不是那个铁盒，开始道歉，或者吵得更凶。", "After the twist, everyone realizes it was never about the tin: apologies follow, or a bigger fight."),
      t("最后每人说一句话，提出这趟旅行的钱怎么算。", "To finish, everyone proposes how the trip money should be settled."),
    ],
    roles: [
      r(t("拿着小本子，每一笔都要念出来，念到去年就打住。", "Notebook in hand, reading out every entry, stopping suddenly whenever you reach last year."), t("「每一分钱我都记着，我们一笔一笔对。」", "“I've recorded every cent. Let's go through it line by line.”")),
      r(t("举着手机给大家看转账记录，手指一直挡着金额。", "Waving your phone to show the transfer, thumb covering the amount."), t("「我早就转账了，你们看，有记录的！」", "“I paid already! Look, it's right here!”")),
      r(t("很大方地说别计较，一提订房价格就看窗外。", "Generous, telling everyone not to sweat the small stuff; stare out the window whenever the booking price comes up."), t("「这房子是我好不容易抢到的，大家就别计较了。」", "“I fought hard to get this place, so let's not nickel-and-dime it.”")),
    ],
  },
  "palace-exam-blank-scroll": {
    beats: [
      t("三份答卷在朝堂上展开，全是白纸，满殿哗然。", "The three papers are unrolled before the court. All blank. Gasps."),
      t("每个人说说自己什么时候经手过答卷，当时封条是好的吗。", "Each says when they handled the papers and whether the seals were intact."),
      t("反转以后，三个人只好对着白纸讲治国之道。", "After the twist, all three must explain the blank pages' grand vision for the empire."),
      t("最后每人说一句话，向皇上表明自己的清白。", "To finish, everyone declares their innocence to the emperor."),
    ],
    roles: [
      r(t("捋着胡子，说话很有学问，一被问评语就打太极。", "Stroking an imaginary beard, very learned, dodging every question about the feedback."), t("「臣阅卷三十年，好文章一眼便知。」", "“In thirty years of marking, I've always known genius at a glance.”")),
      r(t("说话小心翼翼，一直强调墨色，眼睛老往卷堆里瞟。", "Very cautious, going on about shades of ink, eyes drifting to the pile of scrolls."), t("「每一卷的墨色，臣都记得清清楚楚。」", "“I remember the ink on every paper, Your Majesty. Every shade.”")),
      r(t("站得笔直，说话简短，一提封条就紧张地咽口水。", "At attention, short answers, gulping nervously whenever the seals come up."), t("「卑职一路寸步不离，封条完好无损！」", "“I never left the scrolls, Your Majesty! Every seal was perfect!”")),
    ],
  },
  "palace-cold-palace-menu": {
    beats: [
      t("有人举着告示进来：冷宫成了养生别院，预约簿已经满了。", "Someone comes in waving the notice: the cold palace is a wellness retreat, and the booking list is full."),
      t("三个人互相盘问：告示是谁贴的，名单在谁手里。", "The three grill each other: who posted it, and who has the list?"),
      t("反转以后，大家得赶紧准备今晚的养生讲座。", "After the twist, everyone has to throw together tonight's wellness lecture."),
      t("最后每人说一句话，给太后推荐一个养生项目。", "To finish, everyone pitches the dowager one wellness activity."),
    ],
    roles: [
      r(t("抱着名册，说话利落，谁要看账簿就挡住。", "Clutching the register, brisk and efficient, blocking anyone who wants to see the ledger."), t("「各院名册都在我这儿，冷宫从来没人住过。」", "“Every residence is in my register. Nobody has ever stayed in the cold palace.”")),
      r(t("很忙的样子，说每间房都有用处，身上有股糕点味。", "Act very busy, insist every room has a purpose; you smell faintly of cake."), t("「冷宫的房间？都有用处，都有用处！」", "“The cold palace rooms? They're all in use! All of them!”")),
      r(t("拿着清单挨个数房间，数到某一间就支支吾吾。", "Counting rooms off a list, faltering every time you reach one particular room."), t("「奉旨清点，一间一间来，谁也别想糊弄我。」", "“By royal order, we count every room. Nobody fools me.”")),
    ],
  },
  "show-cooking-score": {
    beats: [
      t("主持人宣布最高分：一杯白开水，全场愣住。", "The host announces the top score: a glass of tap water. Stunned silence."),
      t("每个人说说评分表在自己手里时做了什么。", "Everyone explains what they did with the scoring sheet."),
      t("反转以后，大家得现场重做这杯白开水，还要讲出门道。", "After the twist, the team has to remake the water live and explain the technique."),
      t("最后每人说一句话，替这杯水，或者替自己辩护。", "To finish, everyone defends the water, or themselves, in one line."),
    ],
    roles: [
      r(t("吸着鼻子，说话很权威，下判断前先偷看别人的表情。", "Sniffling, very authoritative; sneak a look at everyone's face before you decide anything."), t("「我的舌头从来不会错。这杯水，有层次。」", "“My palate is never wrong. This water has layers.”")),
      r(t("护着盖碗不让人掀，一直找机会往碗里加东西。", "Guarding your covered dish, looking for any chance to slip something into it."), t("「我的菜要最后揭晓，谁也不准掀盖子！」", "“My dish is revealed last. Nobody lifts that lid!”")),
      r(t("手里换着三支笔，一边说话一边偷偷算数。", "Switching between three pens, doing sums under your breath while you talk."), t("「分数我算了三遍，绝对没错……再算一遍。」", "“I've checked the scores three times. Definitely right… let me check again.”")),
      r(t("每个盘子放在哪如数家珍，一提奖杯就打岔。", "Know where every plate goes; change the subject whenever the trophy comes up."), t("「每个盘子放哪儿我都清楚，绝对没放错。」", "“I know where every single plate goes. Nothing's out of place.”")),
    ],
  },
  "show-secret-sponsor": {
    beats: [
      t("直播一结束，大家看到回放结尾那句赞助广告，全愣了。", "The stream ends, and everyone sees the sponsorship line at the end of the replay."),
      t("三个人互相追问：广告是谁加的，钱进了谁的账户。", "The three demand answers: who added the ad, and whose account is the money going to?"),
      t("反转以后，大家开始担心这对会不会复合。", "After the twist, everyone starts worrying the couple might get back together."),
      t("最后每人说一句话，对着镜头发一条新声明。", "To finish, everyone gives the camera a new one-line statement."),
    ],
    roles: [
      r(t("努力保持体面，说话又慢又伤感，一翻小抄就露馅。", "Trying to stay dignified, slow and mournful; every time you check your notes, it slips."), t("「我只想安安静静地告别，为什么要加广告？」", "“I just wanted a dignified goodbye. Why is there an ad?”")),
      r(t("一直强调真实，说话像在开会，一提倒计时就清嗓子。", "Always stressing authenticity, talking like it's a meeting; clear your throat whenever the countdown comes up."), t("「我们的内容一向百分之百真实。」", "“Our content has always been one hundred percent authentic.”")),
      r(t("很护着主角，手机一直扣着，偶尔偷看一眼。", "Fiercely protective of your friend, phone face-down, sneaking the odd glance."), t("「我是来陪你的，不是来蹭热度的！」", "“I'm here for you, not for the views!”")),
    ],
  },
  "family-lipstick-collar": {
    beats: [
      t("董事长切蛋糕时，大家看到领口上的口红印，全场安静。", "As the chairman cuts the cake, everyone spots the lipstick on his collar. Silence."),
      t("三个人各说各的：今晚谁离董事长最近。", "The three each explain who was closest to the chairman tonight."),
      t("反转以后，大家盯着那支口红，开始比色号。", "After the twist, everyone stares at the lipstick and starts comparing shades."),
      t("最后每人说一句话，向夫人证明自己的清白。", "To finish, everyone convinces the wife of their innocence in one line."),
    ],
    roles: [
      r(t("很干练，什么行程都记得，一提口红就抿嘴。", "Polished and efficient, remember every appointment; press your lips together whenever lipstick comes up."), t("「董事长今天的每一分钟，我都安排得清清楚楚。」", "“I scheduled every minute of the chairman's day. Every minute.”")),
      r(t("精神十足，动不动就秀肌肉，眼睛却一直在观察每个人。", "Full of energy, flexing at every opportunity, but quietly watching everyone."), t("「董事长最近瘦了十斤，全是我的功劳！」", "“The chairman's down ten pounds, and that's all me!”")),
      r(t("很热情，一直拍董事长的肩膀，说话有点太激动。", "Very warm, clapping the chairman on the shoulder, a bit too excited."), t("「老同学！我们多少年没见了，今天真高兴！」", "“My old friend! How many years has it been? What a night!”")),
    ],
  },
  "office-boardroom-earring": {
    beats: [
      t("老板举着耳环和便利贴走进来，要大家说清楚昨晚谁在会议室。", "The boss walks in holding the earring and the sticky note, demanding to know who was in the boardroom last night."),
      t("每个人说说昨晚几点走的，进没进过会议室。", "Everyone says what time they left last night and whether they went into the boardroom."),
      t("反转以后，大家开始比谁唱歌跑调。", "After the twist, everyone starts testing who sings off key."),
      t("最后每人说一句话，建议老板怎么处理，或者为什么该放过。", "To finish, everyone tells the boss how to handle it, or why to let it go."),
    ],
    roles: [
      r(t("什么八卦都知道，说话前先左右看看，一提会议室就打哈欠。", "Know every rumour, glance around before speaking, yawn whenever the boardroom comes up."), t("「我跟你们说，昨晚我好像看到……算了，不说了。」", "“Okay, so last night I think I saw… no, forget it.”")),
      r(t("戴着耳机，回答很短，一看到便利贴上的字就紧张。", "Headphones on, short answers; tense the moment you see the handwriting on the note."), t("「我昨晚一直在写代码，到十二点，有提交记录的。」", "“I was coding till midnight. It's all in the commit history.”")),
      r(t("很会说话，一直摸自己的耳朵，一提视频就转移话题。", "Smooth talker, keep touching your ears, change the subject whenever video calls come up."), t("「耳洞是我周末打的，跟这只耳环一点关系都没有。」", "“I got my ears pierced at the weekend. That earring has nothing to do with me.”")),
    ],
  },
  "show-final-night-texts": {
    beats: [
      t("编导把两条一模一样的短信摆出来，问是谁发的。", "The director lays out the two identical texts and asks who sent them."),
      t("每个人说说今晚手机在谁手上，自己心里喜欢的是谁。", "Everyone says who had their phone tonight, and who they really like."),
      t("反转以后，两位收到短信的嘉宾进来当面对质。", "After the twist, the two contestants who got the texts walk in to confront everyone."),
      t("最后每人说一句话，宣布明天的选择。", "To finish, everyone announces tomorrow's choice in one line."),
    ],
    roles: [
      r(t("很会撩人，说话甜甜的，一被问短信就看向别处。", "Flirty and charming, sweet voice; look away whenever the texts come up."), t("「我这个人很专一的，大家都知道。」", "“Everyone knows I'm a one-person kind of person.”")),
      r(t("很紧张，一直喝水，说话前先清嗓子，三句话不离奶茶。", "Nervous, gulping water, clearing your throat before every line, somehow always mentioning bubble tea."), t("「我、我是来找真爱的……顺便也欢迎来我店里喝奶茶。」", "“I'm, um, here to find true love… and also, come try my bubble tea.”")),
      r(t("抱着一筐手机，说话像在指挥现场，一提投票就咳嗽。", "Holding a basket of everyone's phones, talking like you're running the set; cough whenever voting comes up."), t("「所有人的手机都在我这儿，谁也别想抵赖。」", "“I've got everyone's phones right here. Nobody's getting out of this.”")),
    ],
  },
  "office-recalled-message": {
    beats: [
      t("有人把那条撤回消息的通知截图投到大屏幕上，大家都看见了。", "Someone puts a screenshot of the notification up on the big screen. Everyone's seen it."),
      t("每个人说说那两分钟自己在干什么，手机在哪里。", "Everyone says what they were doing during those two minutes and where their phone was."),
      t("反转以后，大家开始想办法躲开周五上台剪头发。", "After the twist, everyone tries to get out of cutting the boss's hair on Friday."),
      t("最后每人说一句话，夸一夸老板的发型。", "To finish, everyone compliments the boss's hair in one line."),
    ],
    roles: [
      r(t("说话很有权威，一直说能查到记录，手机屏幕总是扣着。", "Speak with authority, keep saying you can pull the records, phone always face-down."), t("「群里的每一条消息，我都能查到。」", "“I can see every message in that chat. Every single one.”")),
      r(t("很随和，一只手一直按着桌上的文件夹，一提画画就笑。", "Easygoing, one hand pressed flat on a folder; laugh whenever drawing comes up."), t("「我就是爱画点小漫画，跟那条消息可没关系。」", "“I just like doodling. That's got nothing to do with the message.”")),
      r(t("打字飞快，说话也快，一提开会就开始翻手机。", "Typing fast, talking fast; start scrolling your phone whenever the meeting comes up."), t("「我一上午都在跟客户聊，哪有空发这种东西？」", "“I've been messaging clients all morning. Who has time for that?”")),
    ],
  },
  "crime-halloween-ballot-box": {
    beats: [
      t("主人把票箱倒出来：票比人还多，一半写着那只南瓜狗。", "The host empties the ballot box: more votes than guests, half of them for the pumpkin dog."),
      t("每个人说说今晚有没有碰过票箱，顺便显摆自己的装扮。", "Everyone says whether they touched the box tonight, while showing off their costume."),
      t("反转以后，大家突然都不想赢了，开始抢着给别人拉票。", "After the twist, suddenly nobody wants to win, and everyone campaigns for someone else."),
      t("最后每人说一句话，提名今晚的最佳装扮。", "To finish, everyone nominates the night's best costume."),
    ],
    roles: [
      r(t("甩着披风，说话阴森森的，一有人提衣柜就把披风裹紧。", "Swishing your cape, speaking in a spooky voice; wrap the cape tighter whenever closets come up."), t("「我的装扮这么完美，还用得着作弊？」", "“With a costume this perfect, why would I need to cheat?”")),
      r(t("说话含含糊糊，一直整理绷带，看到别人的装扮就躲。", "Mumbling through the bandages, constantly adjusting them, ducking whenever another costume walks by."), t("「（含糊地）我一直站在角落里，什么都没干。」", "“(muffled) I've been standing in the corner all night. Didn't do anything.”")),
      r(t("一直守着糖果碗，说话尖声尖气，谁伸手拿糖就拦住。", "Guarding the candy bowl, cackling, blocking anyone who reaches for the candy."), t("「嘿嘿嘿，谁要吃糖？……等等，先别吃。」", "“Heh heh heh, who wants candy? …Actually, wait. Not yet.”")),
    ],
  },
  "family-mahjong-red-dragon": {
    beats: [
      t("姨妈去洗手间了，三个人围着牌桌找那张红中。", "Auntie's gone to the bathroom; the three search the mahjong table for the red dragon."),
      t("每个人说说刚才摸过哪些牌，互相检查袖子。", "Everyone says which tiles they just handled, and they check each other's sleeves."),
      t("反转以后，大家明白真的那张还没找到，开始互相盯着。", "After the twist, everyone realizes the real tile is still missing and starts watching each other."),
      t("最后每人说一句话，向姨妈保证自己是清白的。", "To finish, everyone swears their innocence to Auntie."),
    ],
    roles: [
      r(t("一直唉声叹气，抱怨今晚手气差，眼睛老往别人的牌上瞟。", "Sighing nonstop about your bad luck, eyes always drifting to other people's tiles."), t("「我今晚输得最多，我藏它干什么？」", "“I've lost the most tonight. Why would I hide it?”")),
      r(t("装作什么都不懂，说话很乖，一提钱就打岔。", "Playing clueless and sweet; change the subject whenever money comes up."), t("「我连红中是哪张都不太认识……」", "“I don't even know which one the red dragon is…”")),
      r(t("很客气，一直说自己是来凑数的，一提饺子就两眼放光。", "Very polite, say you're only here to make up the numbers; your eyes light up at the word dumplings."), t("「我就是来凑一桌的，输赢都无所谓。」", "“I'm just here to make up the table. Win or lose, who cares?”")),
    ],
  },
  "show-ktv-perfect-score": {
    beats: [
      t("打分机给最跑调的那首打了一百分，大家面面相觑。", "The scoring machine gives the most off-key song a hundred. Everyone stares at each other."),
      t("每个人说说今晚碰没碰过打分机，再唱两句证明实力。", "Everyone says whether they touched the machine tonight, and sings a couple of lines to prove themselves."),
      t("反转以后，谁都不想拿一百分了，开始互相推。", "After the twist, nobody wants the perfect score anymore, and everyone pushes it onto someone else."),
      t("最后每人唱一句，跑调也行，再说一句结束。", "To finish, everyone sings one line, off key is fine, and says one last word."),
    ],
    roles: [
      r(t("抱着话筒不放，说话也像在唱，一被要求清唱就找借口。", "Never let go of the mic, even your talking sounds like singing; find an excuse whenever asked to sing unaccompanied."), t("「这一百分是我的实力，不服来比！」", "“That hundred is pure talent. Want to go head to head?”")),
      r(t("跟谁都很熟，一直招呼大家吃果盘，一提生日就打哈哈。", "Friends with everyone, pushing the fruit platters, laughing it off whenever birthdays come up."), t("「来来来，吃水果！这都是店里送的。」", "“Come on, have some fruit! It was on the house.”")),
      r(t("一直说自己不会唱，偷偷跟着哼，哼得还挺准。", "Insist you can't sing, then hum along quietly, and it's actually pretty good."), t("「我五音不全，我就坐着听。」", "“I'm tone-deaf. I'll just sit here and listen.”")),
    ],
  },
  "love-secret-santa-letter": {
    beats: [
      t("有人拆礼物时掉出一封情书，主人捡起来要当众念。", "A love letter falls out of a gift, and the host picks it up to read aloud."),
      t("每个人说说自己送了什么礼物，又是怎么抽到对象的。", "Everyone says what gift they gave and how they drew their person."),
      t("反转以后，全场尴尬，大家开始互相怀疑。", "After the twist, the room goes awkward and everyone suspects everyone."),
      t("最后每人说一句话，对这屋里最喜欢的人说点什么。", "To finish, everyone says one thing to their favourite person in the room."),
    ],
    roles: [
      r(t("很热情地张罗，一提抽签就紧张地笑。", "Busy and enthusiastic, laughing nervously whenever the draw comes up."), t("「抽签绝对公平，我闭着眼睛抽的！」", "“The draw was totally fair. I picked with my eyes closed!”")),
      r(t("一进门就道歉，一直解释礼物是精心准备的。", "Apologizing from the moment you walk in, insisting your gift was carefully chosen."), t("「对不起来晚了！礼物我挑了好久的。」", "“Sorry I'm late! I spent ages picking this out.”")),
      r(t("很温柔，说话轻轻的，一看到围巾就脸红。", "Gentle and soft-spoken; blush whenever anyone holds up a scarf."), t("「礼物嘛，心意最重要。」", "“It's the thought that counts, really.”")),
    ],
  },
  "office-hot-pot-both-spicy": {
    beats: [
      t("有人尝了一口清汤，辣得跳起来：鸳鸯锅两边全红了。", "Someone tastes the mild side and leaps up coughing: both halves of the pot are red."),
      t("每个人说说刚才谁动过锅，自己在干什么。", "Everyone says who touched the pot and what they were doing."),
      t("反转以后，大家发现客户特别能吃辣，开始抢着表现。", "After the twist, the client turns out to love spice, and everyone scrambles to impress."),
      t("最后每人说一句话，给客户敬一杯。", "To finish, everyone raises a glass to the client in one line."),
    ],
    roles: [
      r(t("急得团团转，一会儿看表一会儿看锅，一提生日就慌。", "Running in circles, checking your watch, then the pot; panic whenever birthdays come up."), t("「客户十分钟就到！谁把清汤弄辣的？」", "“The client's here in ten minutes! Who ruined the mild side?”")),
      r(t("很乖，一直帮大家倒水，肚子吃得圆滚滚的。", "Very helpful, pouring everyone water, stomach noticeably full."), t("「菜是我点的，可是锅底我真的没碰！」", "“I ordered the food, but I swear I didn't touch the broth!”")),
      r(t("一直举着手机拍锅底，手里攥着一双筷子不放。", "Filming the pot nonstop, a pair of chopsticks clutched in your hand."), t("「我就拍了几张照片，这红油颜色多好看啊。」", "“I just took a few photos. Look at the color on that chili oil.”")),
      r(t("嘴特别甜，什么都说「正宗」，被问店里的事就答不上来。", "Silver-tongued, everything is “authentic”; you can't answer a single question about the restaurant."), t("「这家店我常来，绝对正宗！……洗手间在哪？」", "“I come here all the time, it's the real deal! …Where's the restroom again?”")),
    ],
  },
  "crime-night-market-recipe": {
    beats: [
      t("摊主一回来就发现秘方卡不见了，把四个人都拦下。", "The owner comes back, finds the recipe card gone, and stops all four from leaving."),
      t("每个人说说最忙那一小时自己在摊位干了什么。", "Everyone says what they were doing at the stall during the rush."),
      t("反转以后，大家开始抢着做鱼蛋，争取奶奶的认可。", "After the twist, everyone rushes to make fishballs and win Grandma's approval."),
      t("最后每人说一句话，夸一夸，或者贬一贬这家的鱼蛋。", "To finish, everyone praises, or knocks, the fishballs in one line."),
    ],
    roles: [
      r(t("一直说这家鱼蛋被吹过头了，嘴角却沾着咖喱。", "Keep saying these fishballs are overrated, with curry sauce on your lip."), t("「他家的鱼蛋？一般般啦，我家的才好吃。」", "“Their fishballs? Meh. Mine are better.”")),
      r(t("举着手机对着每个人拍，说话像在录视频。", "Phone pointed at everyone, talking like you're recording."), t("「家人们！秘方失踪了！今天的视频有料了！」", "“Hey guys! The secret recipe is gone! Today's video is going to be wild!”")),
      r(t("一边招呼客人一边偷吃，被看见就假装在试味道。", "Serving customers while sneaking bites; when caught, pretend you're taste-testing."), t("「我一直在忙着出餐，根本没空碰抽屉！」", "“I was slammed with orders the whole time! I didn't go near the drawers!”")),
      r(t("跟摊主一家很亲，一直在夸，手里拎着一袋礼物。", "Close to the family, gushing nonstop, holding a bag of gifts."), t("「我天天来，这家就跟我自己家一样。」", "“I'm here every night. This place is like family to me.”")),
    ],
  },
  "palace-silent-firecrackers": {
    beats: [
      t("一串又一串鞭炮点不响，有人拆开一看，全是纸卷。", "String after string fizzles. Someone unrolls one: just paper."),
      t("每个人说说这批鞭炮在自己手里时发生了什么。", "Everyone explains what happened while the firecrackers were in their hands."),
      t("反转以后，大家开始抢着认功劳，或者推给别人。", "After the twist, everyone rushes to take the credit, or pin it on someone else."),
      t("最后每人说一句话，给皇上拜一个安静的年。", "To finish, everyone wishes the emperor a very quiet New Year."),
    ],
    roles: [
      r(t("很讲究礼数，说话文绉绉，一提采买单就擦汗。", "Obsessed with protocol, flowery speech, mopping your brow whenever the order form comes up."), t("「今夜的仪式，臣准备了整整三个月。」", "“I spent three whole months preparing tonight's ceremony.”")),
      r(t("手上还沾着面粉，一直说饺子，一提火药就转移话题。", "Flour still on your hands, always talking about dumplings; change the subject whenever gunpowder comes up."), t("「奴才一晚上都在包饺子，你们看这手！」", "“I've been folding dumplings all night! Look at my hands!”")),
      r(t("站得笔直，说话简短，一提站岗就打哈欠。", "At attention, short answers; yawn whenever guard duty comes up."), t("「库房钥匙一直在末将身上，谁也进不去！」", "“The storeroom key never left me. Nobody got in!”")),
      r(t("神神叨叨，掐指一算，一副早就知道的样子。", "Mystical and cryptic, counting on your fingers, acting like you saw it all coming."), t("「臣早就算到，今年是个安静的年。」", "“I foresaw this. The stars said it would be a quiet year.”")),
    ],
  },
  "love-ktv-dedication": {
    beats: [
      t("点歌屏上滚出那条留言，三个人愣在原地。", "The dedication scrolls across the screen and the three of them freeze."),
      t("每个人说说今晚点了什么歌，把手机给大家看。", "Everyone says what songs they requested tonight and shows their phone."),
      t("反转以后，大家开始担心这首歌真被唱出来。", "After the twist, everyone panics about the song actually being sung."),
      t("最后每人说一句话，把一首歌献给一个人。", "To finish, everyone dedicates a song to someone in one line."),
    ],
    roles: [
      r(t("很会张罗，一直催大家唱歌，一提前任就清嗓子。", "The organizer, pushing everyone to sing; clear your throat whenever exes come up."), t("「谁点的？今晚可是寿星的生日局！」", "“Who sent that? It's the birthday night!”")),
      r(t("一直对着手机傻笑，被叫到名字才抬头。", "Grinning at your phone, only looking up when someone says your name."), t("「啊？什么留言？我刚才在回消息。」", "“Huh? What dedication? I was just replying to a message.”")),
      r(t("很客气，跟谁都不熟，一看到服务员就低头。", "Very polite, barely know anyone; duck your head whenever staff walk by."), t("「我第一次来，谁都不认识，跟我没关系吧？」", "“It's my first time with you guys. That can't be about me, right?”")),
    ],
  },
  "family-envelope-old-flame": {
    beats: [
      t("收礼金的人打开那个特别厚的红包，念出上面那行字。", "The gift-box keeper opens the extra-thick envelope and reads the note aloud."),
      t("每个人说说今晚有没有看到谁往礼金箱里放红包。", "Everyone says whether they saw anyone drop an envelope in the box."),
      t("反转以后，新娘读到了那行字，大家赶紧打圆场。", "After the twist, the bride reads the note, and everyone scrambles to cover."),
      t("最后每人说一句话，给新人送上祝福。", "To finish, everyone gives the couple a one-line toast."),
    ],
    roles: [
      r(t("抱着礼金箱不放，说话很严肃，一提零钱就看表。", "Hugging the gift box, very serious; check your watch whenever loose change comes up."), t("「这个红包……厚得有点不正常。」", "“This envelope is… suspiciously thick.”")),
      r(t("一直举着相机，说话时镜头总往某一位客人那边飘。", "Camera always up; while you talk, the lens keeps drifting to one guest."), t("「今晚每一个瞬间我都拍下来了，谁放的红包，照片里都有。」", "“I caught every moment tonight. Whoever left that envelope, it's in my photos.”")),
      r(t("手里攥着一张餐巾纸，嘴里念念有词，一被叫到就慌。", "Clutching a napkin, muttering to yourself; panic whenever someone calls your name."), t("「我、我等会儿还要上台致辞呢……稿子……没问题。」", "“I'm, um, giving a speech later… the speech is… totally fine.”")),
    ],
  },
  "office-secret-santa-mugs": {
    beats: [
      t("老板拿着情侣杯笑着走开了，三个人看着桌上的包装纸。", "The boss walks off laughing with the mugs; the three stare at the wrapping paper."),
      t("每个人说说这份礼物经过了谁的手。", "Everyone works out whose hands the gift passed through."),
      t("反转以后，老板的爱人拿着杯子来问，大家赶紧打圆场。", "After the twist, the boss's spouse comes asking about the mugs, and everyone scrambles to explain."),
      t("最后每人说一句话，解释这份礼物的「真正意思」。", "To finish, everyone explains what the gift “really” meant."),
    ],
    roles: [
      r(t("很能干，礼物全是自己买的，包一直抱在怀里。", "Very capable, bought everything yourself, bag clutched to your chest."), t("「所有礼物都是我包的，但卡片可不是我写的！」", "“I wrapped every gift, but I didn't write the tags!”")),
      r(t("很拘谨，一直看手机上的时间，一提面试就紧张。", "Stiff and nervous, checking the time on your phone; tense whenever interviews come up."), t("「我才来两周，谁都不熟，真的不是我。」", "“I've only been here two weeks. I don't know anyone. It wasn't me.”")),
      r(t("什么都见过，说话慢悠悠的，一看到卡片就皱着眉回忆。", "Seen it all, speak slowly; frown trying to remember whenever you look at the tag."), t("「在公司十年，这种事我见多了……这字怎么有点眼熟？」", "“Ten years here, I've seen it all… why does this handwriting look familiar?”")),
    ],
  },
  "show-couple-account-single": {
    beats: [
      t("后台三个人看到那条动态，赶紧冲到电脑前。", "The three backstage see the post and rush to the computer."),
      t("每个人说说今天谁登录过账号，密码在哪。", "Everyone says who logged into the account today and where the password is."),
      t("反转以后，大家看到第一条私信，全愣住了。", "After the twist, everyone sees the first DM and freezes."),
      t("最后每人说一句话，给粉丝写一条澄清声明。", "To finish, everyone drafts a one-line statement for the fans."),
    ],
    roles: [
      r(t("很强势，一直说只有自己有密码，一提合同就打岔。", "Domineering, insist only you have the password; change the subject whenever contracts come up."), t("「账号密码只有我知道，一定是被盗了！」", "“I'm the only one with the password. We've been hacked!”")),
      r(t("抱着手机不放，说什么都是「备份」，眼神飘忽。", "Clutching your phone, everything is “just a backup”, eyes darting."), t("「素材都在我手机里，可是账号我从来不碰。」", "“All the footage is on my phone, but I never touch the account.”")),
      r(t("大大咧咧，一直把手背到身后，说自己什么密码都记不住。", "Breezy and scatterbrained, keep your hands behind your back, swear you can't remember any password."), t("「密码？我连自己的密码都记不住！」", "“The password? I can't even remember my own!”")),
    ],
  },
  "palace-portrait-mole": {
    beats: [
      t("掌事姑姑打开画像，发现最美的那位脸上多了一颗大黑痣。", "The head maid unrolls the portraits and finds a big black mole on the favourite's face."),
      t("每个人说说昨晚有没有进过放画像的屋子。", "Everyone says whether they went into the portrait room last night."),
      t("反转以后，大家得连夜给每张画像都点上痣。", "After the twist, everyone has to paint a mole on every portrait overnight."),
      t("最后每人说一句话，夸夸自己画像上那颗痣。", "To finish, everyone praises the mole on their own portrait."),
    ],
    roles: [
      r(t("很优雅，笑得很甜，一提画像好不好看就摸自己的脸。", "Graceful, sweet smile; touch your own face whenever anyone mentions how the portraits look."), t("「姐姐的画像怎么会这样？真是太可惜了。」", "“Oh, her portrait? What a terrible shame.”")),
      r(t("举着画笔比划，很爱面子，一提眼睛就紧张。", "Gesturing with your brush, very proud; tense whenever eyes come up."), t("「每一张画像都是我的心血，谁敢动我的画？」", "“Every portrait is my life's work. Who dares touch my paintings?”")),
      r(t("板着脸，说话很有威严，一直摸着腰间的钥匙。", "Stern face, commanding voice, always fingering the keys at your waist."), t("「画像一直锁在我这儿，钥匙只有我有。」", "“The portraits were locked away with me. I hold the only key.”")),
    ],
  },
  /* ---------------------------------------------------------------- third batch: hard spicy */
  "palace-poisoned-soup": {
    beats: [
      t("太医当众宣布汤里被人加了料，皇上捂着肚子让所有经手的人跪下。", "The physician announces the soup was tampered with; the emperor, clutching his stomach, orders everyone who touched it to kneel."),
      t("每个人说说这碗汤到自己手里时是什么样，又交给了谁。", "Each person describes the soup when it reached them, and who they passed it to."),
      t("反转以后，大家开始互相闻胭脂味、看头发。", "After the twist, everyone starts sniffing for rouge and checking each other's hair."),
      t("最后每人跪着说一句话，求皇上明察。", "To finish, everyone kneels and begs the emperor for justice in one line."),
    ],
    roles: [
      r(t("娇滴滴的，委屈得快哭了，一有人怀疑就搬出皇上的宠爱。", "Sweet and wounded, close to tears; bring up the emperor's favour the moment anyone doubts you."), t("「皇上，这汤是臣妾亲手为您熬的，臣妾怎么会害您？」", "“Your Majesty, I made this soup for you with my own hands. How could I ever hurt you?”")),
      r(t("怯生生的，头低着，一直捂着胸口藏东西。", "Timid, head bowed, one hand always pressed to your chest hiding something."), t("「臣妾刚进宫三天，什么都不懂……」", "“I've only been at court three days. I don't understand any of this…”")),
      r(t("弯着腰，声音尖细，谁都不得罪，一提银子就咳嗽。", "Bowing low, thin high voice, offending no one; cough whenever silver comes up."), t("「奴才只是把汤端上来，一路上谁都没碰过！」", "“I only carried the bowl in. Nobody touched it on the way!”")),
      r(t("吓得发抖，一直盯着那只碗，一提碗就结巴。", "Trembling, eyes fixed on the bowl, stammering whenever it's mentioned."), t("「奴婢看着汤熬好的，一点都没离开过！」", "“I watched that soup the whole time it cooked. I never left it!”")),
    ],
  },
  "family-downpayment-envelope": {
    beats: [
      t("有人发现资助信上的收款名字被改了，饭桌一下安静下来。", "Someone notices the name on the gift letter has been changed, and the dinner table goes quiet."),
      t("每个人说说自己什么时候看过那封信，看完放在哪了。", "Everyone says when they looked at the letter and where they put it afterwards."),
      t("反转以后，谁都不想当收款人了，开始互相推。", "After the twist, suddenly nobody wants to be the recipient, and everyone pushes it onto someone else."),
      t("最后每人说一句话，说说这笔钱应该给谁。", "To finish, everyone says in one line who should get the money."),
    ],
    roles: [
      r(t("满脸期待，三句话不离新家，一提贷款就转移话题。", "Glowing with excitement, every other line about the new place; change the subject whenever mortgages come up."), t("「窗帘我都挑好了，这钱本来就是给我的呀！」", "“I've already picked the curtains! That money was meant for me!”")),
      r(t("抱着文件夹不撒手，说话一板一眼，谁要翻就挡住。", "Never letting go of the folder, strictly by the book, blocking anyone who tries to look inside."), t("「文件一直在我这儿，谁也没动过。」", "“The documents have been with me the whole time. Nobody's touched them.”")),
      r(t("很热情，一直强调「一家人要公平」，眼神一直在找开口的时机。", "Very warm, always stressing that family should be fair, eyes searching for the right moment."), t("「一家人嘛，这种好事应该人人有份。」", "“We're family. Something this good should be shared by everyone.”")),
      r(t("举着手机到处拍，说话像在做节目，一被看手机就藏起来。", "Filming everything, talking like a TV host; hide the phone whenever anyone wants to see it."), t("「我每一页都拍下来了，证据全在这儿！」", "“I photographed every page. The evidence is all right here!”")),
    ],
  },
  "family-will-parking": {
    beats: [
      t("主持人宣读文件，念出来的却是停车位转让书，全家炸了锅。", "The chair reads out the document, and it's a parking-space transfer. The family explodes."),
      t("每个人说说这封信这几天经过了谁的手。", "Everyone traces whose hands the letter passed through this week."),
      t("反转以后，大家发现吵了半天的是道具，开始抢那个真停车位。", "After the twist, everyone realizes they've been fighting over a prop, and starts fighting over the very real parking space."),
      t("最后每人说一句话，说说长辈散步回来以前大家该怎么收场。", "To finish, everyone suggests in one line how to tidy this up before the elder gets back from the walk."),
    ],
    roles: [
      r(t("坚持按辈分发言，一着急就敲桌子，手机屏幕死死扣着。", "Insisting everyone speak in family order, tapping the table when things heat up, phone screen firmly face-down."), t("「按规矩来，长幼有序，一个一个说！」", "“We do this properly. In order of age, one at a time!”")),
      r(t("一直说替长辈收信很辛苦，怀里抱着一叠信不放。", "Going on about how hard it is to collect the elder's mail, a stack of letters clutched to your chest."), t("「这家里的信，每天都是我收的，我最清楚。」", "“I collect every letter that comes to this house. I know best.”")),
      r(t("觉得自己最委屈，一直数这些年开车接送了多少趟。", "Feeling the most hard done by, counting every ride you've given over the years."), t("「这些年谁天天开车接送？停车位不给我给谁？」", "“Who's driven everyone around for years? If not me, who gets the spot?”")),
      r(t("在视频里拿着打印件逐字核对，说话老卡顿，还假装网不好。", "On video, checking printouts word by word, freezing mid-sentence and blaming the connection."), t("「等一下，我这边的打印件……第三页第二行不对啊。」", "“Hold on, my printout… page three, line two doesn't match.”")),
    ],
  },
  "love-wedding-plus-one": {
    beats: [
      t("主持人对着宾客表，把四个人的伴侣都念成了同一位前任。", "The host reads the guest list aloud: all four plus-ones are the same ex."),
      t("每个人说说自己有没有改过共享表格，和那位前任又是什么关系。", "Everyone says whether they edited the shared spreadsheet, and what their history with the ex is."),
      t("反转以后，大家开始担心前任真带着新对象来。", "After the twist, everyone panics that the ex really will show up with their new partner."),
      t("最后每人说一句话，提出明天婚礼怎么救场。", "To finish, everyone proposes in one line how to save tomorrow's wedding."),
    ],
    roles: [
      r(t("强撑着笑，一直说「零意外」，一提前任就整理头发。", "Forcing a smile, repeating “zero surprises”, fixing your hair whenever the ex comes up."), t("「明天必须零意外，这张表到底谁动的？」", "“Tomorrow has to go perfectly. Who touched this spreadsheet?”")),
      r(t("抱着平板不放，说什么都要看表格，谁往右滑就拦住。", "Clutching the tablet, checking the spreadsheet for everything, stopping anyone who scrolls right."), t("「表格不会撒谎，问题一定出在别人那儿。」", "“Spreadsheets don't lie. The problem is somewhere else.”")),
      r(t("一直在练介绍词，越练越乱，念错名字就假装咳嗽。", "Rehearsing introductions nonstop, getting more muddled, coughing whenever you say the wrong name."), t("「没关系，尴尬的场面我最会处理了！」", "“Don't worry, awkward moments are my specialty!”")),
      r(t("一直说自己只是传话的，手机却一直在震。", "Insisting you're only the messenger, while your phone won't stop buzzing."), t("「我就是帮忙传个话，其他的我什么都不知道。」", "“I'm just passing messages along. I don't know anything else.”")),
    ],
  },
  "love-honeymoon-refund": {
    beats: [
      t("服务员端上第一道菜，两个前任同时问：退款怎么变成了晚餐？", "The first course arrives and both exes ask at once: how did the refund turn into dinner?"),
      t("每个人说说退款经过了自己哪一步。", "Everyone explains their part in the refund."),
      t("反转以后，大家开始算这顿饭到底谁买单。", "After the twist, everyone starts arguing over who's paying for this dinner."),
      t("最后每人说一句话，向两位前任交代清楚。", "To finish, everyone owes the two exes one honest line."),
    ],
    roles: [
      r(t("一直强调只要拿回本金，一提旅行价格就喝水。", "Repeating that you only want the original amount back; take a sip of water whenever the trip's price comes up."), t("「我不要别的，把我的钱还给我就行。」", "“I don't want anything else. Just give me my money back.”")),
      r(t("说最讨厌浪费，手机一响就手忙脚乱地按掉。", "Claiming to hate waste; scramble to silence your phone every time it plays something."), t("「这顿饭太浪费了，我是来讲道理的。」", "“This dinner is such a waste. I'm here to be reasonable.”")),
      r(t("一直在两边传截图，说话很快，一提手续费就打岔。", "Passing screenshots back and forth, talking fast, dodging any question about fees."), t("「截图我都发给你们了，流程完全没问题！」", "“I sent you both the screenshots. The process was totally fine!”")),
      r(t("穿得特别隆重，一直在劝和，眼睛老往其中一位身上看。", "Dressed to the nines, playing peacemaker, eyes always drifting to one of the exes."), t("「大家都是朋友，好好吃顿饭，什么都能聊开。」", "“We're all friends here. A nice dinner, and we can talk it all through.”")),
    ],
  },
  "office-promotion-toast": {
    beats: [
      t("投影一打开，两个名字同时出现在升职贺词上，会议室一片哗然。", "The slide goes up with two names on the same promotion. The room erupts."),
      t("每个人说说今天有没有碰过那份贺词，又为什么准备了获奖感言。", "Everyone says whether they touched the slide today, and why they had an acceptance speech ready."),
      t("反转以后，谁都不想要这个位子了，开始互相谦让。", "After the twist, suddenly nobody wants the job, and everyone politely offers it to someone else."),
      t("最后每人说一句话，发表自己的「获奖感言」。", "To finish, everyone gives their one-line acceptance speech."),
    ],
    roles: [
      r(t("满口团队精神，笑得很灿烂，一提猎头就看手机。", "All about teamwork, beaming; check your phone whenever recruiters come up."), t("「这份荣誉属于整个团队，当然，也属于我。」", "“This honour belongs to the whole team. And, of course, to me.”")),
      r(t("很谦虚，一直说不争功，手里攥着一份报告。", "Very modest, insisting you never take credit, clutching a report."), t("「我从来不争这些，是大家非要推我。」", "“I never chase these things. Everyone kept pushing me forward.”")),
      r(t("一直强调绝对公平，越解释越心虚，一提投票就擦汗。", "Insisting the process was fair, getting shiftier the more you explain; mop your brow whenever voting comes up."), t("「选拔过程绝对公平，我可以对天发誓。」", "“The selection was completely fair. I swear on my life.”")),
      r(t("抱着正式公告不放，说话很官方，一提涨薪就打太极。", "Holding the official announcement, speaking in HR language, dodging any question about the raise."), t("「正式公告在我这儿，投影上的不算数。」", "“The official announcement is right here. The slide doesn't count.”")),
    ],
  },
  "office-expense-yacht": {
    beats: [
      t("供应商的催款电话打进来，大家才发现报销单上有一笔游艇订金。", "The supplier calls about payment, and that's when everyone spots the yacht deposit on the expense sheet."),
      t("每个人说说自己签字时看到的是什么，批的又是什么。", "Everyone says what they saw when they signed, and what they thought they were approving."),
      t("反转以后，大家开始争谁该去那个停车场边上的「游艇」。", "After the twist, everyone argues over who has to go to the “yacht” by the car park."),
      t("最后每人说一句话，提出团建到底怎么办。", "To finish, everyone proposes in one line what to do about the team event."),
    ],
    roles: [
      r(t("一直讲艰苦朴素，一提日程就转移话题。", "Preaching austerity nonstop; change the subject whenever the schedule comes up."), t("「我们团建，一向是盒饭就够了！」", "“Our team events have always been boxed lunches, and that's plenty!”")),
      r(t("拿着放大镜看每张小票，一算数就停不下来。", "Examining every receipt like a detective, unable to stop once you start doing sums."), t("「每一张小票我都看过，绝不可能漏掉一艘船。」", "“I've checked every receipt. There's no way I missed a boat.”")),
      r(t("跟谁都很熟，电话一直响，一提宣传照就紧张。", "Friends with everyone, phone always ringing; tense whenever publicity photos come up."), t("「供应商是我老朋友，我去跟他们说说。」", "“The supplier's an old friend. Let me talk to them.”")),
      r(t("很想有排面，说话很兴奋，一提纪念品就脸红。", "Desperate to impress, very excited; blush whenever souvenirs come up."), t("「第一次团建嘛，总得有点排面！」", "“It's our first team event! It should feel special!”")),
    ],
  },
  "crime-auction-empty-frame": {
    beats: [
      t("预展的灯一亮，大家看到画框里空空的，只有一张便条。", "The preview lights come up on an empty frame and a single note."),
      t("每个人说说自己什么时候一个人留在过这间屋子。", "Everyone says when they were alone in the room."),
      t("反转以后，大家得重新解释自己为什么出那么高的价。", "After the twist, everyone has to explain all over again why they bid so high."),
      t("最后每人说一句话，替自己的眼光辩护。", "To finish, everyone defends their taste in one line."),
    ],
    roles: [
      r(t("嗓门洪亮，什么都要报个价，一提别的拍品就咳嗽。", "Booming voice, putting a price on everything; cough whenever other lots come up."), t("「起拍价已经喊出去了，画呢？画去哪了？」", "“I've already called the opening bid. Where's the painting?”")),
      r(t("站在空画框前一脸深情，一提前任就转身。", "Gazing at the empty frame with deep feeling; turn away whenever exes come up."), t("「这幅画……对我来说意义不一样。」", "“That painting… means something different to me.”")),
      r(t("对画框的每个机关都很熟，谁要检查就挡住。", "Know every fastening on the frame; block anyone who wants to inspect it."), t("「这个画框我亲手修的，绝对结实。」", "“I repaired that frame myself. It's rock solid.”")),
      r(t("一直提自己的神秘买家，打电话时声音压得很低。", "Always mentioning your mysterious buyer; drop your voice whenever you're on the phone."), t("「我的买家可是大人物，今晚就等着这幅画。」", "“My buyer is a very important person, and they're expecting this painting tonight.”")),
    ],
  },
  "crime-manor-recording": {
    beats: [
      t("录音突然提前响起，接着有人发现保险柜的密码提示被擦掉了。", "The recording plays early, and then someone notices the safe's password hint has been wiped."),
      t("每个人说说录音响起时自己在哪，有没有碰过保险柜。", "Everyone says where they were when the recording played, and whether they touched the safe."),
      t("反转以后，大家明白录音是假的，借条却是真的，开始紧张起来。", "After the twist, everyone realizes the recording was fake but the IOUs are real, and starts to sweat."),
      t("最后每人说一句话，对主人表忠心。", "To finish, everyone pledges loyalty to the owner in one line."),
    ],
    roles: [
      r(t("突然特别关心主人的身体，说话亲热得过头，一直翻那张关系图。", "Suddenly very concerned for the owner's health, overly affectionate, always unfolding your family tree."), t("「我最关心的就是老人家的身体，钱不钱的无所谓。」", "“All I care about is their health. Money doesn't matter to me.”")),
      r(t("拿着日程本，说话一丝不苟，一提邀约就翻页。", "Holding the diary, meticulous, flipping pages whenever invitations come up."), t("「主人所有的日程都是我安排的，从没出过错。」", "“I manage every appointment for the owner. Never a mistake.”")),
      r(t("什么都要书面证据，说话像在法庭，手里的文件一直在改。", "Demanding written proof for everything, talking like it's a courtroom, quietly amending your documents."), t("「口说无凭，请出示书面证据。」", "“Words mean nothing. Show me something in writing.”")),
      r(t("一直说自己最不在乎钱，口袋里却揣着一团纸。", "Insisting money means nothing to you, with a crumpled paper in your pocket."), t("「我跟他是几十年的老朋友，钱算什么？」", "“We've been friends for decades. What's money between friends?”")),
    ],
  },
  "palace-jade-betrothal": {
    beats: [
      t("三份婚书摆在一起，上面画的是同一块玉佩，满殿哗然。", "Three marriage agreements are laid side by side, all showing the same jade pendant. Uproar."),
      t("每个人说说自己经手的那份婚书是从哪来的。", "Everyone explains where their copy of the agreement came from."),
      t("反转以后，四个人只好当场开始调解，越调越乱。", "After the twist, the four have to start mediating on the spot, and make it worse."),
      t("最后每人说一句话，提出这块玉佩该归谁。", "To finish, everyone proposes in one line who should get the pendant."),
    ],
    roles: [
      r(t("端庄严肃，护着印盒不让人碰，一提印泥颜色就紧张。", "Dignified and stern, guarding the seal box; tense whenever ink colour comes up."), t("「每一份婚书的印，都是我亲手盖的。」", "“I stamped every agreement with my own hand.”")),
      r(t("急得团团转，一直催着赶紧定下来，一提谢礼就打哈哈。", "Running in circles, pushing to settle it now; laugh it off whenever gifts come up."), t("「这门亲事今天必须定下来，不能再拖了！」", "“This match must be settled today. We can't wait any longer!”")),
      r(t("说话文绉绉，什么都说「有备案」，拿着拟稿的手一直在抖。", "Flowery and formal, everything is “on file”; the hand holding your draft won't stop shaking."), t("「每一份文书，礼部都有备案，绝无差错。」", "“The ministry has every document on file. There can be no mistake.”")),
      r(t("跑得满头大汗，路线说得颠三倒四，一提茶楼就笑。", "Sweating from all the running, describing your routes in a muddle; grin whenever teahouses come up."), t("「三份婚书都是我亲自送的，一份都没送错！」", "“I delivered all three myself. Not one went to the wrong house!”")),
    ],
  },
  "palace-vault-echo": {
    beats: [
      t("有人打开箱子，里面空空的，还响起了一阵掌声。", "Someone opens the chest: empty, and it plays a round of applause."),
      t("每个人说说自己什么时候用钥匙开过国库。", "Everyone says when they last used their key to the treasury."),
      t("反转以后，大家盯着箱子，等它喷彩纸，谁都不敢靠近。", "After the twist, everyone stares at the box waiting for the confetti, and nobody dares go near it."),
      t("最后每人说一句话，向皇上解释金子的下落。", "To finish, everyone explains to the emperor where the gold went."),
    ],
    roles: [
      r(t("一直说数字不会骗人，拿着账本算来算去，越算越慌。", "Insisting numbers never lie, recounting the ledger over and over, more panicked each time."), t("「数字不会骗人！我再算一遍……」", "“Numbers don't lie! Let me just count it again…”")),
      r(t("对每只箱子的重量如数家珍，身上沾着木屑。", "Rattling off the weight of every chest, with wood shavings on your sleeves."), t("「每只箱子多重，我闭着眼都能说出来。」", "“I could tell you every chest's weight with my eyes closed.”")),
      r(t("站得笔直，一直摸自己的新腰带，一提宫门就紧张。", "At attention, always touching your fancy new belt; tense whenever the palace gate comes up."), t("「末将寸步不离，没有人进过国库！」", "“I never left my post. Nobody entered the treasury!”")),
      r(t("架子很大，一直说自己只是来监督的，说话爱夸口。", "Very grand, insisting you're only here to observe, prone to boasting."), t("「本王只是来看看，国库的事，本王说了算。」", "“I'm merely observing. Though of course, the treasury answers to me.”")),
    ],
  },
  "show-reunion-cue": {
    beats: [
      t("提词板亮起来，要四个人同时向同一位前任道歉，全场尴尬。", "The cue boards light up telling all four to apologize to the same ex. Painfully awkward."),
      t("每个人说说自己和那位前任的过去，和台本是谁换的。", "Everyone shares their history with the ex, and who might have swapped the script."),
      t("反转以后，大家发现道歉道错了人，开始抢着收回。", "After the twist, everyone realizes they apologized to the wrong person and rushes to take it back."),
      t("最后每人说一句话，对着镜头做个了结。", "To finish, everyone gives the camera one line of closure."),
    ],
    roles: [
      r(t("一直说是来做个了结的，却一直在整理衣服。", "Insisting you're here for closure, while constantly adjusting your outfit."), t("「我今天来，就是想做个了结。」", "“I came today for one reason: closure.”")),
      r(t("说从没看过往季节目，却总能接上别人的台词。", "Swearing you never watched the old seasons, yet finishing everyone's lines."), t("「我真的没看过上一季，一集都没有。」", "“I honestly never watched last season. Not one episode.”")),
      r(t("一直强调不偏袒，笑容很职业，一提吃饭就咳嗽。", "Stressing your impartiality, professional smile; cough whenever dinners come up."), t("「我保证，今天绝对不偏袒任何人。」", "“I promise, I'm not taking anyone's side today.”")),
      r(t("随时准备总结金句，说话像在念情感语录。", "Always ready with a wise conclusion, talking like a self-help quote."), t("「爱情就像一面镜子，照见的都是自己。」", "“Love is a mirror. What you see is always yourself.”")),
    ],
  },
  "show-awards-envelope": {
    beats: [
      t("主持人打开第一个信封，里面是一张没写名字的领奖照，接着第二个、第三个也一样。", "The host opens the first envelope: an unnamed winner photo. Then the second, and the third."),
      t("每个人说说信封经过了自己哪一步，又为什么练了鞠躬。", "Everyone explains what they did with the envelopes, and why they've been practising their bows."),
      t("反转以后，大家开始比谁最会装作不想得奖。", "After the twist, everyone competes to look the least interested in winning."),
      t("最后每人说一句话，发表一段「不想得奖」的感言。", "To finish, everyone gives a one-line “I never wanted this” speech."),
    ],
    roles: [
      r(t("很会主持，介绍自己的时候特别长，一提获奖理由就念得飞快。", "A born MC; your own introduction goes on forever, but the award citations fly by."), t("「各位来宾，今晚的每个奖项都绝对公正！」", "“Ladies and gentlemen, every award tonight is completely fair!”")),
      r(t("嘴上说不在乎，眼睛一直盯着奖杯，一提车就紧张。", "Saying you don't care, eyes glued to the trophy; tense whenever your car comes up."), t("「得不得奖无所谓，重在参与。」", "“Winning doesn't matter. It's the taking part that counts.”")),
      r(t("抱着信封和名单，一直在打电话，一提赞助就看镜头。", "Clutching the envelopes and the list, always on the phone; glance at the camera whenever sponsors come up."), t("「信封和名单一直在我手里，流程没问题！」", "“The envelopes and the list never left me. The process is fine!”")),
      r(t("抱着评分册不放，说话很严肃，镜头一靠近就合上。", "Holding the scorebook tight, very serious; snap it shut whenever a camera gets close."), t("「每一分都是认真评的，评分册不能随便看。」", "“Every point was carefully judged. The scorebook isn't for public viewing.”")),
    ],
  },
  "love-wedding-eve-photo": {
    beats: [
      t("新娘把门关上，把那张照片举到大家面前。", "The bride shuts the door and holds the photo up for everyone to see."),
      t("每个人说说昨晚自己在哪，有没有去过那家酒店。", "Everyone says where they were last night, and whether they went to that hotel."),
      t("反转以后，大家开始猜围巾上那个字母是谁的。", "After the twist, everyone starts guessing whose initial is on the scarf."),
      t("最后每人说一句话，劝新娘明天的婚礼还办不办。", "To finish, everyone tells the bride in one line whether tomorrow should still go ahead."),
    ],
    roles: [
      r(t("一直在哭，紧紧握着新娘的手，一提新郎就脸红。", "Crying nonstop, clutching the bride's hand; blush whenever the groom comes up."), t("「你别怕，有我在，谁都别想欺负你。」", "“Don't be scared. I'm here. Nobody gets to hurt you.”")),
      r(t("很仗义，一直拍胸脯保证，一提酒店大堂就摸口袋。", "Loyal and loud, always vouching for the groom; pat your pockets whenever the hotel lobby comes up."), t("「我跟他住了四年，他绝对不是那种人！」", "“I roomed with him for four years. He is not that kind of guy!”")),
      r(t("拿着流程本，说话很专业，一提昨晚就欲言又止。", "Holding the run sheet, very professional; start to say something and stop whenever last night comes up."), t("「流程都是我和新郎对的，我最清楚他的行程。」", "“I've been going over everything with the groom. I know exactly where he's been.”")),
      r(t("很拘谨，一直把手插在米色外套口袋里，被看就笑。", "Awkward, hands jammed in the pockets of your beige coat; smile when anyone looks at you."), t("「我……我是最后才被邀请的，跟我没关系吧？」", "“I… I was only invited at the last minute. This can't be about me, right?”")),
    ],
  },
  "palace-garden-love-letter": {
    beats: [
      t("皇上举着情书走进来，冷冷地问：谁写的？", "The emperor walks in holding the letter and asks coldly: who wrote this?"),
      t("每个人说说刚才在园子里干什么，离贵妃有多近。", "Everyone says what they were doing in the garden, and how close they got to the consort."),
      t("反转以后，大家盯着贵妃，开始猜她回的是谁。", "After the twist, everyone stares at the consort and wonders who she replied to."),
      t("最后每人说一句话，向皇上表明心迹。", "To finish, everyone declares their loyalty to the emperor in one line."),
    ],
    roles: [
      r(t("站得笔直，说话简短，一提情诗就红了耳朵。", "At attention, short answers; your ears go red whenever love poems come up."), t("「卑职只负责保护娘娘，绝无二心！」", "“My only duty is to guard Her Highness. I have no other feelings!”")),
      r(t("说话很温和，一直摸着药箱，一提开药就紧张。", "Gentle voice, always touching your medicine box; tense whenever prescriptions come up."), t("「臣每日只是给娘娘请平安脉，别无他事。」", "“I only take Her Highness's pulse each morning. Nothing more.”")),
      r(t("拿着画笔比划，说话文绉绉，一提画像就躲开眼神。", "Gesturing with your brush, flowery speech; avoid eye contact whenever the portrait comes up."), t("「臣只是在作画，眼里只有颜色和线条。」", "“I was only painting. All I see is colour and line.”")),
      r(t("机灵又胆小，跑来跑去，一提送信就结巴。", "Quick but jumpy, darting about; stammer whenever letters come up."), t("「奴才只是跑腿的，信里写的什么，奴才一个字都没看！」", "“I only run errands! I never read a word of any letter!”")),
    ],
  },
  "family-surprise-heir": {
    beats: [
      t("年轻人举着鉴定书闯进来，宴会厅一片哗然。", "The young man bursts in waving the DNA report, and the banquet hall erupts."),
      t("每个人说说自己怎么看这个「亲孙子」，顺便盯着那个歪公章。", "Everyone gives their take on this “grandson”, while squinting at the crooked stamp."),
      t("反转以后，大家发现家产要给猫了，开始抢着讨好那只猫。", "After the twist, everyone realizes the fortune goes to the cat, and starts fighting for the cat's affection."),
      t("最后每人说一句话，给老爷子祝寿，顺便表个态。", "To finish, everyone wishes the old man a happy birthday, and makes their position clear."),
    ],
    roles: [
      r(t("气势汹汹，说话很冲，一提年轻时候的事就心虚。", "Aggressive and loud; go shifty whenever your younger days come up."), t("「哪来的野孩子？家产从来都是我的！」", "“Who is this kid? The fortune has always been mine!”")),
      r(t("拿着计算器一直按，一提古董就转移话题。", "Tapping away at a calculator; change the subject whenever antiques come up."), t("「先别激动，家里的账我最清楚，我们一笔一笔算。」", "“Everyone calm down. I know the accounts best. Let's go line by line.”")),
      r(t("说话慢条斯理，看那个年轻人的眼神有点复杂。", "Slow and proper; the way you look at the young man is complicated."), t("「老爷子的事，我在这个家四十年，都看在眼里。」", "“Forty years in this house. I've seen everything that happened to the old master.”")),
      r(t("很温柔，一直护着老爷子，一提遗嘱就闭紧嘴巴。", "Gentle, always shielding the old man; press your lips shut whenever the will comes up."), t("「老爷子年纪大了，大家别吵，有话慢慢说。」", "“He's not young anymore. Please don't fight. Let's talk calmly.”")),
    ],
  },
  "love-whistler-toothbrush": {
    beats: [
      t("有人在浴室发现第三支牙刷，拿着它走出来。", "Someone finds the third toothbrush in the bathroom and walks out holding it."),
      t("两个人互相追问：这支牙刷是谁的？谁还有钥匙？", "The two grill each other: whose toothbrush is this, and who else has a key?"),
      t("反转以后，两个人开始想办法应付那位未婚妻。", "After the twist, the two scramble to deal with the fiancée."),
      t("最后每人说一句话，说说这个周末还滑不滑。", "To finish, one line each: is this ski weekend still on?"),
    ],
    roles: [
      r(t("一直吹自己滑得多好，一提教练就眼神飘忽。", "Bragging about your skiing nonstop; eyes wander whenever the instructor comes up."), t("「我滑得可好了，私教课只是精益求精。」", "“I'm a great skier. The private lessons are just for polish.”")),
      r(t("拿着钥匙晃来晃去，一看到爱心贴纸就脸红。", "Twirling the keys; blush whenever you see the heart sticker."), t("「小木屋是我订的，钥匙只有两把，一把在我这儿。」", "“I booked this cabin. There are only two keys, and one's right here.”")),
    ],
  },
  "family-red-envelope-double": {
    beats: [
      t("奶奶翻着账本，指着那一行，问两个人到底谁拿了两个。", "Grandma points at the line in her notebook and asks which of them took two."),
      t("两个人各说各的：今天怎么拜的年，红包放哪了。", "Each tells their side: how they paid their respects today, and where their envelope went."),
      t("反转以后，两个人开始抢着说那张彩票是自己的。", "After the twist, both suddenly claim the winning lottery ticket is theirs."),
      t("最后每人说一句话，给奶奶拜个年，顺便表个清白。", "To finish, both wish Grandma a happy New Year and plead their innocence."),
    ],
    roles: [
      r(t("很体面，一直提自己的新车，一提红包就摸口袋。", "Very polished, always mentioning your new car; touch your pocket whenever red envelopes come up."), t("「奶奶，我都升职了，还会贪您这个红包吗？」", "“Grandma, I just got promoted. Why would I take your envelope?”")),
      r(t("一直哭穷，说话很乖，一提博士就紧张。", "Pleading poverty, very sweet; tense whenever the PhD comes up."), t("「奶奶，我一个穷学生，一个红包都舍不得花。」", "“Grandma, I'm a broke student. I'd never waste even one envelope.”")),
    ],
  },
  "love-valentine-lunch": {
    beats: [
      t("有人把手机上的账单举到对方面前：情人节中午，法餐厅，两人位。", "One of them holds up the bank statement: Valentine's lunch, French bistro, table for two."),
      t("两个人各说各的：那天中午到底在干什么。", "Each tells their side: what were you really doing that lunchtime?"),
      t("反转以后，两个人开始抢着说那条围巾是自己的。", "After the twist, both suddenly claim the scarf left at table seven."),
      t("最后每人说一句话，对对方说一句真心话。", "To finish, both say one honest thing to the other."),
    ],
    roles: [
      r(t("一直说那家餐厅太贵，一提做菜就笑得很神秘。", "Keep saying that bistro is overpriced; smile mysteriously whenever cooking comes up."), t("「那么贵的餐厅，我怎么可能去？我自己做的意面不香吗？」", "“A place that pricey? Me? Isn't my homemade pasta good enough?”")),
      r(t("拿着表格一笔一笔核对，手一直按着口袋。", "Checking the spreadsheet line by line, one hand pressed to your pocket."), t("「每一笔钱我都记着，这一笔不是我花的。」", "“I log every cent. This one wasn't me.”")),
    ],
  },
  "palace-hairpin-guardroom": {
    beats: [
      t("凤钗被呈上来，皇后问：这三天，谁进过本宫的寝宫？", "The hairpin is presented, and the empress asks: who has been in my chambers these three days?"),
      t("两个人各说各的：自己去寝宫干什么，凤钗最后一次是在哪见到的。", "Each explains why they visited the chambers, and when they last saw the hairpin."),
      t("反转以后，两个人开始互相闻身上的香味。", "After the twist, the two start sniffing each other's perfume."),
      t("最后每人说一句话，向皇后表忠心。", "To finish, both pledge loyalty to the empress in one line."),
    ],
    roles: [
      r(t("很恭敬，一直低着头，一提侍卫房就紧张地搓手。", "Very respectful, head bowed; wring your hands whenever the guardroom comes up."), t("「娘娘的凤钗一直是奴婢收着，奴婢绝不敢有半点差池。」", "“I've always kept Her Majesty's hairpin. I would never dare make a mistake.”")),
      r(t("举止优雅，笑里藏刀，说话总像在叹气。", "Elegant, smiling with a knife behind it, always sounding like a sigh."), t("「臣妾那天只坐了一会儿，连凤钗长什么样都没看清。」", "“I only stayed a moment that day. I barely saw the hairpin.”")),
    ],
  },
  "family-designer-bag": {
    beats: [
      t("林阿姨拿着鉴定报告回来，把包往桌上一放：这个月谁借过？", "Mrs. Lin comes back with the appraisal and drops the bag on the table: who borrowed this?"),
      t("两个人各说各的：借包去干什么，还的时候是什么样。", "Each explains why they borrowed it, and what shape it was in when they gave it back."),
      t("反转以后，两个人开始抢着说要把包买回来。", "After the twist, both suddenly insist on buying the bag back."),
      t("最后每人说一句话，向林阿姨交代清楚。", "To finish, both owe Mrs. Lin one honest line."),
    ],
    roles: [
      r(t("很乖巧，一直夸婆婆有眼光，谁要打开包就拦住。", "Sweet and dutiful, praising your mother-in-law's taste; stop anyone who tries to open the bag."), t("「妈，这包我只背了一个晚上，一直小心翼翼的。」", "“Mom, I only carried it for one evening, and I was so careful.”")),
      r(t("大大咧咧，一直刷手机，一提网上卖东西就锁屏。", "Breezy, scrolling your phone; lock the screen whenever selling things online comes up."), t("「我就拍了几张照片发网上，包一直在我身边！」", "“I just took a few photos for my feed. The bag never left my side!”")),
    ],
  },
  "show-charity-stream": {
    beats: [
      t("直播一关，后台的数字跳出来：善款少了三千块。", "The stream ends, and the backend shows it: three thousand dollars short."),
      t("两个人各说各的：直播时谁碰过后台，钱都去哪了。", "Each tells their side: who touched the backend during the stream, and where the money went."),
      t("反转以后，两个人都把手腕藏到了身后。", "After the twist, both of them hide their wrists behind their backs."),
      t("最后每人说一句话，对粉丝发一个道歉（或者澄清）。", "To finish, each gives the fans a one-line apology, or a denial."),
    ],
    roles: [
      r(t("对着镜头笑得很甜，一转身就慌，一提礼物就打岔。", "Sweet smile for the camera, panic the moment you turn away; change the subject whenever gifts come up."), t("「家人们的每一分钱，我都会给大家一个交代！」", "“Every dollar you gave, I'll account for, I promise!”")),
      r(t("一直盯着屏幕，说话很快，一提补光灯就看天花板。", "Eyes glued to the screen, talking fast; stare at the ceiling whenever lighting comes up."), t("「后台我一直盯着，一秒都没离开过！」", "“I watched that backend the whole time. Not one second away!”")),
    ],
  },
  "crime-poker-night-ring": {
    beats: [
      t("有人往奖池里一看，戒指不见了，牌桌上的人都僵住了。", "Someone glances at the pot: the ring is gone. Everyone at the table freezes."),
      t("每个人说说刚才那几把牌自己在干什么，手放在哪。", "Everyone says what they were doing during the last few hands, and where their hands were."),
      t("反转以后，主人宣布不求婚了，大家开始猜为什么。", "After the twist, the host calls off the proposal, and everyone wonders why."),
      t("最后每人说一句话，对主人说点真心话。", "To finish, everyone says one honest thing to the host."),
    ],
    roles: [
      r(t("得意洋洋，一直数筹码，眼睛滴溜溜地转。", "Smug, counting your chips, eyes darting everywhere."), t("「我今晚赢的都是实力，戒指我可看不上。」", "“Everything I won tonight was skill. I don't need a ring.”")),
      r(t("垂头丧气，一直摸口袋里的车钥匙，一提车就叹气。", "Downcast, fiddling with the car keys in your pocket; sigh whenever the car comes up."), t("「我车都押上了，还有心思偷戒指？」", "“I just bet my car. You think I had time to steal a ring?”")),
      r(t("最了解主人，一直在安慰大家，一提家人就紧张。", "Knows the host best, comforting everyone; tense whenever family comes up."), t("「我认识他二十年了，他要是知道戒指丢了，非疯了不可。」", "“I've known him twenty years. If he finds out the ring's gone, he'll lose it.”")),
    ],
  },
  "love-time-capsule-letter": {
    beats: [
      t("主持人打开时光胶囊，当着大家的面念那封写给班长的情书。", "The host opens the time capsule and reads the love letter to the class president out loud."),
      t("每个人说说高中时和班长的关系，和那颗心可能是谁画的。", "Everyone shares their history with the president, and who might have drawn that heart."),
      t("反转以后，班长到了，大家开始互相使眼色。", "After the twist, the president has arrived, and everyone starts exchanging looks."),
      t("最后每人说一句话，对班长说一句当年没说的话。", "To finish, everyone tells the president one thing they never said back then."),
    ],
    roles: [
      r(t("很懂规矩，一直拿着位置图，一提胶囊被挖开过就紧张。", "A stickler for rules, holding the map; tense whenever anyone suggests the capsule was opened before."), t("「胶囊的位置只有我知道，十年来谁都没动过。」", "“Only I knew where the capsule was. Nobody touched it in ten years.”")),
      r(t("大大咧咧，一直说当年和班长是哥们，一提高二就笑。", "Loud and easygoing, insisting you and the president were just buddies; laugh whenever grade eleven comes up."), t("「我跟班长？就是好兄弟，好兄弟！」", "“Me and the president? Just best friends. Best friends!”")),
      r(t("很会主持，拿着信念得声情并茂，念到一半手开始抖。", "A natural host, reading the letter with feeling, until your hands start to shake."), t("「同学们！听听这封信，我念了啊！」", "“Everyone! Listen to this letter. Here we go!”")),
    ],
  },
  "office-salary-sheet-leak": {
    beats: [
      t("有人举着猎头发来的消息：工资开得跟我们现在的一分不差。", "Someone holds up the recruiter's message: the offer matches our current salaries to the dollar."),
      t("每个人说说自己最近有没有见过猎头，看过工资表没有。", "Everyone says whether they've met a recruiter lately, and whether they've seen the salary sheet."),
      t("反转以后，大家看着群名「欢迎加入」，开始互相盯着。", "After the twist, everyone stares at the 'Welcome aboard!' chat and then at each other."),
      t("最后每人说一句话，表态到底走不走。", "To finish, everyone says in one line whether they're staying or going."),
    ],
    roles: [
      r(t("很有架子，一直说只有自己能看工资表，一提 offer 就清嗓子。", "Full of authority, insisting only you can see the salary sheet; clear your throat whenever job offers come up."), t("「工资表只有我能看，这件事我一定查到底。」", "“I'm the only one with access to that sheet. I'll get to the bottom of this.”")),
      r(t("很低调，一直看手机，一提请假就找借口。", "Keeping a low profile, always on your phone; make excuses whenever your days off come up."), t("「我最近请假是因为家里有事，真的。」", "“I've been taking days off for family reasons. Honestly.”")),
      r(t("气鼓鼓的，说话阴阳怪气，一提工资就翻白眼。", "Sulking, every line dripping with sarcasm; roll your eyes whenever salaries come up."), t("「反正我工资最低，卖了对我有什么好处？」", "“I'm the lowest paid anyway. What would I get out of selling it?”")),
    ],
  },
  "palace-lantern-masked-dancer": {
    beats: [
      t("掌事嬷嬷把三个人叫进来，举着一张面具：昨晚的舞伴是谁？", "The head matron calls in the three maids and holds up a mask: who was the prince's dancer?"),
      t("每个人说说昨晚舞会时自己在哪，有谁能作证。", "Everyone says where they were during the ball, and who can vouch for them."),
      t("反转以后，大家开始跟着王爷的曲子比划舞步，又怕跳得太像。", "After the twist, everyone tries the steps to the prince's tune, terrified of dancing them too well."),
      t("最后每人说一句话，赶在未婚妻进宫前表个清白。", "To finish, everyone clears their name in one line before the fiancée arrives."),
    ],
    roles: [
      r(t("对每张面具都如数家珍，一提银面具就把手藏到身后。", "Rattling off details about every mask; hide your hands behind your back whenever silver masks come up."), t("「舞会上的面具都经过我的手，我最清楚。」", "“Every mask at the ball went through my hands. I know them best.”")),
      r(t("一直说花灯多好看，说着说着就说出了城里烟花的样子。", "Going on about how lovely the lanterns were, and accidentally describing the fireworks in town."), t("「我一整晚都在看花灯，可美了！」", "“I spent the whole night admiring the lanterns. They were so pretty!”")),
      r(t("很机灵，什么话都替王爷说，一提纸条就紧张。", "Quick-witted, speaking for the prince at every turn; tense whenever notes come up."), t("「王爷的事，奴婢最清楚，他昨晚……什么都没做。」", "“I know the prince's business best. Last night he did… nothing at all.”")),
    ],
  },
  /* ---------------------------------------------------------------- monologues */
  "solo-best-man-speech": {
    beats: [
      t("拿起话筒，先谢谢大家来，说说你和新郎是怎么认识的。", "Take the mic, thank everyone for coming, and say how you know the groom."),
      t("讲一件新郎以前的糗事，一边讲一边做牌上的小动作。", "Tell one embarrassing story about the groom, doing the little moves on your card as you go."),
      t("反转以后，想办法拖时间，别露馅。", "After the twist, stall for time without giving yourself away."),
      t("最后举杯，说一句祝福的话。", "Raise a glass and finish with a toast to the couple."),
    ],
    roles: [r(t("笑得很用力，说话越来越快，两只手不知道往哪放。", "Smile way too hard, talk faster and faster, and never know what to do with your hands."), t("「大家好，我是新郎穿开裆裤时就认识的兄弟！」", "“Hi, everyone! I've known this guy since we were both in diapers.”"))],
  },
  "solo-weather-report": {
    beats: [
      t("对观众问好，指着身后的「地图」说说今天的天气。", "Say good evening and point at the “map” behind you to sum up today."),
      t("一个城市一个城市往下说明天的天气，中间做牌上的小动作。", "Go city by city through tomorrow, slipping in the moves on your card."),
      t("反转以后，马上把紧急消息播出去。", "After the twist, get the breaking news out right away."),
      t("最后对着镜头说再见。", "Sign off to the camera."),
    ],
    roles: [r(t("站得笔直，字正腔圆，手一直在身后的「地图」上比划。", "Stand up straight, use your best newsreader voice, and keep sweeping a hand across the “map” behind you."), t("「观众朋友们晚上好，下面播报明天的天气。」", "“Good evening, and here's your forecast for tomorrow.”"))],
  },
  "solo-job-interview": {
    beats: [
      t("走进来，跟面试官握手问好，坐下。", "Walk in, shake hands with the panel, and sit down."),
      t("介绍自己的经历和长处，中间做牌上的小动作。", "Talk through your experience and strengths, slipping in the moves on your card."),
      t("回答面试官的两个问题，反转来了也要接住。", "Take two questions from the panel, and handle the twist when it comes."),
      t("最后说一句「为什么一定要选我」。", "Close with one line on why they simply have to hire you."),
    ],
    roles: [r(t("特别自信，说话夹着英文单词，被问住了就哈哈笑。", "Overconfident and full of buzzwords; when a question stumps you, laugh it off."), t("「各位好，我是一个会说五种语言的人。」", "“Hi! I'm a strategic, multilingual team player.”"))],
  },
  "solo-live-workout": {
    beats: [
      t("对着镜头大声打招呼，让大家都站起来。", "Greet the camera at full volume and get everyone on their feet."),
      t("带大家做几个热身动作，中间做牌上的小动作。", "Lead a few warm-up moves, slipping in the moves on your card."),
      t("反转以后，想办法完成老板的要求。", "After the twist, find a way to do what the boss wants."),
      t("最后让大家一起喊口号结束。", "Finish with everyone shouting a slogan together."),
    ],
    roles: [r(t("精神超好，声音很大，一直拍手数节拍。", "Pure energy: loud, bouncy, clapping out the beat the whole time."), t("「早上好！全体起立！我们先扭扭脖子！」", "“Good morning, everybody! On your feet! Let's start with neck rolls!”"))],
  },
  "solo-birthday-call": {
    beats: [
      t("拨通电话，祝妈妈生日快乐。", "Make the call and wish Mom a happy birthday."),
      t("跟妈妈解释今年为什么又回不去，中间做牌上的小动作。", "Explain why you can't come home again this year, slipping in the moves on your card."),
      t("反转以后，想办法别让爸爸撞见。", "After the twist, make sure Dad doesn't catch you."),
      t("挂电话之前，跟妈妈说一句心里话。", "Say one heartfelt thing to Mom before you hang up."),
    ],
    roles: [r(t("一只手举着「手机」，声音很温柔，说着说着就有点心虚。", "Hold an invisible phone to your ear; your voice is warm but keeps wobbling."), t("「妈，生日快乐！你猜我现在在干嘛？」", "“Hi, Mom! Happy birthday! Guess what I'm doing right now?”"))],
  },
  "solo-museum-guide": {
    beats: [
      t("欢迎游客，带大家走到展柜前。", "Welcome the group and lead them to the display case."),
      t("讲讲古瓶的来历，中间做牌上的小动作。", "Tell the vase's story, slipping in the moves on your card."),
      t("回答游客的问题，反转以后也要稳住。", "Take the group's questions, and keep calm after the twist."),
      t("最后催大家去纪念品商店。", "Finish by herding everyone off to the gift shop."),
    ],
    roles: [r(t("说话慢，很有学问的样子，人总是挡在展柜前面。", "Slow and scholarly, always somehow standing between people and the glass."), t("「各位请看，这就是我们的镇馆之宝。」", "“And here, ladies and gentlemen, is the pride of our collection.”"))],
  },
  "solo-ex-wedding-toast": {
    beats: [
      t("拿起话筒，先祝福新人，说你和新娘是老朋友。", "Take the mic, congratulate the couple, and say you and the bride go way back."),
      t("讲一件你们以前的事，中间做牌上的小动作。", "Share one memory of the two of you, slipping in the moves on your card."),
      t("反转以后，接住新郎的话。", "After the twist, answer the groom."),
      t("最后举杯，说一句祝福，或者不太像祝福的话。", "Raise a glass with a final toast, or something that isn't quite one."),
    ],
    roles: [r(t("很有风度，说话很慢，眼神很深情。", "Smooth and gracious, speaking slowly, eyes full of meaning."), t("「大家好，我是新娘的……老朋友。」", "“Hi, everyone. I'm an old… friend of the bride's.”"))],
  },
  "solo-ceo-press": {
    beats: [
      t("鞠一躬，宣读道歉声明。", "Bow and read out the apology."),
      t("解释事情的经过，中间做牌上的小动作。", "Explain what happened, slipping in the moves on your card."),
      t("回答记者的问题，反转以后也要撑住。", "Take questions from the reporters, and hold it together after the twist."),
      t("最后承诺「一定严肃处理」。", "Finish by promising “the strictest possible measures”."),
    ],
    roles: [r(t("表情很沉重，说话很官方，被问急了就擦汗。", "Grave face, corporate voice; when the questions get tough, mop your brow."), t("「首先，我代表公司向大家郑重道歉。」", "“First of all, on behalf of the company, I want to sincerely apologize.”"))],
  },

  /* ---------------------------------------------------------------- four to six */
  "love-wedding-rings": {
    beats: [
      t("有人打开戒指盒，发现是空的，大叫一声，把大家都叫过来。", "Someone opens the ring box, finds it empty, and screams for everyone."),
      t("每个人说说昨晚和今早最后一次见到戒指是什么时候，互相追问。", "Each person says when they last saw the rings; everyone grills everyone."),
      t("反转以后，大家一边找一边吵，越吵越乱。", "After the twist, everyone searches and argues at the same time."),
      t("最后每人说一句话，证明不是自己。", "To finish, one line each to prove it wasn't you."),
    ],
    roles: [
      r(t("快哭了又不能哭，怕妆花，一直用手扇眼睛。", "On the verge of tears but can't cry (the makeup!), fanning your eyes the whole time."), t("「谁动了我的戒指？今天谁都别想走！」", "“Who touched my rings? Nobody leaves this room!”")),
      r(t("坐立不安，一直看表，说话结结巴巴。", "Can't sit still, keeps checking the time, stammers."), t("「我、我刚才就去了趟洗手间！」", "“I-I only went to the bathroom! Twice. Okay, four times.”")),
      r(t("嗓门大，老拍别人肩膀，假装很镇定。", "Loud, slapping shoulders, pretending to be totally calm."), t("「别慌别慌，戒指一直在我这儿……应该是。」", "“Relax, relax, I had the rings the whole time. Pretty much.”")),
      r(t("手里一直拿着化妆刷，说话前先帮人补个妆。", "Never puts down the makeup brush; touches up someone's face before every line."), t("「别动，你脸上有点花了。我们先冷静一下。」", "“Hold still, you've got a smudge. Okay, everyone breathe.”")),
      r(t("双手抱胸，冷笑，什么问题都怪到新郎头上。", "Arms folded, cold little smile; every problem is somehow the groom's fault."), t("「我早就说过，这个女婿靠不住。」", "“I said it from the start: this one isn't reliable.”")),
      r(t("一直在打电话，语速飞快，对谁都说「没问题」。", "Constantly on the phone, talking fast, telling everyone “No problem!”"), t("「没问题没问题，我办过三百场婚礼，从没丢过戒指！」", "“No problem, no problem! Three hundred weddings and I've never lost a ring!”")),
    ],
  },
  "family-camp-snacks": {
    beats: [
      t("早上起来，有人发现零食袋被翻乱了，大喊大家出来。", "In the morning, someone finds the snack bag ransacked and yells for everyone."),
      t("每个人说说昨晚几点睡的、半夜有没有起来过。", "Each person says when they went to bed and whether they got up in the night."),
      t("反转以后，大家开始互相看牙印。", "After the twist, everyone starts checking each other's teeth."),
      t("最后每人说一句话，赌咒发誓不是自己。", "To finish, everyone swears one last time it wasn't them."),
    ],
    roles: [
      r(t("双手叉腰，说话像专家，其实什么都不懂。", "Hands on hips, talks like an expert, knows nothing."), t("「我在野外待了二十年，一看就是浣熊干的。」", "“Twenty years in the wild. Trust me, this is raccoons.”")),
      r(t("拿着购物小票一样样核对，越算越生气。", "Checking the receipt item by item, getting angrier with every line."), t("「那包牛肉干四十块，我记得清清楚楚！」", "“That jerky was twelve dollars a bag. I remember exactly.”")),
      r(t("举着手机到处找信号，谁说话都翻白眼。", "Waving your phone around for signal, rolling your eyes at everyone."), t("「这里连信号都没有，我能偷什么？」", "“There's literally no signal here. What would I even steal?”")),
      r(t("一点小动静就吓一跳，一直往车那边看。", "Jumps at every little sound, keeps looking over at the car."), t("「我、我睡得可香了，一整晚都在帐篷里！」", "“I slept great! All night! In the tent! Definitely the tent!”")),
      r(t("笑眯眯的，总想把话题扯到浣熊有多可爱上。", "Beaming, keeps steering the talk to how cute raccoons are."), t("「浣熊多可爱呀，吃点就吃点嘛。」", "“Oh, raccoons are adorable. Let the poor thing have a snack.”")),
      r(t("很官方，拿着手电筒到处照，手上有股鱼腥味。", "Very official, shining a flashlight everywhere; your hands smell faintly of fish."), t("「营地规定，所有食物必须锁好。谁违规了？」", "“Camp rules say all food gets locked up. Who broke the rules?”")),
    ],
  },
  "office-potluck-chili": {
    beats: [
      t("有人跑进来说大老板被辣到了，大家都围到那锅汤旁边。", "Someone rushes in: the CEO got scorched by the chili. Everyone gathers round the pot."),
      t("每个人介绍自己带的菜，说说刚才有没有靠近那锅汤。", "Everyone introduces their dish and says whether they went near the pot."),
      t("反转以后，每个人都想办法证明自己能吃辣，或者不能吃辣。", "After the twist, everyone tries to prove they can, or can't, handle spice."),
      t("最后每人推荐一次自己的菜，顺便甩一次锅。", "To finish, everyone plugs their own dish one last time and points a finger."),
    ],
    roles: [
      r(t("满头大汗，一会儿道歉一会儿发火。", "Sweating buckets, switching between apologizing and losing your temper."), t("「大老板就喝了一口！一口！谁干的？」", "“The CEO took one spoonful! One! Who did this?”")),
      r(t("什么都知道，说话总压低声音，像在讲八卦。", "Knows everything, always talking in a low gossipy voice."), t("「我跟你们说，刚才我看见有人在锅旁边鬼鬼祟祟的。」", "“Okay, I wasn't going to say anything, but I saw someone lurking by the pot.”")),
      r(t("一直夸自己的鸡翅有多辣，可一口都不敢吃。", "Keeps bragging about how hot your wings are, but won't take a bite."), t("「我的鸡翅才叫辣，那锅汤算什么。」", "“Please. My wings are the spicy ones. That chili's nothing.”")),
      r(t("很紧张，一直往饭盒里装菜，被人看到就停下。", "Nervous, sneaking food into a container, freezing whenever someone looks."), t("「我、我只是在帮大家收拾剩菜。」", "“I'm just, um, helping clean up the leftovers!”")),
      r(t("拿着计算器，说什么都要先算钱。", "Calculator in hand; everything comes down to money."), t("「这一锅汤，按成本算，浪费了八十七块五。」", "“By my numbers, that pot of chili was forty-two dollars of waste.”")),
      r(t("一边拖地一边点评每道菜，什么都看见了。", "Mopping while reviewing every dish, missing nothing."), t("「我扫了一下午地，谁去过锅那边，我都记得。」", "“I've been mopping all afternoon. I know exactly who went near that pot.”")),
    ],
  },
  "show-karaoke-skip": {
    beats: [
      t("寿星发现专属歌又被切了，关掉音乐，要大家说清楚。", "The birthday star notices the song's been skipped again, kills the music, and demands answers."),
      t("每个人说说今晚拿过几次点歌平板。", "Everyone says how many times they've touched the song tablet tonight."),
      t("反转以后，所有人都盯着看谁的反应最奇怪。", "After the twist, everyone watches for the strangest reaction."),
      t("最后大家一起唱一句（或者死活不唱），每人说一句结束。", "Finish by everyone singing one line (or flatly refusing), with one last word each."),
    ],
    roles: [
      r(t("又委屈又生气，抱着话筒不放。", "Hurt and furious, clutching the mic like a teddy bear."), t("「今天是我生日！我的歌呢？谁切的？」", "“It's my birthday! Where's my song? Who skipped it?”")),
      r(t("话筒不离手，说话也像在唱歌。", "Never lets go of the mic; even your talking sounds like singing."), t("「我才唱了十二首，这也算多吗？」", "“It's only been twelve songs! Is that a lot?”")),
      r(t("把平板抱在怀里，谁靠近就往后躲。", "Hugging the tablet to your chest, backing away from anyone who gets close."), t("「平板一直在我手里，我发誓没人碰过。」", "“This tablet has not left my hands. I swear.”")),
      r(t("一直擦嘴，说话很快，什么都怪堵车。", "Keeps wiping your mouth, talks fast, blames everything on traffic."), t("「我刚到，真的刚到，路上堵死了！」", "“I literally just got here. The traffic was insane!”")),
      r(t("每次进来都哼两句，放下饮料还不走。", "Humming every time you come in, lingering after you drop off the drinks."), t("「您的饮料……这首歌我也会唱哦。」", "“Here are your drinks… oh, I love this song, by the way.”")),
      r(t("很尴尬，一直举着手机，被看到就假装在看时间。", "Awkward, phone always up; when caught, you pretend to check the time."), t("「我谁都不认识，我只是来送礼物的。」", "“I barely know anyone. I just came to drop off a present.”")),
    ],
  },
  "crime-escape-room-key": {
    beats: [
      t("有人发现墙上的钥匙不见了，大叫一声，所有人都停下来。", "Someone spots the empty hook, yells, and everyone freezes."),
      t("每个人说说刚才五分钟自己在干什么、站在房间哪个位置。", "Everyone says what they did in the last five minutes and where they were standing."),
      t("反转以后，大家开始互相检查口袋和袖子。", "After the twist, everyone starts checking pockets and sleeves."),
      t("最后每人说一句话，求大家相信自己。", "To finish, one plea each to be believed."),
    ],
    roles: [
      r(t("像教官一样发号施令，一着急就拍桌子。", "Barking orders like a drill sergeant, slapping the table when it gets tense."), t("「所有人都别动！钥匙刚才还在这儿！」", "“Nobody move! That key was right here!”")),
      r(t("缩着肩膀，一点动静就尖叫，紧紧抓着旁边的人。", "Hunched up, shrieking at every noise, clinging to whoever's closest."), t("「啊！灯是不是闪了一下？我想出去！」", "“Did the lights just flicker? I want to go home!”")),
      r(t("很冷静，推推眼镜，说话像在破案。", "Cool and collected, pushing up your glasses, talking like a detective."), t("「冷静。我们来还原一下刚才的五分钟。」", "“Calm down. Let's reconstruct the last five minutes.”")),
      r(t("一直举着手机对着别人，说话像在做直播。", "Phone always up and pointed at someone, narrating like a livestream."), t("「家人们，钥匙不见了！我们来看看是谁！」", "“Okay, chat, the key is gone! Let's find out who did it!”")),
      r(t("只用广播说话，声音很神秘，其实很心虚。", "Talks only through the speaker, all mysterious, secretly flustered."), t("「各位玩家请注意……你们刚才在干什么？」", "“Attention, players… um, what exactly just happened in there?”")),
      r(t("看什么都新鲜，到处乱摸，一被问就装傻。", "Amazed by everything, touching all of it, playing dumb when asked."), t("「哇，这个按钮是干什么的？哦，不能按吗？」", "“Ooh, what does this button do? Oh. I wasn't supposed to press it?”")),
    ],
  },
  "family-parents-chat": {
    beats: [
      t("老师把截图拿出来，问大家知不知道这件事。", "The teacher holds up the screenshot and asks if anyone knows about it."),
      t("每个人说说自己平时在群里发什么，有没有吐槽过。", "Everyone says what they usually post in the chat, and whether they've ever complained."),
      t("反转以后，大家开始互相看手机电量。", "After the twist, everyone starts checking each other's batteries."),
      t("最后每人说一句话，表态支持老师。", "To finish, everyone declares their loyalty to the teacher."),
    ],
    roles: [
      r(t("很严肃，像在开家长会，一直敲桌子。", "Very stern, like parent-teacher night, tapping the table for order."), t("「各位家长，今天请大家来，是因为这张截图。」", "“Thank you all for coming. We need to talk about this screenshot.”")),
      r(t("说话像领导，什么都要「统一一下思想」。", "Talks like a CEO, always wanting to get everyone “aligned”."), t("「这个群是我建的，出了这种事，我第一个不答应！」", "“I started that chat, and I will not stand for this!”")),
      r(t("特别热情，三句话不离孩子，手机里全是孩子的照片。", "Super enthusiastic; every other sentence is about your kid; phone full of photos."), t("「我天天在群里发的都是正能量，你们看，这是我儿子画的。」", "“I only ever post positive stuff! Look, here's my son's drawing.”")),
      r(t("话很少，声音很轻，眼睛一直盯着别人的手机。", "Barely speaks, voice soft, eyes always on someone else's phone."), t("「我……我在群里从来不说话的。」", "“I… I never post in the chat. Ever.”")),
      r(t("手机拿得远远的，眯着眼看，声音特别大。", "Holding the phone at arm's length, squinting, talking very loudly."), t("「截图是什么东西？我只会发语音！」", "“What's a screenshot? I only know how to send voice messages!”")),
      r(t("很客气，一直笑着点头，一提截图就紧张。", "Very polite, nodding and smiling, tensing up whenever screenshots come up."), t("「我才来一个星期，大家都还不认识我呢。」", "“I've only been here a week. Nobody even knows me yet!”")),
    ],
  },
  "love-reunion-letter": {
    beats: [
      t("班长打开时间胶囊，当着大家的面念那封情书。", "The class president opens the time capsule and reads the letter out loud."),
      t("每个人说说毕业那天自己在干什么。", "Everyone says what they were doing on graduation day."),
      t("反转以后，大家开始比对笔迹。", "After the twist, everyone starts comparing handwriting."),
      t("最后每人说一句当年没说出口的话。", "To finish, each person says one thing they never said back then."),
    ],
    roles: [
      r(t("还像当年一样管着所有人，念信念得声情并茂。", "Still bossing everyone around like it's senior year, reading the letter with feeling."), t("「同学们安静！听听这封信，我念了啊！」", "“Everyone, quiet! You have to hear this. Ready?”")),
      r(t("还以为自己是当年的校草，一直在整理头发。", "Still thinks he's the hottest guy in school, fixing his hair constantly."), t("「这封信，十有八九是写给我的。」", "“Let's be honest, that letter was probably for me.”")),
      r(t("推推眼镜，一本正经，一提情书就脸红。", "Pushing up your glasses, very serious, blushing at the word “love”."), t("「从笔迹学的角度分析……咳，我们先别分析了。」", "“From a handwriting-analysis standpoint, this… ahem, let's not analyze it.”")),
      r(t("笑得很温柔，时不时看一眼手机，怕有人打电话来。", "Gentle smile, glancing at your phone in case someone calls."), t("「好久不见呀，大家都没怎么变呢。」", "“It's been so long! None of you have changed a bit.”")),
      r(t("嗓门大，老拍别人的背，一提操场就不说话了。", "Loud and back-slapping, suddenly quiet whenever “the field” comes up."), t("「操场？那是我的地盘，我天天在那儿！」", "“The field? That was my turf! I was out there every day!”")),
      r(t("慢悠悠的，像还在上课，什么都知道又什么都不说。", "Unhurried, like you're still teaching; knows everything, says nothing."), t("「你们这些孩子，当年的事我都记得。」", "“Oh, you kids. I remember everything from those years.”")),
    ],
  },

  /* ---------------------------------------------------------------- five to eight */
  "office-raffle-rigged": {
    beats: [
      t("主持人念出中奖的名字，全场安静，接着有人开始起哄。", "The MC reads out the winner. Silence, then grumbling."),
      t("每个人说说今晚有没有碰过抽奖箱或者纸条。", "Everyone says whether they touched the box or the slips tonight."),
      t("反转以后，大家开始互相看字迹、翻口袋。", "After the twist, everyone compares handwriting and turns out pockets."),
      t("最后每人说一句：「重新抽！」或者「就这样吧」。", "To finish, one line each: “Redo the draw!” or “Just let it go.”"),
    ],
    roles: [
      r(t("笑得很僵，一直说「大家冷静」，自己最不冷静。", "Stiff smile, keeps saying “Everyone calm down” while being the least calm person there."), t("「这个……抽奖是公平的，大家不要乱猜。」", "“Now, now, the draw was completely fair. Let's not jump to conclusions.”")),
      r(t("抱着名单不放，说话一板一眼，像在念规章制度。", "Clutching the list, strictly by the book, like you're reading the employee handbook."), t("「名单我核对了三遍，不可能有问题。」", "“I checked that list three times. There's no way it's wrong.”")),
      r(t("嗓子很亮，随时都在主持，一紧张就讲冷笑话。", "Big announcer voice, always “on”; when nervous, you tell terrible jokes."), t("「各位来宾，让我们……先别激动！」", "“Ladies and gentlemen, let's all… stay in our seats!”")),
      r(t("一直按计算器，一提电动车多少钱就转移话题。", "Tapping a calculator; changes the subject whenever the e-bike's price comes up."), t("「电动车的账清清楚楚，你们随便查。」", "“The e-bike's paperwork is spotless. Check it yourselves.”")),
      r(t("很紧张，手里还捏着几张没用完的纸条。", "Nervous, still holding a few spare slips in your hand."), t("「我、我只负责折纸条，别的什么都不知道！」", "“I just folded the slips! I don't know anything else!”")),
      r(t("站得笔直，回答很短，一提球赛眼睛就亮了。", "Standing at attention, short answers; your eyes light up at any mention of the game."), t("「我一直守在箱子旁边，一步都没离开过。」", "“I didn't leave that box for a second. Not one.”")),
      r(t("很不服气，一直在说自己今年业绩多好。", "Bitter, constantly reminding everyone of your sales numbers."), t("「我今年卖了三百万，头奖凭什么不是我？」", "“I closed three million this year. How is that prize not mine?”")),
      r(t("一直盯着笔记本电脑，一被点名就赶紧合上。", "Eyes glued to the laptop; slam it shut when anyone says your name."), t("「抽奖动画是随机的，跟我没关系啊。」", "“The slideshow's random. That's got nothing to do with me.”")),
    ],
  },
  "family-building-blackout": {
    beats: [
      t("物业打着手电筒走进大堂，宣布有人故意拉了总闸。", "The manager comes into the lobby with a flashlight: someone flipped the breaker on purpose."),
      t("每个人说说停电那一刻自己在干什么。", "Everyone says exactly what they were doing when the lights went out."),
      t("反转以后，大家开始摸彼此的手和头发。", "After the twist, everyone starts checking hands and hair."),
      t("最后每人说一句话，然后一起等来电。", "To finish, one line each, then everyone waits for the lights to come back."),
    ],
    roles: [
      r(t("举着手电筒照每个人的脸，说话像在审问。", "Shining the flashlight in everyone's face, talking like it's an interrogation."), t("「总闸是被人拉下来的！谁干的，自己站出来！」", "“Someone flipped that breaker on purpose! Whoever it was, step forward!”")),
      r(t("抓狂，一直在说刚才那局有多关键。", "Losing it, going on and on about how big that match was."), t("「决赛就差一滴血！就差一滴血！」", "“I was one hit from winning the final! One hit!”")),
      r(t("装作刚被吵醒，打着哈欠，可眼睛亮得很。", "Pretending you were just woken up, yawning, but wide awake."), t("「哎哟，我早就睡了，你们吵什么呀？」", "“Goodness, I've been asleep for hours. What's all the fuss?”")),
      r(t("很客气，一直往自己家那边看，一听到猫叫就咳嗽。", "Very polite, keeps glancing toward your unit, coughs loudly whenever there's a meow."), t("「大家好，我昨天才搬来……什么声音？没有声音。」", "“Hi, I just moved in yesterday… what noise? There's no noise.”")),
      r(t("很着急，一直看手机上的倒计时，嘴角有点油。", "In a hurry, watching the delivery timer on your phone, a little grease on your lip."), t("「我还有三单没送！电梯什么时候能动？」", "“I've got three more orders! When's the elevator coming back?”")),
      r(t("头上还戴着派对帽，一直说「派对一点都不吵」。", "Still wearing a party hat, insisting your party was “not loud at all”."), t("「我们家就是小小地庆祝一下，一点都不吵！」", "“It's just a little birthday thing! It wasn't loud!”")),
      r(t("累得站都站不稳，说话很慢，身上有猫粮的味道。", "So tired you can barely stand, speaking slowly, smelling faintly of cat food."), t("「我刚下夜班，十二个小时……能让我回去睡觉吗？」", "“I just did a twelve-hour shift. Can I please go to bed?”")),
      r(t("手里拿着一沓通知，什么事都要投票表决。", "Holding a stack of notices; everything needs to go to a vote."), t("「这件事，我们必须开一次业主大会！」", "“This calls for an emergency board meeting!”")),
    ],
  },
  "show-final-envelope": {
    beats: [
      t("主持人念出名字，全场愣住，有人尖叫。", "The host reads the name; the whole studio freezes; someone screams."),
      t("每个人说说今晚有没有碰过那个信封。", "Everyone says whether they touched the envelope tonight."),
      t("反转以后，大家一边吵一边想办法救场。", "After the twist, everyone argues while trying to save the broadcast."),
      t("最后每人对着镜头说一句话。", "To finish, everyone says one line straight to camera."),
    ],
    roles: [
      r(t("笑容很职业，可声音越来越抖，一直对着镜头圆场。", "Professional smile, voice getting shakier, smoothing things over to camera."), t("「观众朋友们，刚才……可能是个小小的误会！」", "“Folks at home, that was… possibly a tiny misunderstanding!”")),
      r(t("冷着脸，说话刻薄，一提礼物就咳嗽。", "Ice-cold face, cutting remarks, coughs whenever gifts come up."), t("「我早就说过，这个比赛有猫腻。」", "“I've said it all season: something about this competition stinks.”")),
      r(t("强忍眼泪，抓着话筒，说话带着哭腔。", "Holding back tears, gripping the mic, voice cracking."), t("「我练了三年……这不可能！」", "“Three years I trained for this… this can't be happening!”")),
      r(t("戴着耳机冲上台，一直喊「别停，继续拍」。", "Charges on in a headset, shouting “Keep rolling! Don't stop!”"), t("「别停！镜头别停！谁动了信封？」", "“Keep the cameras rolling! Who touched that envelope?”")),
      r(t("拿着粉扑边说边给人补妆，手机藏在身后。", "Powder puff in hand, touching people up while talking, phone hidden behind your back."), t("「先别哭，妆要花了！来，我给你补一下。」", "“Don't cry, you'll ruin the makeup! Here, let me fix that.”")),
      r(t("什么都说好，被问到就紧张地笑。", "Loves everything; when questioned, laughs nervously."), t("「大家都唱得很棒！每个人都是冠军！」", "“Everyone was amazing! Honestly, you're all winners!”")),
      r(t("挥着灯牌，嗓门最大，护孩子护得厉害。", "Waving your light-up sign, loudest voice in the room, fiercely protective."), t("「我家孩子才是冠军！谁也别想抢！」", "“My kid is the real winner! Nobody's taking that away!”")),
      r(t("抱着对讲机，一直在核对清单，一被问就翻笔记。", "Clutching a walkie-talkie and a checklist; flips through notes when asked anything."), t("「信封一整晚都在我台子上，我、我基本都在。」", "“That envelope was on my desk all night, and I was, um, mostly there.”")),
    ],
  },
  "crime-cruise-necklace": {
    beats: [
      t("灯亮了，项链的主人尖叫：项链不见了！", "The lights come back on and the necklace owner screams: it's gone!"),
      t("每个人说说灭灯那十秒，自己站在哪、在干什么。", "Everyone says where they were and what they were doing during those ten seconds."),
      t("反转以后，大家明白小偷就在桌边，开始互相盯着。", "After the twist, everyone realizes the thief is at the table and starts watching each other."),
      t("最后每人说一句话，让大家相信自己。", "To finish, one line each to win the room over."),
    ],
    roles: [
      r(t("腰板笔直，说话很有威严，可船一晃就脸色发白。", "Ramrod straight, commanding voice, but you go pale every time the ship rocks."), t("「各位，我是船长。找到项链之前，谁都不许离开。」", "“Ladies and gentlemen, this is your captain. Nobody leaves until that necklace is found.”")),
      r(t("又哭又喊，一直摸自己空空的脖子，说起保险却很熟练。", "Sobbing and shrieking, clutching your bare neck, oddly fluent about the insurance policy."), t("「我的项链！那是我奶奶留给我的！」", "“My necklace! It was my grandmother's!”")),
      r(t("说话像在唱歌，一紧张就哼起歌来。", "Speak like you're singing; when nervous, start humming."), t("「灯灭的时候，我正唱到最高音呢！」", "“When the lights went out, I was right in the middle of my high note!”")),
      r(t("端着蛋糕不肯放下，谁质疑菜就跟谁急。", "Won't put down the cake; snaps at anyone who questions the food."), t("「我手里一直端着蛋糕，哪有空偷项链？」", "“I had a cake in my hands the whole time! When would I have stolen anything?”")),
      r(t("拿着小本子记个不停，说话像侦探小说里的旁白。", "Scribbling in a notebook, narrating like a detective novel."), t("「有意思……灯灭的十秒里，只有一个人动了。」", "“Fascinating… in those ten seconds, only one person moved.”")),
      r(t("一直把手藏在背后，笑得很甜，一提戒指就紧张。", "Hands always behind your back, sweet smile, tensing whenever rings come up."), t("「我们在度蜜月，什么都没看见！」", "“We're on our honeymoon! We didn't see a thing!”")),
      r(t("很殷勤，一直给大家倒水，偷偷看每个人的手相。", "Very attentive, topping up everyone's water, secretly reading their palms."), t("「来，喝杯水压压惊……您的手相很特别。」", "“Some water to calm the nerves? Oh… you have a very interesting palm.”")),
      r(t("很镇定，要给每个人量脉搏，一提执照就打岔。", "Calm, insisting on taking everyone's pulse; dodges any question about credentials."), t("「大家别激动，我先给每个人量一下心跳。」", "“Everyone stay calm. Let me check your pulses, one at a time.”")),
    ],
  },
  "palace-banquet-seal": {
    beats: [
      t("有人发现案上的玉玺不见了，大喊「护驾」，夜宴停了下来。", "Someone sees the seal is gone and shouts “Guards!”; the banquet stops dead."),
      t("每个人说说刚才离开过座位没有、去了哪里。", "Everyone says whether they left their seat, and where they went."),
      t("反转以后，大家明白偷玉玺的人就在宴席上。", "After the twist, everyone realizes the thief is at the banquet."),
      t("最后每人对皇上说一句表忠心的话。", "To finish, everyone pledges loyalty to the king in one line."),
    ],
    roles: [
      r(t("说话慢，拖长音，一拍桌子大家都得跪。", "Slow, drawn-out speech; when you slap the table, everyone kneels."), t("「大胆！谁敢在朕的眼皮底下偷玉玺？」", "“Who dares steal the royal seal right under my nose?”")),
      r(t("端庄得体，笑里藏刀，每句话都带着刺。", "Poised and elegant, smiling with a knife behind it; every line has a sting."), t("「皇上息怒。今晚坐得离玉玺最近的，可不是臣妾。」", "“Calm yourself, Your Majesty. I wasn't the one sitting closest to the seal tonight.”")),
      r(t("撒娇，一直往皇上身边靠，一被怀疑就哭。", "Sweet and clingy, always leaning toward the king; tears at the first accusation."), t("「皇上，臣妾一直陪在您身边，您要相信臣妾呀。」", "“Your Majesty, I never left your side. You believe me, don't you?”")),
      r(t("弯着腰，声音尖细，一直在擦汗。", "Bowing low, thin high voice, constantly mopping your brow."), t("「奴才该死！玉玺一直在奴才眼前，怎么就……」", "“Forgive me, Your Majesty! The seal was right in front of me, and then…”")),
      r(t("嗓门大，手一直按在剑上，动不动就要搜身。", "Loud, hand always on your sword hilt, eager to search everyone."), t("「末将愿意亲自搜每一个人的身！」", "“Allow me to search every person here myself, Your Majesty!”")),
      r(t("一直在擦手，谁说菜不好吃就跟谁急。", "Always wiping your hands; snaps at anyone who knocks the food."), t("「奴才一直在御膳房，哪有工夫偷东西！」", "“I was in the kitchen all night! When would I have time to steal anything?”")),
      r(t("举着画笔比划，说话文绉绉，一提画就紧张。", "Gesturing with your brush, flowery speech, nervous whenever the painting comes up."), t("「回皇上，臣一直在作画，画里……画里什么都看得见。」", "“Your Majesty, I was painting the whole time, and the painting… sees everything.”")),
      r(t("装作听不懂，说话断断续续，可眼神很灵。", "Pretend not to understand, speak in broken phrases, but your eyes miss nothing."), t("「我……不懂……什么是，玉玺？」", "“I… not understand… what is, royal seal?”")),
    ],
  },
  "show-wrap-party-leak": {
    beats: [
      t("导演关掉音乐，举起手机给大家看网上的爆料。", "The director kills the music and holds up the leak for everyone to see."),
      t("每个人说说自己什么时候看过结局的剧本。", "Everyone says when they last saw the ending's script."),
      t("反转以后，大家开始互相比谁的衣服更贵。", "After the twist, everyone starts sizing up whose outfit costs the most."),
      t("最后每人说一句话，为自己的前途辩护。", "To finish, everyone defends their career in one line."),
    ],
    roles: [
      r(t("很激动，说话像在喊「卡」，一着急就抓头发。", "Worked up, barking like you're yelling “Cut!”, pulling at your hair."), t("「三年！我拍了整整三年！谁干的？」", "“Three years! I gave this film three years of my life! Who did this?”")),
      r(t("优雅，眼泪说来就来，一提绯闻就看向男主角。", "Elegant, tears on demand, glancing at your co-star whenever the rumours come up."), t("「那些私信……我们只是在对戏而已。」", "“Those messages… we were just running lines.”")),
      r(t("很冷静，一直看手机，一提合同就笑。", "Cool, always on your phone, smiling whenever contracts come up."), t("「别看我，我的合同里写着保密条款。」", "“Don't look at me. My contract has a confidentiality clause.”")),
      r(t("抱着剧本，说话尖刻，谁都不信。", "Clutching your script, sharp-tongued, trusting nobody."), t("「我的结局，一个字都不能被偷！」", "“That ending is mine. Not one word of it was supposed to get out!”")),
      r(t("一直在算票房，逮谁骂谁，一提预算就打哈哈。", "Doing box-office math out loud, yelling at everyone, laughing off any budget question."), t("「热搜第一！你们知道这值多少钱吗？……我是说，太过分了！」", "“Number one trending! Do you know what that's worth? …I mean, how terrible!”")),
      r(t("一边给人补妆一边套话，手机一直扣在桌上。", "Touching up faces while fishing for gossip; your phone stays face-down."), t("「来，补个妆。你刚才说……谁跟谁？」", "“Here, let me touch you up. Now, what were you saying about who and who?”")),
      r(t("话不多，抱着胳膊站在角落，一提女主角就脸红。", "Few words, arms folded in a corner, blushing whenever the female lead is mentioned."), t("「我只拍危险镜头。危险的话，我不说。」", "“I do the dangerous shots. I don't do the talking.”")),
      r(t("抱着一大摞剧本数来数去，越数越慌。", "Counting and recounting a stack of scripts, more panicked each time."), t("「剧本一共二十份……十九……怎么是十九份？」", "“Twenty copies of the script… nineteen… why are there nineteen?”")),
    ],
  },
  // the scenes set in one community's everyday life
  ...GROUP_GUIDES,
};

/** The guide for a built-in scene, if it has one yet. */
export function sceneGuide(id: string | null | undefined): SceneGuide | undefined {
  return id ? GUIDES[id] : undefined;
}

/** How to play one role of a scene (found by the role's Chinese name, the same on every phone). */
export function roleGuide(id: string | null | undefined, role: T | null | undefined): RoleGuide | undefined {
  const guide = sceneGuide(id);
  if (!guide || !role) return undefined;
  const i = SCENES.find((s) => s.id === id)?.roles.findIndex((x) => x.name.zh === role.zh) ?? -1;
  return i >= 0 ? guide.roles[i] : undefined;
}
