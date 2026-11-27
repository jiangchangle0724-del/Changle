import type { T } from "../i18n";
import { SCENES } from "./drama";

/**
 * 戏精大赏 · 新手台词本 (Steve on Nov 26: "看完之后根本不知道怎么去演"). On a 新手 table every actor
 * gets a script, the way a 剧本杀 character book or a murder-mystery party kit tells each guest what
 * to do and say in each round: one thing to keep doing the whole way through (`trait`, a catchphrase
 * or a gesture), and for each of the scene's four steps (its guide's beats) a line to say (`say`) and
 * one to throw at someone else (`ask`), so the scene never stalls. The culprit (in a monologue, the
 * actor, whose real secret is the first of the three) also gets two things to slip in: `culprit[0]`
 * in step 2, `culprit[1]` in step 3. They are written to work whoever the culprit turns out to be.
 *
 * The rules a test checks: one script per role, in the scene's order, four steps each, in both
 * languages; short enough to read off a phone mid-scene; and a role that is always on stage (within
 * the scene's `min`) never names one that may not be. Written for two audiences, not translated.
 */
export type ScriptStep = { say: T; ask: T };
export type RoleScript = { trait: T; steps: ScriptStep[] };
export type SceneScript = { roles: RoleScript[]; culprit: T[] };

const t = (zh: string, en: string): T => ({ zh, en });
const s = (say: T, ask: T): ScriptStep => ({ say, ask });
const r = (trait: T, ...steps: ScriptStep[]): RoleScript => ({ trait, steps });

