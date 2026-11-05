import type { T } from "../i18n";
import { SCENES } from "./drama";

/**
 * 戏精大赏 · how to act a scene, for people who never have.
 *
 * `beats`: what happens, in four steps everyone reads (the playbill shows them through the scene).
 * `roles`, in the same order as the scene's roles: `play` is how to come across (voice, face,
 * hands) in one line, everyone sees it; `first` is a line to open with, on the actor's own card.
 *
 * Written for two audiences, not translated: the English says it the way an English speaker would.
 * A scene without a guide (the newer batches, and scenes players write) gets `GENERIC_BEATS`.
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