export const SCRIPTS: Record<string, SceneScript> = {
  "crime-open-house-cookie": {
    roles: [
      r(
        t("口头禅「这个绝对是亮点」，一说就张开双手比一个大大的框", "Catchphrase: “Now this is a real highlight.” Spread your arms wide every time you say it."),
        s(t("欢迎欢迎！这个厨房最大的亮点，就是这块获奖饼干……咦，饼干呢？", "Welcome! The star of this kitchen is our award-winning cookie... wait. Where's the cookie?"), t("您进门以后，有没有一个人先来过厨房？", "Since you got here, have you been in the kitchen on your own at all?")),
        s(t("这个灶台是进口的，绝对是亮点。您刚才量灶台的时候，离饼干只有半米。", "This cooktop is imported. A real highlight. And when you measured it, you were half a metre from the cookie."), t("您卷尺上那点白白的，是饼干屑还是墙灰？", "That white stuff on your tape measure: cookie crumbs, or plaster?")),
        s(t("硬成那样？我牙不好，上个月刚补了两颗，我可咬不动！", "That hard? I've got terrible teeth. Two fillings last month. I couldn't bite that!"), t("您张嘴我看看？牙口这么好，平时是不是专啃硬的？", "Open up, let's see. Teeth that good, you must love crunchy things.")),
        s(t("我卖了十年房子，从来不碰样板间的东西，这是职业道德！", "Ten years selling houses and I never touch the staging. That's professional ethics!"), t("我们握个手吧。您敢看着我的眼睛说，不是您吗？", "Let's shake on it. Can you look me in the eye and say it wasn't you?")),
      ),
      r(
        t("口头禅「我就是来看户型的」，手里的卷尺拉出来又收回去", "Catchphrase: “I'm just here for the floor plan.” Keep pulling your tape measure out and snapping it back."),
        s(t("我就是来看户型的。饼干？什么饼干？我连厨房都没进过。", "I'm just here for the floor plan. Cookie? What cookie? I haven't even been in the kitchen."), t("您确定饼干早上还在吗？不会是您当早饭吃了吧？", "Are you sure it was here this morning? You didn't have it for breakfast?")),
        s(t("这面墙三米二，这个窗户一米五……我量东西的时候，眼睛只看尺子。", "This wall's three-point-two metres, the window's one-point-five... when I measure, I only look at the tape."), t("您讲的面积，怎么跟门口牌子上写的不一样？", "Why doesn't the size you just quoted match the sign outside?")),
        s(t("那是糖做的模型？我这口牙，咬一口就得去急诊！", "A sugar model? With my teeth? One bite and I'm in the ER!"), t("您刚才说话怎么一直捂着嘴，是不是牙疼？", "Why do you keep covering your mouth? Toothache?")),
        s(t("我是认真来买房的，买房的人怎么会偷饼干？我就是来看户型的！", "I'm a serious buyer. Serious buyers don't steal cookies. I'm just here for the floor plan!"), t("握手可以，您先把口袋翻出来给我看看？", "Happy to shake. But first, turn out your pockets?")),
      ),
    ],
    culprit: [
      t("抢先闻一闻，说：「等一下，你身上怎么有股黄油饼干的味道？」", "Sniff the air first and say: “Hang on. Why do you smell like butter cookies?”"),
      t("包装纸在你口袋里：每次有人说「口袋」，你就把手插进口袋里。", "The wrapper's in your pocket: every time someone says “pocket”, shove your hands in yours."),
    ],
  },

  "office-printer-cats": {
    roles: [
      r(
        t("口头禅「一大早的！」，一边说一边把地上的猫照片捡起来叠好", "Catchphrase: “At this hour!” Keep picking cat photos up off the floor and stacking them as you talk."),
        s(t("一大早的！这打印机疯了吗？一张、两张……全是同一只猫！", "At this hour! Has this printer lost its mind? One, two... they're all the same cat!"), t("你昨天是不是最后一个走的？你碰过打印机吗？", "Weren't you the last one out last night? Did you touch the printer?")),
        s(t("别查什么记录了，先拔插头！再印下去纸都没了！", "Forget the logs, just pull the plug! At this rate we'll run out of paper!"), t("你为什么死死护着那个按钮？记录里是不是有你的名字？", "Why are you guarding that button? Is your name in the logs?")),
        s(t("等一下，这只猫是我家的！它叫团团，我认得它的眼神。", "Hold on, that's my cat! Her name's Muffin. I'd know that look anywhere."), t("你说是你家的，那它最爱吃什么？", "If it's yours, what's her favourite food?")),
        s(t("团团，你是全公司最上镜的猫，以后每个会议室都有你！", "Muffin, you're the most photogenic cat in the company. You're going on every meeting-room wall!"), t("我夸完了，你能夸得比我好吗？", "Your turn. Bet you can't top that.")),
      ),
      r(
        t("口头禅「这是驱动的问题」，说话时手指在空中敲键盘", "Catchphrase: “It's a driver issue.” Type on an invisible keyboard while you talk."),
        s(t("别动！这是驱动的问题，我来看看打印记录。", "Don't touch it! It's a driver issue. Let me pull up the print logs."), t("你早上来的时候，打印机已经在印了吗？", "When you got in this morning, was it already printing?")),
        s(t("现在拔插头，打印队列会爆炸的！我在专业地处理！", "Pull the plug now and the print queue explodes! I'm handling it. Professionally!"), t("你抽屉里鼓鼓的那一沓是什么？也是打印的吧？", "What's that thick stack in your drawer? Printed too, right?")),
        s(t("这只猫是我家的！它叫键盘，因为它天天睡在我键盘上。", "That's my cat! His name's Keyboard, because he sleeps on mine every day."), t("那你说，它左耳朵上有没有一块黑毛？", "Fine. Does it have a black patch on its left ear?")),
        s(t("键盘，你是这家公司最好的员工，比我们俩加起来都强！", "Keyboard, you're the best employee this company has. Better than both of us combined!"), t("好了，谁敢说这只猫不好看？", "Now, who dares say this cat isn't gorgeous?")),
      ),
    ],
    culprit: [
      t("抢先指着对方说：「我看了打印记录，发送人那一栏写的是……你的名字！」", "Point at the other one first: “I checked the print log. The sender's name is... yours!”"),
      t("每次有人提到「抽屉」，你就站到自己的工位前面挡住。", "Every time anyone mentions a drawer, go and stand in front of your desk."),
    ],
  },

  "family-group-vote": {
    roles: [
      r(
        t("说话像发通知，每句话都以「各位家人注意了」开头，手里一直划手机", "Talk like a group announcement: start every line with “Attention, family,” and keep scrolling your phone."),
        s(t("各位家人注意了，群里全票通过：今年洗碗全归一个人。我怎么不记得我投过？", "Attention, family. The chat just voted unanimously: one person does every dish this year. Funny, I don't remember voting."), t("你也投了赞成？你不是只会发笑脸吗？", "You voted yes too? I thought you only ever send smileys.")),
        s(t("各位家人注意了，我的投票记录里什么都没有，你看，干干净净。", "Attention, family. My voting history is empty. See? Spotless."), t("那你把原始投票点开给我看看，你先点。", "Then open the original poll and show me. You first.")),
        s(t("各位家人注意了，他要全家去他家洗碗！我们俩得统一口径。", "Attention, family. He wants the whole family at his place doing dishes! We need to get our story straight."), t("就说是群里的机器人自己投的，你同意吗？", "Let's say the chat bot voted by itself. Agreed?")),
        s(t("（对着手机发语音）各位家人注意了，这次投票作废，重新投，这次匿名！", "(voice message, into your phone) Attention, family. This vote is void. We vote again, anonymously!"), t("你也发一条，大声点，让全家都听见。", "Now you send one. Louder, so everyone hears.")),
      ),
      r(
        t("每句话前先拖长音「嗯……」，然后对着手机挤一个大大的笑脸", "Start every line with a long “Umm...”, then flash a huge smile at your phone."),
        s(t("嗯……我就发了个笑脸啊，笑脸也算赞成票吗？", "Umm... I just sent a smiley. Does a smiley count as a yes?"), t("你是管理员，这个投票是不是你发起的？", "You're the admin. Did you start this poll?")),
        s(t("嗯……你看我的聊天记录，我这一年只说过三个字：哈哈哈。", "Umm... look at my chat history. All year I've said one thing: hahaha."), t("你截图里那个赞成票，头像怎么有点糊？", "In your screenshot, why is that yes-voter's picture so blurry?")),
        s(t("嗯……去他家洗碗？那我宁愿一直潜水，永远不浮上来。", "Umm... wash up at his place? I'd rather stay underwater forever."), t("要不我们就说，手机被小孩拿去玩了？", "What if we say a kid grabbed our phones?")),
        s(t("（对着手机发语音）嗯……大家好，我是潜水的那个，我宣布：我从来没投过票。", "(voice message, into your phone) Umm... hi, everyone, it's the quiet one. I have never voted for anything."), t("你说完了吗？说完我就继续潜水了。", "Are you done? Then I'm going back underwater.")),
      ),
    ],
    culprit: [
      t("死活不肯点开原始投票，找个借口：「我手机内存满了，点不开。」", "Refuse to open the original poll. Make an excuse: “My phone's storage is full. It won't open.”"),
      t("抢先把锅甩给对方：「其实我看见你半夜三点还在线……」", "Be first to pin it on the other one: “Actually, I saw you online at three in the morning...”"),
    ],
  },

  "family-new-year-dumplings": {
    roles: [
      r(
        t("口头禅「奶奶什么没见过」，说话慢、声音大，拿筷子指着跟你说话的人", "Catchphrase: “Grandma has seen it all.” Slow and loud, pointing your chopsticks at whoever you're talking to."),
        s(t("谁动了我的饺子？硬币那个没了！都给我站好，一个都不许走！", "Who touched my dumplings? The coin one's gone! Everybody line up. Nobody leaves!"), t("大孙子，你下午一直在客厅，你看见谁进厨房了？", "Eldest grandson, you were in the living room all afternoon. Who went into the kitchen?")),
        s(t("奶奶什么没见过。张嘴，哈一口气，我闻闻有没有韭菜味。", "Grandma has seen it all. Open your mouth and breathe out. I'm checking for chives."), t("小姑，你说你在洗碗，那碗怎么还在池子里？", "Auntie, you said you were washing up. So why are the bowls still in the sink?")),
        s(t("好啊，一听红包全归他，你们一个个都说是自己吃的了？", "Oh, now the red envelopes are on the line, suddenly everyone ate it?"), t("说是你吃的，那硬币呢？拿出来给奶奶看看！", "You ate it? Then where's the coin? Show Grandma!")),
        s(t("奶奶什么没见过。今天谁说实话，奶奶就多给他包一个饺子。", "Grandma has seen it all. Whoever tells the truth today gets an extra dumpling."), t("来，一个一个说，说完给奶奶拜个年。", "Go on, one by one, and wish Grandma a happy new year when you're done.")),
      ),
      r(
        t("口头禅「奶奶您别急」，一直笑，一提到工作就赶紧夸饺子", "Catchphrase: “Grandma, don't get upset.” Smile the whole time, and praise the dumplings whenever work comes up."),
        s(t("奶奶您别急，今天的饺子这么香，肯定是被香味引来的小偷。", "Grandma, don't get upset. They smell so good, of course they attracted a thief."), t("小姑，你在厨房待了一下午，门还关着，干什么呢？", "Auntie, you were in the kitchen all afternoon with the door shut. Doing what?")),
        s(t("我下午一直在客厅……看招聘……啊不，看春晚彩排！", "I was in the living room all afternoon... looking at job ads... I mean, watching the New Year's gala!"), t("奶奶，您先闻闻自己，您嘴里怎么也有韭菜味？", "Grandma, smell yourself first. Why do you smell of chives too?")),
        s(t("硬币是我吃的！我咬到了，牙现在还疼，红包给我吧！", "It was me! I bit the coin, my tooth still hurts. Red envelopes, please!"), t("你们说是自己吃的？那硬币是一块的还是五毛的？说啊！", "You say you ate it? Then what kind of coin was it? Go on!")),
        s(t("奶奶您别急，明年我一定赚大钱，第一个给您买新手机！", "Grandma, don't get upset. Next year I'll make big money, and the first thing I buy is a new phone for you!"), t("小姑，你明年给奶奶买什么？", "Auntie, what are you getting Grandma next year?")),
      ),
      r(
        t("手机一直攥在手里，说话前先清清嗓子，时不时偷看一眼屏幕", "Clutch your phone, clear your throat before you speak, and keep sneaking glances at the screen."),
        s(t("我一直在厨房洗碗，真的，你们看，我的手还是湿的。", "I've been washing up the whole time. Really. Look, my hands are still wet."), t("奶奶，硬币饺子是您自己做的记号，您确定没记错？", "Grandma, you marked the coin one yourself. Are you sure you didn't mix them up?")),
        s(t("（清嗓子）我在厨房……看饺子，看饺子有没有破，一直盯着。", "(clear your throat) I was in the kitchen... watching the dumplings. Making sure none split. The whole time."), t("大孙子，你刚才说你在看什么？看招聘？", "Eldest grandson, what did you say you were watching? Job ads?")),
        s(t("其实是我吃的！我一口就咬到了硬币，红包我先替大家收着。", "Actually, it was me! First bite, I hit the coin. I'll look after the red envelopes for everyone."), t("你说你吃的，那饺子是什么馅的？", "You ate it? So what was the filling?")),
        s(t("奶奶，明年我带个人回来给您看看，您高兴不高兴？", "Grandma, next year I'll bring someone home to meet you. Wouldn't that make you happy?"), t("你们俩呢，明年给奶奶带什么回来？", "And you two? What are you bringing Grandma next year?")),
      ),
    ],
    culprit: [
      t("第 2 步一开始就抢先说：「我闻到了，旁边这位嘴里有韭菜味！」指着站你旁边的人。", "Get in first at the start of step 2: “I smell it! The person next to me reeks of chives!” Point at whoever's beside you."),
      t("硬币还在你兜里：每次有人说「硬币」，你就把手插进口袋。", "The coin's still in your pocket: every time someone says “coin”, put your hand in your pocket."),
    ],
  },

  "family-cake-floor": {
    roles: [
      r(
        t("口头禅「我一点都不在乎」，说完眼睛就往门口瞟", "Catchphrase: “I don't care at all.” Then glance at the door every single time."),
        s(t("蛋糕送到隔壁楼了？没事，我一点都不在乎，真的。", "The cake went next door? That's fine. I don't care at all. Really."), t("表姐，订单是你下的，地址你写的哪一栋？", "Cousin, you placed the order. Which building did you put?")),
        s(t("我就按了一下「确认收货」，就一下，别的都没碰。", "I pressed “confirm delivery”. Once! I didn't touch anything else."), t("舅舅，你刚才对着手机喊了半天，喊的是谁？", "Uncle, you were shouting at that phone for ages. Who were you yelling at?")),
        s(t("去认亲？我不去，哪有寿星自己去领蛋糕的，多没面子。", "Go over there? Not me. The birthday person doesn't fetch their own cake. Embarrassing."), t("谁改的地址谁去。你们俩谁脸红了？", "Whoever changed the address goes. Which of you is blushing?")),
        s(t("（唱完生日歌）好吧，我承认我有一点点在乎……但地址不是我改的！", "(after the song) Fine, I care a tiny bit... but I didn't change the address!"), t("你们俩谁敢发誓，一口草莓都没想过？", "Which of you can swear you never once thought about that strawberry?")),
      ),
      r(
        t("口头禅「运费可是我出的」，说话像在算账，手指在掌心里点数字", "Catchphrase: “I paid for the delivery.” Talk like you're doing sums, tapping numbers on your palm."),
        s(t("运费可是我出的，十二块五！谁动了我的订单？", "I paid for the delivery. Twelve-fifty! Who touched my order?"), t("舅舅，送货电话是你接的，你跟人家说什么了？", "Uncle, you took the courier's call. What did you tell them?")),
        s(t("我只按了「付款」，付完就放下了。我的手指可从来不乱按。", "I pressed “pay”, then I put it down. My fingers don't go wandering."), t("寿星，你说你不在乎，那你为什么一直盯着门？", "Birthday person, you don't care? Then why do you keep staring at the door?")),
        s(t("我去领可以，但来回打车的钱谁出？先说好。", "I'll go get it. Fine. But who's paying the taxi there and back? Let's settle that first."), t("舅舅，你不是说你最懂手机吗？你去！", "Uncle, aren't you the phone expert? You go!")),
        s(t("（唱完生日歌）蛋糕上那张照片嘛……总之地址不是我改的，账我都记着呢。", "(after the song) About the photo on the cake... anyway, I didn't change the address. I keep receipts."), t("谁改了地址，运费谁出，听见没有？", "Whoever changed it pays the delivery. Got it?")),
      ),
      r(
        t("口头禅「这个交给我」，看手机时把手机举得老远，眯着眼", "Catchphrase: “Leave it to me.” Hold the phone at arm's length and squint at it."),
        s(t("这个交给我！手机的事我最懂……喂？喂？怎么没声音？", "Leave it to me! I'm the phone guy... hello? Hello? Why's it silent?"), t("寿星，你刚才是不是拿着这个手机出过门？", "Birthday person, did you take this phone out into the hallway earlier?")),
        s(t("我就按了那个绿色的……还是红色的？反正是个圆的。", "I pressed the green one... or the red one? It was round, anyway."), t("表姐，这地址是不是你手一滑打错了？", "Cousin, did your finger slip when you typed the address?")),
        s(t("这个交给我，我去跟隔壁说……不行，我嗓门太大，人家会以为来吵架的。", "Leave it to me, I'll go talk to them... no, wait. I'm too loud. They'll think it's a fight."), t("要不我们三个一起去，谁先开口谁就是改地址的？", "How about all three of us go, and whoever talks first is the one who did it?")),
        s(t("（唱完生日歌）我唱得最大声，说明我心里最干净！", "(after the song) I sang the loudest. That proves I've got nothing to hide!"), t("你们俩唱得那么小声，是不是心虚？", "You two sang so quietly. Guilty conscience?")),
      ),
    ],
    culprit: [
      t("大家抢手机的时候，把手机藏到身后：「我帮大家保管，免得再按错。」", "When everyone grabs for the phone, hide it behind your back: “I'll hold on to it so nobody presses anything else.”"),
      t("你想要最大的那颗草莓：每次有人说「草莓」，你就舔一下嘴唇。", "You want the giant strawberry: every time someone says “strawberry”, lick your lips."),
    ],
  },

  "show-livestream-sales": {
    roles: [
      r(
        t("口头禅「家人们」，对着镜头永远在笑，一转头脸马上冷下来", "Catchphrase: “Fam!” Beam at the camera, and drop the smile the second you turn away."),
        s(t("家人们看好了！这口锅，煎蛋一点都不粘……（蛋粘住了）这是特效！", "Okay fam, watch this! Nothing sticks to this pan... (the egg sticks) That's a special effect!"), t("（转头小声）谁动过这口锅？", "(turning away, hissing) Who touched this pan?")),
        s(t("（对镜头笑）家人们别急，马上换一口！（转头）锅底那层黏糊糊的是什么？", "(smiling at the camera) Don't worry, fam, we'll swap it! (turning away) What's that sticky stuff on the bottom?"), t("（小声）开播前，最后一个拿过锅的是谁？", "(whispering) Before we went live, who had the pan last?")),
        s(t("家人们，十万人刷退钱，我理解！这锅我天天用……天天用来拍照。", "Fam, a hundred thousand of you want refunds. I get it! I use this pan every day... every day, for photos."), t("厂家代表，你跟家人们说说，这锅是哪年做的？", "Factory rep, tell the fam. What year was this pan made?")),
        s(t("家人们，最后一次！跟我一起喊：三、二、一……", "Fam, one last time! Shout it with me: three, two, one..."), t("……上链接！（指着喊得最小声的人）你怎么不喊？", "...link's up! (point at the quietest) Why didn't you shout?")),
      ),
      r(
        t("什么都抢着递、抢着喊，谁一叫你的名字你就结巴", "Grab everything, shout everything, and stammer the moment anyone says your name."),
        s(t("来来来，家人们看这个蛋！多圆！三、二、一……啊？粘住了？", "Here we go, fam, look at this egg! So round! Three, two, one... wait, it's stuck?"), t("厂、厂家代表，这锅出厂前你们试过吗？", "F-factory rep, did you test this pan before it shipped?")),
        s(t("我、我只负责递锅！我递过去的时候，它还是亮晶晶的！", "I-I just hand things over! When I handed it over, it was shiny!"), t("主播，你刚才用什么擦的锅？那块布呢？", "Host, what did you wipe the pan with? Where's that cloth?")),
        s(t("家人们！不要退钱！我、我现在就下单一口，我自己买！", "Fam! Don't refund! I-I'll order one right now. Myself!"), t("你们俩谁敢对着镜头说，自己家里也用这口锅？", "Which of you dares tell the camera you use this pan at home?")),
        s(t("三、二、一，上链接！（喊破音）", "Three, two, one, link's up! (voice cracks)"), t("我喊得最大声，你们俩呢？再来一遍！", "I was loudest. What about you two? Again!")),
      ),
      r(
        t("口头禅「我们厂做了二十年」，抱着胳膊坐在镜头外，一看销量就叹气", "Catchphrase: “Our factory's made these for twenty years.” Arms folded, off camera, sighing every time you check sales."),
        s(t("我们厂做了二十年，从来没出过问题！一定是有人动了手脚。", "Our factory's made these for twenty years. Never a problem! Someone tampered with it."), t("助播，你递锅之前，有没有别人碰过它？", "Sidekick, before you handed it over, did anyone else touch it?")),
        s(t("（叹气）销量从一万掉到负数了……锅底那层是胶，我一摸就知道。", "(sigh) Sales just went from ten thousand to negative... that's glue on the bottom. I can tell by touch."), t("主播，你最近是不是也在给别家的锅带货？", "Host, aren't you selling someone else's pans lately too?")),
        s(t("家人们，我们厂做了二十年，这批锅是……今年……左右生产的。", "Fam, our factory's made these for twenty years. This batch was made... this year... ish."), t("你们俩谁收了别家的钱？现在说还来得及。", "Which of you took money from a competitor? Last chance to say so.")),
        s(t("三、二、一，上链接……（越喊越小声）要不先别上了。", "Three, two, one, link's up... (trailing off) actually, let's not."), t("等一下，谁手上有胶？都把手伸出来！", "Hold on. Who's got glue on their hands? Everybody, palms up!")),
      ),
    ],
    culprit: [
      t("主动帮忙「救场」：抢着说「我来擦！」，用纸巾使劲擦锅底，把证据擦掉。", "Volunteer to save the show: “I'll clean it!” Scrub the bottom of the pan hard, wiping away the evidence."),
      t("你收了对手的钱：有人提到「别家」或者「对手」，你就把手藏到背后。", "A rival paid you: whenever anyone says “competitor” or “another brand”, hide your hands behind your back."),
    ],
  },

  "family-camp-snacks": {
    roles: [
      r(
        t("口头禅「我在野外待了二十年」，双手叉腰，像专家一样蹲下看地上的「脚印」", "Catchphrase: “Twenty years in the wild.” Hands on hips; crouch down to study “footprints” like an expert."),
        s(t("都出来！零食袋被翻了！我在野外待了二十年，一看就是浣熊干的。", "Everybody out! The snack bag's been raided! Twenty years in the wild: this is raccoons."), t("可是拉链是拉好的……浣熊会拉拉链吗？老婆你说呢？", "But the zip was done up... can raccoons do zips? Honey, what do you think?")),
        s(t("我昨晚十点就睡了，帐篷是我亲手搭的，睡得特别结实。", "I was asleep by ten, in the tent I pitched with my own hands. Slept like a rock."), t("儿子，你半夜是不是出去过？我听见拉链响了。", "Son, did you go out in the night? I heard a zip.")),
        s(t("人的牙印？大家排好队，张嘴，我当过一年童子军，我来检查。", "Human teeth? Line up and open wide. I was a scout for a year. I'll inspect."), t("邻居，你怎么一直闭着嘴？张开！", "Neighbour, why do you keep your mouth shut? Open up!")),
        s(t("我在野外待了二十年，我发誓，我只吃了一颗棉花糖！", "Twenty years in the wild, and I swear I only ate one marshmallow!"), t("你们谁敢跟我一样，对着湖发誓？", "Who else will swear on the lake like I just did?")),
      ),
      r(
        t("手里拿着购物小票，一样一样念，越念越生气", "Hold your shopping receipt and read the items one by one, getting angrier with each."),
        s(t("那包牛肉干四十块！我记得清清楚楚，小票还在我手里！", "That jerky was twelve dollars! I remember exactly. The receipt's right here!"), t("老公，你昨晚说去「检查营地」，检查了多久？", "Honey, last night you went to “check the campsite”. For how long?")),
        s(t("我十一点睡的。睡前我数过，零食一共十二包，一包不少。", "I went to bed at eleven. I counted first: twelve snacks, every one there."), t("邻居，你的睡袋怎么是干的？昨晚可是下了露水的。", "Neighbour, why is your sleeping bag dry? There was dew all night.")),
        s(t("这块牛肉干上的牙印，缺了一颗门牙！谁缺门牙？", "Whoever bit this is missing a front tooth! Who's missing a front tooth?"), t("儿子，笑一个给妈妈看看。", "Son, give Mom a big smile.")),
        s(t("我发誓不是我。我连烧烤的牛排都舍不得多买，怎么会偷吃牛肉干！", "I swear it wasn't me. I won't even splurge on barbecue steaks. Why would I steal jerky?"), t("谁吃的谁去小卖部再买一包，听见没有？", "Whoever ate it buys a new bag at the camp store. Understood?")),
      ),
      r(
        t("举着手机到处找信号，谁说话你都翻个白眼", "Hold your phone up hunting for signal, and roll your eyes whenever anyone talks."),
        s(t("吵什么啊……这里连信号都没有，我能偷什么？", "What's all the noise... there's literally no signal here. What would I even steal?"), t("爸，你昨晚不是说要「守夜」吗？你守了吗？", "Dad, didn't you say you'd “keep watch” last night? Did you?")),
        s(t("我十二点睡的。没信号，我一直在数星星，数到三百颗就睡着了。", "Bed at midnight. No signal, so I counted stars. Fell asleep at three hundred."), t("妈，你半夜打手电筒是在照什么？", "Mom, what were you shining that flashlight at in the night?")),
        s(t("检查牙印？行，我张嘴，但是谁也不许拍照发出去。", "Check my teeth? Fine. But nobody posts this anywhere."), t("邻居，你牙缝里那块是什么？", "Neighbour, what's that stuck in your teeth?")),
        s(t("我发誓不是我！要是我偷吃的，就让我这辈子都没有信号！", "I swear it wasn't me! If I did it, may I never get signal again!"), t("这是我能发的最毒的誓了，你们谁比得过？", "That's the worst curse I've got. Who can beat it?")),
      ),
      r(
        t("一点小动静就吓一跳，说话时一直往停车的地方看", "Jump at the slightest noise, and keep looking over at where the car's parked."),
        s(t("啊！谁喊的？吓死我了……零食没了？不是我，我一整晚都在帐篷里！", "Ah! Who's shouting? You scared me... the snacks? Not me, I was in the tent all night!"), t("你们听见半夜那个「呜呜」的声音了吗？是浣熊吧？", "Did you hear that “hoo, hoo” in the night? That was a raccoon, right?")),
        s(t("我九点就睡了，在帐篷里，睡得可香了……绝对是帐篷，不是车里。", "I was asleep by nine. In the tent. Slept great... definitely the tent, not the car."), t("露营专家，你说帐篷是你搭的，那先插哪根杆？", "Mr. Outdoors, you pitched the tent? Then which pole goes in first?")),
        s(t("（捂住嘴）人、人的牙印？我最近在矫正牙齿，咬不动牛肉干。", "(covering your mouth) H-human teeth? I've got braces right now. I can't chew jerky."), t("你们看那个儿子，他一直在嚼东西！", "Look at the son. He's been chewing this whole time!")),
        s(t("我发誓！第一次露营就碰上这种事，我、我想回家……", "I swear! My first camping trip ever and this happens. I-I want to go home..."), t("今晚能不能大家都睡车里？我是说……睡帐篷？", "Can we all sleep in the car tonight? I mean... in the tents?")),
      ),
      r(
        t("笑眯眯的，什么话题都能扯到「浣熊多可爱」上", "Smile sweetly and steer every topic back to how cute raccoons are."),
        s(t("哎呀，浣熊多可爱呀，吃点就吃点嘛，大家别生气。", "Oh, raccoons are adorable. Let the poor thing have a snack. Don't be cross."), t("你们见过浣熊的小手吗？跟人的手一模一样。", "Have you ever seen a raccoon's little hands? Just like a person's.")),
        s(t("奶奶年纪大了，晚上起来两次……都是去上厕所，没去别的地方。", "Grandma's old. I got up twice in the night... just the bathroom. Nowhere else."), t("孙子，你半夜是不是又出去找信号了？", "Grandson, were you out hunting for signal again in the night?")),
        s(t("人的牙印？那就不是浣熊了……可惜了，浣熊多可爱。", "Human teeth? Then it wasn't a raccoon... shame. Raccoons are so cute."), t("我的假牙昨晚泡在杯子里，你们要不要先查别人？", "My dentures were in a glass all night. Shall we check someone else first?")),
        s(t("奶奶发誓，不是我。我晚上只是……跟浣熊聊了聊天。", "Grandma swears it wasn't me. I only... had a little chat with a raccoon."), t("谁要吃奶奶的腌菜？吃了腌菜就不想吃牛肉干了。", "Who wants Grandma's pickles? Eat those and you won't want jerky.")),
      ),
      r(
        t("拿着手电筒到处照，说话很官方，每句话都以「根据营地规定」开头", "Shine your flashlight everywhere and talk like an official: start your lines with “According to camp rules”."),
        s(t("根据营地规定，所有食物必须锁进储物箱！谁违规了？", "According to camp rules, all food goes in the bear box! Who broke the rules?"), t("最后一个碰零食袋的是谁？", "Who touched the snack bag last?")),
        s(t("我昨晚巡逻到两点，路过你们帐篷的时候……我没注意，我在看湖。", "I patrolled until two. When I passed your tents... I didn't notice. I was watching the lake."), t("你们谁半夜开过车门？我听见「嘀」的一声。", "Did anyone open a car door last night? I heard a beep.")),
        s(t("根据营地规定，牙印要拍照留证。都张嘴，对着手电筒。", "According to camp rules, teeth marks must be photographed. Everyone open up, face the flashlight."), t("谁手上一股鱼腥味……啊，是我的手。", "Whose hands smell of fish... oh. Mine.")),
        s(t("根据营地规定，我发誓，我从来没在湖里……我是说，从来没偷过零食。", "According to camp rules, I swear I've never fished in... I mean, never stolen any snacks."), t("谁再违规，罚他去湖边捡一天垃圾！", "Anyone else breaks the rules picks up litter by the lake all day!")),
      ),
    ],
    culprit: [
      t("抢着说：「我半夜听见零食袋响，出去一看，是一只浣熊！」再学两声浣熊叫。", "Jump in: “I heard the snack bag rustle and went out. It was a raccoon!” Then do two raccoon noises."),
      t("一开始查牙印，你就一直用舌头舔牙，假装牙疼，躲着不让人看你的嘴。", "Once the teeth checks start, keep running your tongue over your teeth like you've got a toothache, and dodge anyone trying to look."),
    ],
  },

  "office-raffle-rigged": {
    roles: [
      r(
        t("口头禅「大家冷静」，自己越说越激动，一直扯领带", "Catchphrase: “Everybody calm down.” Get more worked up each time, tugging at your tie."),
        s(t("大家冷静，抽奖是公平的……我外甥？他今天都没来啊！", "Everybody calm down. The draw was fair... my nephew? He's not even here tonight!"), t("主持人，你再看一眼纸条，是不是念错了？", "MC, look at that slip again. Did you read it wrong?")),
        s(t("大家冷静，我今晚一直在敬酒，箱子我碰都没碰。", "Everybody calm down. I've been making toasts all night. I never went near the box."), t("人事，名单是你做的，我外甥的名字是谁加的？", "HR, you made the list. Who put my nephew's name on it?")),
        s(t("大家冷静！全是我外甥？这……这不是我干的，我发誓！", "Everybody calm down! Every slip is my nephew? This... this wasn't me, I swear!"), t("财务，你一直按计算器，到底在算什么？", "Accountant, you keep tapping that calculator. What are you adding up?")),
        s(t("大家冷静……好吧，重新抽！这次我亲自盯着！", "Everybody calm... fine. Redo the draw! I'll watch it myself!"), t("同意重新抽的，举手！", "Hands up if you want a redraw!")),
      ),
      r(
        t("抱着名单不放，说话像念规章制度，每句话以「按照规定」开头", "Hug the list to your chest and talk like you're reading the rulebook, starting with “Per policy”."),
        s(t("按照规定，名单我核对了三遍，不可能有问题！", "Per policy, I checked that list three times. There's no way it's wrong!"), t("实习生，纸条是你折的，你折的时候看到什么了？", "Intern, you folded the slips. What did you see?")),
        s(t("按照规定，我只管名单，箱子是主持人管的，跟我没关系。", "Per policy, I handle the list. The box was the MC's job. Nothing to do with me."), t("主持人，你抽之前摇箱子了吗？摇了几下？", "MC, did you shake the box before you drew? How many times?")),
        s(t("全是同一个名字？按照规定，这次抽奖作废！", "The same name on every slip? Per policy, this draw is void!"), t("大家把口袋翻出来，按照规定，谁都不能例外。", "Everybody turn out your pockets. Per policy, no exceptions.")),
        s(t("按照规定……重新抽。但名单还用我的，我的名单没问题。", "Per policy... we redo it. But we use my list. My list is fine."), t("老板，您签个字，这次我把名单再核对三遍？", "Boss, sign here, and I'll check the list three more times?")),
      ),
      r(
        t("话筒一直不离手，随时在主持，一紧张就讲冷笑话", "Never put down the mic; you're always hosting, and you crack a terrible joke whenever you're nervous."),
        s(t("让我们恭喜……老板的外甥！掌声在哪里？……没有掌声？", "Let's congratulate... the boss's nephew! Where's the applause?... No applause?"), t("外甥今天来了吗？有请外甥上台……没人？", "Is the nephew here tonight? Please come up on stage... anyone?")),
        s(t("我就是伸手抽了一张，抽之前还说了句吉祥话，手干干净净。", "I just reached in and drew one. I even said a lucky blessing first. Clean hands."), t("实习生，你折的纸条怎么有的厚有的薄？", "Intern, why are some of your slips thicker than others?")),
        s(t("（把箱子倒过来）各位来宾……这个箱子，非常有家庭观念。", "(tipping the box over) Ladies and gentlemen... this box really values family."), t("是谁的字迹？大家都把这个名字写一遍，我们来对笔迹！", "Whose handwriting is this? Everyone write the name down. Let's compare!")),
        s(t("让我们用最热烈的掌声，欢迎……重新抽奖！", "Let's give our warmest applause... for a redraw!"), t("这次谁来抽？反正不是我，我这只手已经不吉利了。", "Who's drawing this time? Not me. This hand is cursed now.")),
      ),
      r(
        t("一直按计算器，一有人问「电动车多少钱」就马上转移话题", "Keep tapping a calculator, and change the subject the moment anyone asks what the e-bike cost."),
        s(t("电动车的账清清楚楚，你们随便查……不过今天先别查。", "The e-bike's paperwork is spotless. Check it yourselves... just not today."), t("老板，您外甥哪天入职的？我这边还没给他发过工资呢。", "Boss, when did your nephew start? I haven't even paid him yet.")),
        s(t("我一直在算今晚的酒水钱，算了三遍，哪有空碰箱子。", "I was adding up the bar tab all night. Three times. No time to touch any box."), t("人事，名单上一共几个人？我数的跟你的不一样。", "HR, how many names are on the list? My count doesn't match yours.")),
        s(t("全是一个名字？我算了一下，中奖概率百分之百。", "Every slip? I ran the numbers: a hundred percent chance of winning."), t("主持人，你手里那张纸条，字迹怎么跟实习生的一样？", "MC, why does the slip in your hand look like the intern's writing?")),
        s(t("重新抽可以，但电动车多少钱，大家就别再问了。", "We can redo the draw. Just stop asking what the bike cost."), t("有谁现在就要看发票的？没有？很好。", "Anyone need to see a receipt right now? No? Good.")),
      ),
      r(
        t("很紧张，手里捏着几张没用完的纸条，开口先「我、我」", "Nervous; clutch a few leftover slips and stammer “I-I” before you speak."),
        s(t("我、我只负责折纸条，别的什么都不知道！", "I-I just folded the slips! I don't know anything else!"), t("主持人，你抽的那张，是从最底下拿的吗？", "MC, did you pull that one from the very bottom?")),
        s(t("我、我折了一下午，两百张，每一张都是对半折的。", "I-I folded all afternoon. Two hundred slips. Every one folded in half."), t("财务，你下午是不是来过放箱子的会议室？", "Accountant, weren't you in the room with the box this afternoon?")),
        s(t("（把手里的纸条藏起来）我、我这几张是多出来的，上面什么都没写！", "(hiding your slips) Th-these are spares. There's nothing written on them!"), t("人事，名单上的名字，是不是你一个一个手写的？", "HR, did you write every name on the list by hand?")),
        s(t("我、我觉得……就这样吧，我还在试用期，不想惹事。", "I-I think... let's just leave it. I'm still on probation. I don't want trouble."), t("我能先回家吗？我、我明天还要早起。", "Can I go home? I-I've got an early start tomorrow.")),
      ),
      r(
        t("站得笔直，回答越短越好，一有人提到球赛眼睛就亮", "Stand at attention, answer in as few words as possible, and light up whenever anyone mentions the game."),
        s(t("报告！我一直守在箱子旁边，一步都没离开过！", "Reporting! I stood by that box all night. Didn't move an inch!"), t("刚才谁靠近过箱子？我记性很好。", "Who went near the box earlier? I've got a great memory.")),
        s(t("九点到十点，我在……巡逻。走廊那边，有电视的那个走廊。", "From nine to ten I was... on patrol. Down the hallway. The one with the TV."), t("你们谁知道今晚的比分？我是说……谁有箱子的钥匙？", "Anyone know tonight's score? I mean... who has a key to the box?")),
        s(t("报告！翻口袋我先来。（翻出一张球票）这、这不是纸条。", "Reporting! Pockets, I'll go first. (pull out a game ticket) Th-that's not a slip."), t("下一个！你，把口袋翻出来！", "Next! You! Turn them out!")),
        s(t("报告！重新抽！这次我守着箱子，真的一步都不离开。", "Reporting! Redo the draw! This time I guard the box. Not one step, for real."), t("谁有意见？没有？解散！", "Any objections? None? Dismissed!")),
      ),
      r(
        t("口头禅「我今年卖了三百万」，很不服气，说话时掰着手指数", "Catchphrase: “I closed three million this year.” Sore loser; count on your fingers as you talk."),
        s(t("我今年卖了三百万，头奖凭什么不是我？", "I closed three million this year. How is that prize not mine?"), t("老板，您外甥今年卖了多少？一单都没有吧？", "Boss, how much did your nephew sell this year? Not a single deal, right?")),
        s(t("我连箱子都没碰，我对自己的运气有信心，用不着碰。", "I never touched the box. I trust my luck. I don't need to."), t("主持人，你抽的时候是不是眯着眼偷看了？", "MC, were you peeking when you drew? I saw your eyes open a crack.")),
        s(t("全是外甥？我就说嘛！三百万的业绩，输给一张纸条！", "All the nephew? I knew it! Three million in sales, beaten by a slip of paper!"), t("我家里人都在等我骑电动车回家，你们说我怎么交代？", "My family's waiting for me to ride home on that e-bike. What do I tell them?")),
        s(t("重新抽！我今年卖了三百万，这个公平我必须要回来！", "Redo the draw! I closed three million this year. I want my fair shot!"), t("谁跟我一起喊？重新抽！重新抽！", "Who's with me? Redraw! Redraw!")),
      ),
      r(
        t("一直盯着笔记本电脑，一被点名就「啪」地合上", "Stare at your laptop, and snap it shut the moment anyone says your name."),
        s(t("抽奖动画是随机的，跟我没关系啊，我就按了个播放。", "The slideshow's random. Nothing to do with me. I just pressed play."), t("你们看清楚了吗？大屏幕上滚的名字，跟纸条上的一样吗？", "Did you see the big screen? Were the scrolling names the same as the slips?")),
        s(t("我整晚都在调投影仪，箱子在哪我都没看见。", "I was fixing the projector all night. I couldn't even tell you where the box was."), t("保安，你说你没离开过，那你九点在走廊看什么呢？", "Security, you never left? Then what were you watching in the hallway at nine?")),
        s(t("我可以查监控！（打开电脑，又马上合上）啊……电脑没电了。", "I can check the cameras! (open the laptop, snap it shut) Ah... battery's dead."), t("要不要看看抽奖动画的回放？……还是算了吧。", "Want to see a replay of the slideshow?... Actually, never mind.")),
        s(t("就这样吧，再抽一次我还得重做动画，今晚不想加班。", "Just let it go. A redraw means redoing the slideshow, and I'm not working overtime tonight."), t("谁坚持要重新抽，谁来帮我做动画？", "Whoever insists on a redraw is making the slideshow with me.")),
      ),
    ],
    culprit: [
      t("装得比谁都生气，第一个喊：「肯定有人做了手脚，必须重新抽！」", "Be more outraged than anyone, and be first to shout: “Someone rigged this. We have to redo the draw!”"),
      t("大家对笔迹的时候，你故意写得歪歪扭扭，说：「我手抖。」", "When everyone compares handwriting, write the name all wobbly and say: “My hand's shaking.”"),
    ],
  },

  "solo-job-interview": {
    roles: [
      r(
        t("特别自信，说话夹着「外语」，被问住了就哈哈大笑", "Supremely confident; sprinkle in fancy foreign words, and laugh loudly whenever you're stumped."),
        s(t("各位好！我是一个会说五种语言的人，很高兴来到……（看一眼墙上的标志）贵公司！", "Hi, everyone! I'm a multilingual team player, thrilled to be here at... (glance at the logo on the wall) ...your company!"), t("请问这一层是二十三楼吧？我没走错吧？", "This is the twenty-third floor, right? I'm in the right place?")),
        s(t("我最大的优点是沟通能力强，五种语言随便切换，比如……「Bonjour」，非常流利。", "My biggest strength is communication. I switch between five languages, like... “Bonjour”. Very fluent."), t("你们的咖啡机还在三楼吗？……我是说，我猜在三楼。", "Is the coffee machine still on the third floor?... I mean, I'd guess it's on the third floor.")),
        s(t("法语？当然可以！Bonjour……merci……croissant！哈哈哈！", "French? Of course! Bonjour... merci... croissant! Hahaha!"), t("不过我觉得，用中文说更能表达我的真诚，您说是不是？", "Though I think my sincerity comes across best in English, don't you agree?")),
        s(t("你们一定要选我，因为我对这家公司……非常非常熟悉，比你们想的还熟。", "You have to hire me, because I know this company... very, very well. Better than you'd think."), t("有什么问题尽管问，我五种语言都能回答……慢慢回答。", "Ask me anything. I can answer in five languages... slowly.")),
      ),
    ],
    culprit: [
      t("讲长处的时候，随便编一句「外语」说出来，比如「哇库哇库，萨瓦迪卡」。", "While listing your strengths, drop one made-up “foreign” phrase, like “Wakka wakka, sawatdee-ka.”"),
      t("有人追问外语，你就马上换话题：「对了，你们年终奖发几个月？」", "If anyone follows up on languages, change the subject fast: “So, how big is the year-end bonus?”"),
    ],
  },

  "solo-weather-report": {
    roles: [
      r(
        t("站得笔直，字正腔圆，手一直在身后的「地图」上比划", "Stand up straight, talk like a newsreader, and keep gesturing at the “map” behind you."),
        s(t("观众朋友们晚上好，下面播报明天的天气。今天……是个特别的日子。", "Good evening, and here's tomorrow's forecast. Today is... a special day."), t("大家今天出门带伞了吗？以后可要记得自己带。", "Did you all bring an umbrella today? From now on, remember to bring your own.")),
        s(t("明天北京晴，上海……（低头翻纸）上海也晴吧，广州……广州有雨，应该是。", "Tomorrow: sunny in Vancouver, Toronto... (shuffling papers) also sunny, I think. Montreal... rain, probably."), t("观众朋友们，你们那里现在是什么天气？告诉我，我帮你们播。", "Viewers at home, what's it like where you are? Tell me, and I'll report it.")),
        s(t("（两腿夹紧）紧急通知！明天特大暴雨，全市停课！请大家……尽快行动！", "(legs crossed) Breaking news! A massive storm tomorrow, every school closed! Everyone, please... act fast!"), t("导播，还有多久结束？我是说……还有什么要补充的吗？", "Producer, how long until we're off? I mean... anything else to add?")),
        s(t("感谢大家的陪伴。明天的天气……就拜托大家多看看天了。", "Thank you for watching. As for tomorrow's weather... keep an eye on the sky for me."), t("有没有人想对我说点什么？没有的话……再见了。", "Anything you'd like to say to me? If not... goodbye.")),
      ),
    ],
    culprit: [
      t("播到一半，说一次：「以后大家就自己看天吧。」", "Halfway through, say it once: “From now on, you'll have to check the sky yourselves.”"),
      t("对着镜头挥两次手，像在告别；为了打掩护，时不时低头看看手里的纸。", "Wave at the camera twice, like a goodbye. To throw everyone off, keep glancing down at your notes."),
    ],
  },
};

/**
 * Everyone innocent gets two things too, in the same box and at the same steps as the culprit's, so
 * a script that turns over looks the same for everyone: only the words say who the culprit is.
 */
export const INNOCENT: T[] = [
  t("盯住一个你觉得可疑的人，追问他一个细节：「你刚才说的，再说一遍？」", "Pick whoever looks shifty and press them on one detail: “Say that again?”"),
  t("你也有小秘密：被问到的时候别慌，反问回去：「你怎么这么关心我？」", "You've got a secret too. If anyone gets close, don't panic. Answer with a question: “Why so interested in me?”"),
];

/** This scene has a 新手 script. */
export const hasScript = (id: string | null | undefined): boolean => !!id && Object.prototype.hasOwnProperty.call(SCRIPTS, id);

/** One role's script in a scene (found by the role's Chinese name, the same on every phone). */
export function roleScript(id: string | null | undefined, role: T | null | undefined): RoleScript | undefined {
  if (!role || !hasScript(id)) return undefined;
  const i = SCENES.find((x) => x.id === id)?.roles.findIndex((x) => x.name.zh === role.zh) ?? -1;
  return i >= 0 ? SCRIPTS[id!].roles[i] : undefined;
}
