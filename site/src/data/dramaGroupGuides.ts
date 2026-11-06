import type { T } from "../i18n";
import type { RoleGuide, SceneGuide } from "./dramaGuide";

/**
 * 戏精大赏 · how to act the scenes set in one community's everyday life (`dramaGroups.ts`), written
 * the same way as the rest (`dramaGuide.ts`): four steps everyone reads, and for each role in order,
 * how to come across and a line to open with.
 */

const t = (zh: string, en: string): T => ({ zh, en });
const r = (play: T, first: T): RoleGuide => ({ play, first });

export const GROUP_GUIDES: Record<string, SceneGuide> = {
  /* ---------------------------------------------------------------- 中国 Chinese */
  "cn-family-chat-photo": {
    beats: [
      t("大姑举着手机质问：「刚才是谁发的照片？还撤回了！」", "Auntie Lin holds up her phone: “Who posted that photo, and then deleted it?”"),
      t("每个人说昨晚八点自己在干什么，别人追问一句。", "Everyone says what they were doing at eight last night; someone asks a follow-up."),
      t("反转以后，大家猜照片上到底是谁。", "After the twist, everyone guesses who's really in the photo."),
      t("最后每人对爷爷说一句生日祝福，顺便替自己说句好话。", "To finish, each wishes Grandpa a happy birthday and puts in a good word for themselves."),
    ],
    roles: [
      r(t("说话像在开会，手机一直举着，句句带「我跟你们说」。", "Talk like you're chairing a meeting, phone held high, starting everything with “Let me tell you...”"), t("「我跟你们说，这个群我管了八年，从来没人敢撤回！」", "“Let me tell you, I've run this chat for eight years and nobody has ever deleted a message!”")),
      r(t("一副很懂手机的样子，说话很快，一被问就低头划屏幕。", "Act like the family tech genius: talk fast, and scroll your phone whenever anyone asks you something."), t("「撤回的消息谁都看不到，我教过奶奶的……应该教过吧？」", "“Nobody can see deleted messages. I taught Grandma that... I think?”")),
      r(t("拿着本子到处记，问题特别多，眼睛亮亮的。", "Carry a notebook, ask a hundred questions, eyes shining."), t("「等一下，奶奶有初恋？我要写进作业里！」", "“Wait, Grandma had a first love? This is going in my project!”")),
    ],
  },
  "cn-singles-day-parcels": {
    beats: [
      t("爸爸把快递一个个摆开，拿出账本：「今天必须说清楚。」", "Dad lines up the parcels and opens his notebook: “Nobody leaves until this is sorted.”"),
      t("每个人拆一个快递，解释里面的东西为什么「不是我的」。", "Each person opens a parcel and explains why what's inside isn't theirs."),
      t("反转以后，商量谁来付这个货到付款的箱子。", "After the twist, argue about who pays for the cash-on-delivery box."),
      t("最后每人保证一句「明年再也不买了」，说得越真诚越好。", "To finish, each promises “I'll never buy anything again next year,” as sincerely as possible."),
    ],
    roles: [
      r(t("戴着老花镜，一边念快递单一边记账，越念越生气。", "Glasses on the end of your nose, read each label aloud and write it down, getting crosser with every one."), t("「第一个：电动牙刷。谁的牙要用电刷？」", "“Item one: an electric toothbrush. Whose teeth need electricity?”")),
      r(t("一直低头看手机，被点名就说「这个是同学送的」。", "Eyes on your phone; whenever you're asked, say a friend sent it."), t("「这个不是我买的，是……同学送的生日礼物。」", "“That's not mine, it's... a birthday present from a friend.”")),
      r(t("很委屈，每拆一个就叹一口气，一直强调「我一个都没买」。", "Wounded innocence: sigh at every parcel and keep repeating that you bought nothing."), t("「我对天发誓，我连那个软件都不会用！」", "“I swear I don't even know how to use that app!”")),
      r(t("对每个快递都很好奇，想拆又不敢拆，眼神躲来躲去。", "Curious about every box, itching to open them, avoiding everyone's eyes."), t("「哎呀，这么多箱子……那个亮晶晶的盒子是谁的呀？」", "“My, so many boxes... whose is that shiny one?”")),
    ],
  },
  "cn-square-dance-speaker": {
    beats: [
      t("张阿姨把大家叫到音箱前，把那首儿歌放给大家听。", "Auntie Zhang gathers everyone at the speaker and plays them the nursery rhyme."),
      t("每个人说刚才十分钟自己在哪，别人追问一个细节。", "Each says where they were the last ten minutes; someone presses for a detail."),
      t("反转以后，大家一边跟着情歌跳，一边互相怀疑。", "After the twist, everyone dances along to the love song while accusing each other."),
      t("最后每人说一句，为什么自己最想赢这场比赛。", "To finish, each says why they want to win this contest more than anyone."),
    ],
    roles: [
      r(t("嗓门大，站得笔直，手一直在打拍子。", "Loud voice, perfect posture, always clapping out the beat."), t("「五、六、七、八！停！这是什么歌？」", "“Five, six, seven, eight! Stop! What is this song?”")),
      r(t("说话慢条斯理，什么都要算一算。", "Calm and precise; you calculate everything."), t("「从音箱到我站的位置一共十二步，我不可能碰到它。」", "“It's twelve steps from the speaker to my spot. I couldn't have touched it.”")),
      r(t("一直看表，满脸堆笑，说话像在念通知。", "Keep checking your watch, smile hard, talk like you're reading out a notice."), t("「各位业主，比赛马上开始，请大家保持和谐！」", "“Attention, residents: the contest is about to begin. Let's keep things harmonious!”")),
      r(t("很困，一直打哈欠，说话有点冲，其实心虚。", "Sleepy, yawning, a bit snappy, but guilty underneath."), t("「我就是下来扔个垃圾，你们看我干嘛？」", "“I just came down to take out the trash. Why's everyone looking at me?”")),
      r(t("一直看手机接单，脚却不自觉地跟着节奏动。", "Glued to your delivery app, but your feet keep moving to the beat."), t("「我在等单呢，我什么都不知道……这个动作是这样吗？」", "“I'm just waiting for an order, I don't know anything... is this the move?”")),
      r(t("坐着不动，表情严肃，写字很用力。", "Sit still, look stern, press hard on your clipboard."), t("「我只看动作，不看人。不过……张阿姨今天怎么了？」", "“I judge the dancing, not the dancers. Still... what's up with Auntie Zhang today?”")),
    ],
  },

  /* ---------------------------------------------------------------- 加拿大本地 Canadian */
  "ca-cottage-canoe": {
    beats: [
      t("爸爸站在码头上，举着那半截绳子：「谁最后一个碰过独木舟？」", "Dad stands on the dock holding the end of the rope: “Who touched the canoe last?”"),
      t("每个人说早上六点自己在干什么，别人追问一句。", "Everyone says what they were doing at six this morning; someone asks a follow-up."),
      t("反转以后，商量谁游过去把独木舟拖回来，谁都不想去。", "After the twist, decide who's swimming out to bring it back. Nobody wants to."),
      t("最后每人说一句，为什么下个长周末自己还应该被邀请。", "To finish, each says why they should still be invited next long weekend."),
    ],
    roles: [
      r(t("说话慢，很伤感，每句话都要提一下「我爷爷」。", "Slow and sentimental; mention your grandfather in every sentence."), t("「这条独木舟，我爷爷划了五十年……」", "“My grandfather paddled that canoe for fifty years...”")),
      r(t("很想表现，什么都说「我来」，可一靠近水就往后退。", "Desperate to impress, volunteering for everything, but stepping back whenever you get near the water."), t("「要不要我游过去找找？我游泳……挺好的。」", "“Want me to swim out and look? I'm a... pretty good swimmer.”")),
      r(t("翻白眼，把手机举得高高的找信号，被问就说「我在睡觉」。", "Roll your eyes, hold your phone up for signal, and say you were asleep."), t("「我在睡觉好吗，这里连信号都没有，我能去哪？」", "“I was asleep, okay? There's no signal here. Where would I even go?”")),
      r(t("很热情，一直在笑，可眼睛老往湖面上瞟。", "Friendly and smiley, but your eyes keep drifting to the lake."), t("「哎呀，真可惜。要是找不回来……我还是愿意出个价的。」", "“Oh, what a shame. If it doesn't turn up... my offer still stands.”")),
    ],
  },
  "ca-hockey-pool": {
    beats: [
      t("经理把竞猜表投到大屏幕上：「有人的预测全中了，我们来聊聊。」", "The manager puts the pool sheet up on the big screen: “Somebody went perfect. Let's talk.”"),
      t("每个人解释自己是怎么选的，别人追问一个球员的名字。", "Each person explains their picks; someone quizzes them on a player's name."),
      t("反转以后，大家开始追问：钱去哪了？", "After the twist, the question becomes: where did the money go?"),
      t("最后每人说一句，下次的竞猜应该谁来管钱。", "To finish, each says who should hold the money next time."),
    ],
    roles: [
      r(t("满脸笑容但很紧张，一直拍桌子说「我们是一个团队」。", "All smiles but rattled; keep patting the table and saying “we're a team here.”"), t("「各位，这只是一个友好的竞猜……谁改了表？」", "“Folks, this is just a friendly pool... so who changed the sheet?”")),
      r(t("什么都不懂，一直问很基本的问题，回答得却特别自信。", "Clueless, asking basic questions, but answering with total confidence."), t("「冰球是那个……有球门的吧？我选的是蓝色那队。」", "“Hockey's the one with the... nets, right? I picked the blue team.”")),
      r(t("说话很快，满嘴术语，一被问就推眼镜。", "Talk fast in jargon, and push up your glasses whenever you're questioned."), t("「从技术上讲，表格的修改记录我能查……但我不想查。」", "“Technically, I could pull the edit history... but I'd rather not.”")),
    ],
  },
  "ca-snow-day-driveway": {
    beats: [
      t("大家站在被埋的车道前，有人先开口：「这肯定是铲雪机喷的。」", "Everyone stands in front of the buried driveway; someone starts: “That's snowblower work, for sure.”"),
      t("每个人说早上七点自己在干什么，别人追问一句。", "Each says what they were doing at seven this morning; someone asks a follow-up."),
      t("反转以后，大家一边抢着铲雪，一边继续互相怀疑。", "After the twist, everyone scrambles to shovel while still accusing each other."),
      t("最后每人对老太太说一句话，证明自己是好邻居。", "To finish, each says one line to the old lady proving they're a good neighbour."),
    ],
    roles: [
      r(t("很得意自己的铲雪机，可一提到昨晚就支支吾吾。", "Proud of your snowblower, but vague the moment anyone mentions last night."), t("「我的机器？它昨晚……一直在车库里。应该吧。」", "“My machine? It was in the garage all night. I think.”")),
      r(t("穿得特别厚，说话很客气，一直问加拿大冬天的规矩。", "Bundled up to the eyeballs, very polite, asking about every winter rule."), t("「请问，在加拿大，人行道上的雪也要我来铲吗？」", "“Excuse me, in Canada, do I shovel the sidewalk too?”")),
      r(t("很赶时间，一直看手表，眼睛在雪堆里找东西。", "In a rush, checking your watch, eyes scanning the snowbanks."), t("「我七点就到了，那时候雪已经堆成这样了，我真的赶时间。」", "“I got here at seven and it was already like this. I'm really in a hurry.”")),
      r(t("拿着手机拍照取证，说话像在开会，什么都要「按规定」。", "Taking photos for evidence, talking like it's a meeting, everything “by the rules.”"), t("「按照我们街的规定，铲雪不能影响邻居。我已经拍照了。」", "“Under our street's guidelines, snow removal must not affect neighbours. I've taken photos.”")),
      r(t("很兴奋，一直想拉大家去看你的雪人。", "Bouncing with excitement, trying to show everyone your snowmen."), t("「你们看到我的雪人了吗？最大的那个叫铲雪侠！」", "“Did you see my snowmen? The big one's called Captain Shovel!”")),
      r(t("很困，打哈欠，说话像在推卸责任。", "Sleepy, yawning, sounding like you're dodging blame."), t("「市里的铲雪车只管马路，车道不归我管，谢谢。」", "“The city plows the road. Driveways aren't my department, thanks.”")),
    ],
  },

  /* ---------------------------------------------------------------- 南亚 South Asian */
  "sa-diwali-sweets-box": {
    beats: [
      t("站在门口，有人举着卡片小声说：「这盒……是他们家送我们的？」", "On the doorstep, someone holds up the card and whispers: “Isn't this... the box they gave us?”"),
      t("门开之前，每个人小声解释这盒甜点是怎么到自己手上的。", "Before the door opens, each person whispers how this box ended up in their hands."),
      t("反转以后，两家人假装什么都没发现，互相收下对方的甜点。", "After the twist, both families pretend nothing's wrong and accept each other's box."),
      t("最后每人说一句排灯节的祝福，说得越热情越好。", "To finish, each gives a Happy Diwali wish, as warmly as possible."),
    ],
    roles: [
      r(t("笑容不能停，嘴上很客气，压低声音数落家里人。", "Never stop smiling; be gracious out loud and hiss at the family under your breath."), t("「笑！都给我笑！门马上就开了……这盒是谁拿的？」", "“Smile! Everyone smile! The door's about to open... who brought this box?”")),
      r(t("一直看手机，说话很快，一直想岔开话题。", "Keep checking your phone, talk fast, and keep changing the subject."), t("「这有什么，甜点就是甜点，谁会看卡片啊？」", "“Who cares? Sweets are sweets. Who even reads the cards?”")),
      r(t("慢慢地，眯着眼看卡片，什么都记得，可只说一半。", "Slow, squinting at the card; you remember everything but only say half."), t("「这盒啊……我记得。上上个月，它是从古普塔家来的。」", "“Ah, this box... I remember. Two months ago it came from the Guptas.”")),
    ],
  },
  "sa-sangeet-song": {
    beats: [
      t("新郎的姐姐冲到 DJ 台前：「停！这不是我们的歌！」", "The groom's sister storms the DJ booth: “Stop! That's not our song!”"),
      t("每个人说音乐响之前自己在干什么，别人追问一句。", "Each says what they were doing right before the music started; someone asks a follow-up."),
      t("反转以后，大家安静下来，然后决定：两家一起跳这首歌。", "After the twist, everyone goes quiet, then decides both families will dance to this song together."),
      t("最后每人跳两个动作，说一句给新人的祝福。", "To finish, each does two dance moves and gives the couple a blessing."),
    ],
    roles: [
      r(t("很急，拍手数拍子，一直说「我们练了一个月」。", "Frantic, clapping the count, repeating “we practised for a month.”"), t("「五、六、七、八……停！谁把歌换了？」", "“Five, six, seven, eight... stop! Who switched the song?”")),
      r(t("拿着话筒，什么都像在主持，一紧张就讲笑话。", "Mic in hand, you narrate everything like an MC, and crack jokes when nervous."), t("「女士们先生们，欢迎来到……意外环节！」", "“Ladies and gentlemen, welcome to... the surprise segment!”")),
      r(t("戴着耳机，很酷，一直在电脑上点来点去，说话很短。", "Headphones on, playing it cool, clicking at the laptop, short answers."), t("「我的歌单没问题。肯定有人碰过电脑。」", "“My playlist's fine. Somebody touched the laptop.”")),
      r(t("一直在跳，停不下来，说话带着喘。", "Dancing nonstop, can't stop, talking between breaths."), t("「什么歌都行！跳起来！……不过我们家的歌呢？」", "“Any song's fine! Dance! ...but where's our song?”")),
      r(t("很优雅，端着奶茶微笑，说话很慢，眼神躲闪。", "Elegant, smiling over a cup of chai, speaking slowly, eyes darting away."), t("「哎呀，换了就换了嘛，这首歌也很好听呀。」", "“Oh, so it changed. This song's lovely too, isn't it?”")),
      r(t("一直举着相机对着别人，不让任何人看屏幕。", "Keep the camera pointed at others, never letting anyone see the screen."), t("「别担心，我全都拍下来了。全都。……大概吧。」", "“Don't worry, I got everything. Everything. ...Probably.”")),
    ],
  },
  "sa-cricket-final-password": {
    beats: [
      t("爸爸拿着遥控器站起来：「谁改了密码？比赛只剩三个球了！」", "Dad stands up with the remote: “Who changed the password? Three balls left!”"),
      t("每个人说刚才十分钟自己的手机在干什么，别人追问一句。", "Each says what their phone was doing in the last ten minutes; someone asks a follow-up."),
      t("反转以后，大家一边猜谁赢了，一边继续找密码。", "After the twist, everyone guesses who won while still hunting for the password."),
      t("最后每人猜一个新密码，猜得越离谱越好。", "To finish, each guesses the new password, the wilder the better."),
    ],
    roles: [
      r(t("很激动，一直挥遥控器，说话像在解说比赛。", "Worked up, waving the remote, talking like a match commentator."), t("「这是决赛！决赛！谁会在这个时候改密码？」", "“It's the final! THE FINAL! Who changes a password now?”")),
      r(t("抱着零食，很淡定，一被问就把手机藏到身后。", "Hugging the snacks, totally calm, hiding your phone behind your back when asked."), t("「别看我，我连板球怎么算分都不知道。」", "“Don't look at me. I don't even know how cricket scoring works.”")),
      r(t("紧张得一直摸头发，说话声音很大。", "So tense you keep touching your hair; loud voice."), t("「快点快点！我跟人打了赌的，输了我就……算了，快点！」", "“Hurry, hurry! I made a bet, and if we lose... never mind, hurry!”")),
      r(t("很乖，坐得笔直，可一提到「买东西」就脸红。", "Very well-behaved, sitting up straight, but blush whenever anyone mentions buying something."), t("「叔叔，我什么都没碰。我就是……来看看。」", "“Uncle, I didn't touch anything. I just... came to watch.”")),
    ],
  },

  /* ---------------------------------------------------------------- 菲律宾 Filipino */
  "ph-noche-buena-flan": {
    beats: [
      t("外婆端着空盘子从厨房出来：「我的布丁呢？还有十分钟就十二点了！」", "Lola comes out of the kitchen with the empty tray: “Where's my flan? It's ten minutes to midnight!”"),
      t("每个人说过去一个小时自己在哪，别人追问一句。", "Each says where they've been the past hour; someone asks a follow-up."),
      t("反转以后，大家互相盯着，看谁的嘴辣得冒汗。", "After the twist, everyone watches everyone else for who's sweating from the chili."),
      t("最后倒数到十二点，每人说一句圣诞祝福。", "To finish, count down to midnight, and each says a Christmas wish."),
    ],
    roles: [
      r(t("又生气又心疼，说话一顿一顿，一直摸那个空盘子。", "Cross and heartbroken, speaking in bursts, stroking the empty tray."), t("「四十年了，我的布丁从来没在十二点前消失过！」", "“Forty years, and my flan has never vanished before midnight!”")),
      r(t("说话很大声，在屋里也戴着墨镜，三句话不离马尼拉。", "Loud, sunglasses on indoors, always bringing up Manila."), t("「在马尼拉，我们家的布丁都锁在柜子里的！」", "“In Manila, we lock the flan in the cupboard!”")),
      r(t("一直在嚼东西，手藏在背后，说话含含糊糊。", "Always chewing something, hands behind your back, mumbling."), t("「我？我一直在帮忙……切火腿。只是切。」", "“Me? I've been helping... slice the ham. Just slicing.”")),
      r(t("撑得坐不直，一直摸肚子，每样都说「尝一点就好」。", "Too stuffed to sit up straight, patting your belly, saying “just a taste” to everything."), t("「我就是路过，来说声圣诞快乐……不用给我盛饭，真的。」", "“I'm just stopping by to say Merry Christmas... no plate for me, really.”")),
    ],
  },
  "ph-balikbayan-box": {
    beats: [
      t("快递员指着秤：「超重十公斤。」全家盯着那个箱子。", "The courier points at the scale: “Ten kilos over.” The whole family stares at the box."),
      t("每个人说自己往箱子里放了什么，越说越少。", "Each lists what they put in, making it sound smaller and smaller."),
      t("反转以后，大家商量是出钱，还是拿出点什么。", "After the twist, decide who pays, or what comes out."),
      t("最后每人说一句话，说给老家收箱子的家人听。", "To finish, each says a line to the family who'll open the box back home."),
    ],
    roles: [
      r(t("拿着清单一项一项念，越念越心虚，偷看箱底。", "Read the list item by item, getting shiftier, sneaking looks at the bottom of the box."), t("「我列了清单的，每样都很轻……怎么会超重？」", "“I made a list, and everything on it is light... how is it overweight?”")),
      r(t("很无辜，说话像在讲道理，一直说「衣服又不重」。", "All innocence and logic, insisting clothes don't weigh anything."), t("「我就放了几件衣服，衣服能有多重？」", "“I put in a few shirts. How heavy can shirts be?”")),
      r(t("拿着胶带，一直想赶快把箱子封上。", "Tape in hand, desperate to seal the box before anyone looks inside."), t("「别打开了，都封好了，我付钱，我付钱。」", "“Don't open it, it's all taped up. I'll pay, I'll pay.”")),
    ],
  },
  "ph-debut-eighteen-roses": {
    beats: [
      t("主持人念出第十八个名字，全场安静。过生日的女孩问：「这是谁？」", "The emcee reads the eighteenth name and the room goes quiet. The debutante asks: “Who is that?”"),
      t("每个人说自己有没有碰过名单，别人追问一句。", "Each says whether they touched the list; someone asks a follow-up."),
      t("反转以后，大家让这位先生跳最后一支舞，一边跳一边问他是谁。", "After the twist, everyone lets the stranger have the last dance, and quizzes him while he dances."),
      t("最后每人对过生日的女孩说一句祝福。", "To finish, each gives the debutante a birthday wish."),
    ],
    roles: [
      r(t("穿着礼服，很想保持优雅，可越来越慌。", "In your gown, trying hard to stay graceful, increasingly flustered."), t("「今天是我十八岁生日，谁能告诉我第十八朵玫瑰是谁？」", "“It's my eighteenth birthday. Can someone tell me who the eighteenth rose is?”")),
      r(t("一直在指挥，拿着对讲机，什么事都说「我来处理」。", "Running the show with a walkie-talkie, “I'll handle it” for everything."), t("「没事没事，这是流程的一部分！……谁动了我的流程？」", "“It's fine, it's all part of the programme! ...Who touched my programme?”")),
      r(t("拿着话筒，念错名字就笑着混过去。", "Mic in hand; when you mispronounce something, laugh it off."), t("「下一位……呃，我念对了吗？请这位先生上台！」", "“Next up... uh, am I saying that right? Please welcome this gentleman!”")),
      r(t("很骄傲又很紧张，一直整理领带，脚下偷偷练舞步。", "Proud and nervous, fixing your tie, secretly rehearsing steps with your feet."), t("「我女儿的玫瑰，每一朵我都要知道是谁送的。」", "“Every rose my daughter gets, I want to know who gave it.”")),
      r(t("一直帮女孩整理裙子，眼神老往她哥哥那边飘。", "Keep fussing with the debutante's dress, eyes drifting toward her brother."), t("「别慌，你今晚最美！……他是谁我真的不知道。」", "“Don't panic, you look amazing! ...I honestly don't know who he is.”")),
      r(t("坐着，拄着拐杖，说话慢，总想开始致辞。", "Seated with your cane, speaking slowly, always about to launch into your speech."), t("「我年轻的时候啊，成人礼上……先让我说两句。」", "“When I was young, at a debut... let me just say a few words.”")),
    ],
  },

  /* ---------------------------------------------------------------- 韩国 Korean */
  "kr-chuseok-jeon": {
    beats: [
      t("奶奶数了数盘子里的煎饼：「怎么又少了？」", "Grandma counts the platter: “Why is it smaller again?”"),
      t("每个人说刚才半小时自己在厨房干什么，别人追问一句。", "Each says what they were doing in the kitchen the last half hour; someone asks a follow-up."),
      t("反转以后，大家一边数煎饼，一边互相闻手上的油味。", "After the twist, everyone counts the jeon and sniffs each other's hands for grease."),
      t("最后每人对着供桌说一句祝福，保证明年不偷吃。", "To finish, each says a blessing at the ancestral table and promises not to sneak food next year."),
    ],
    roles: [
      r(t("一边数一边念念有词，说话很慢，很有威严。", "Count under your breath; slow, commanding voice."), t("「我煎了五十个，现在只有三十八个。谁来跟我解释一下？」", "“I fried fifty. There are thirty-eight. Who'd like to explain?”")),
      r(t("很累，手里一直拿着锅铲，说话有点委屈。", "Exhausted, spatula always in hand, a bit put-upon."), t("「我从五点煎到现在，一个都没尝过！」", "“I've been frying since five and I haven't tasted a single one!”")),
      r(t("站得笔直，说话像在部队里报告，嘴里还在嚼。", "Standing at attention, reporting like it's the army, still chewing."), t("「报告奶奶！我一直在门口站岗，什么都没看见！」", "“Reporting, Grandma! I was on guard at the door. Saw nothing!”")),
      r(t("一直看手机上的棒球比分，被叫到才慢慢回头。", "Glued to the baseball score on your phone; turn around slowly when called."), t("「煎饼？什么煎饼？……哦，那个啊，挺好吃的。」", "“Jeon? What jeon? ...Oh, those. They were good.”")),
    ],
  },
  "kr-hoesik-card": {
    beats: [
      t("组长翻遍了钱包和外套：「公司卡呢？刚才还在桌上！」", "The team leader searches his wallet and jacket: “Where's the card? It was right here!”"),
      t("每个人说结完第一轮账以后自己在干什么，别人追问一句。", "Each says what they did after the first round was paid; someone asks a follow-up."),
      t("反转以后，大家赶紧找卡，还要假装一切正常。", "After the twist, everyone hunts for the card while pretending everything's normal."),
      t("最后每人举杯，说一句给部门的祝酒词。", "To finish, each raises a glass with a toast to the team."),
    ],
    roles: [
      r(t("很紧张，一直鞠躬赔笑，说话越来越快。", "Anxious, bowing and smiling, talking faster and faster."), t("「大家别动，我们先找一下……谁看到我的卡了？」", "“Nobody move, let's just look... has anyone seen my card?”")),
      r(t("很拘谨，一直给大家倒水，被问话就站起来。", "Stiff and polite, refilling glasses, standing up when spoken to."), t("「组长，我、我一直在倒水，什么都没碰！」", "“Sir, I-I've been pouring water the whole time, I didn't touch anything!”")),
      r(t("很淡定，慢慢烤肉，说话像在讲人生道理。", "Totally calm, grilling slowly, talking like you're handing out life lessons."), t("「年轻人，卡丢了不要慌。先把这块肉吃了。」", "“Young man, don't panic over a card. Eat this piece of meat first.”")),
      r(t("一直在打听消息，什么都想问，笑得很假。", "Fishing for gossip, asking about everything, fake smile."), t("「哎呀，卡丢了？那你们组长今年还升不升职啊？」", "“Oh no, a lost card? So is your boss still getting promoted this year?”")),
      r(t("很热情，一直上菜，一被问到账单就转移话题。", "Warm and busy, bringing more dishes; change the subject whenever the bill comes up."), t("「来来来，这盘是送的！账单的事等会儿再说！」", "“Here, here, this one's on the house! We'll talk about the bill later!”")),
    ],
  },
  "kr-drama-finale-spoiler": {
    beats: [
      t("团长举着手机：「这条消息是谁发的？『我就知道是他』是什么意思？」", "The organizer holds up her phone: “Who sent this? ‘I knew it was him’? What does that mean?”"),
      t("每个人说昨晚自己在干什么，别人追问一句。", "Each says what they did last night; someone asks a follow-up."),
      t("反转以后，大家开始争论该投哪个结局。", "After the twist, everyone argues over which ending to vote for."),
      t("最后每人猜一句大结局会怎么样。", "To finish, each predicts one thing about the finale."),
    ],
    roles: [
      r(t("很严肃，像在审案子，一直敲桌子。", "Dead serious, like a judge, tapping the table."), t("「我们说好的，谁都不许提前看。现在，谁先坦白？」", "“We had a deal: no peeking. Now, who's confessing first?”")),
      r(t("话特别多，什么都想说，又一直捂住自己的嘴。", "Can't stop talking, and keep clapping a hand over your own mouth."), t("「我什么都不知道！可是……他最后是不是……不说了不说了！」", "“I don't know anything! But... does he end up... no, no, I'm not saying!”")),
      r(t("很冷淡，抱着手臂，可一提到男主角就忍不住激动。", "Arms crossed, aloof, but you light up whenever the lead actor comes up."), t("「韩剧？我不看的。……你说的是哪个男主角？」", "“K-dramas? Not my thing. ...Which lead actor did you mean?”")),
    ],
  },

  /* ---------------------------------------------------------------- 日本 Japanese */
  "jp-hanami-bento": {
    beats: [
      t("课长拿起空便当盒，看到上面的名字，脸都白了：「这是部长的……」", "The section manager picks up the empty box, reads the name, and goes pale: “This is the department head's...”"),
      t("每个人说上午自己在哪，别人追问一句。", "Each says where they were this morning; someone asks a follow-up."),
      t("反转以后，大家拼命想办法：那封信去哪了？", "After the twist, everyone scrambles: where's the letter?"),
      t("最后每人对着樱花说一句，部长来了以后自己打算怎么解释。", "To finish, each tells the cherry blossoms how they'll explain this to the boss."),
    ],
    roles: [
      r(t("很累，一直鞠躬道歉，说话小声。", "Exhausted, bowing and apologizing, speaking softly."), t("「对不起！我一直守着位置……中间只是闭了一下眼睛。」", "“I'm so sorry! I held the spot the whole time... I only closed my eyes for a second.”")),
      r(t("很慌，一直看手表，说话像在汇报工作。", "Flustered, checking your watch, talking like a status report."), t("「各位，部长三十分钟后到。我们必须在那之前解决这个问题。」", "“Everyone, the department head arrives in thirty minutes. We must resolve this before then.”")),
      r(t("很淡定，吃着饭团，说话慢悠悠，好像什么都懂。", "Unbothered, eating a rice ball, slow and knowing."), t("「这种事啊，我见多了。先说清楚，饭团是我自己带的。」", "“I've seen this before. To be clear, these rice balls are mine.”")),
      r(t("一直在给别人递名片，很客气，眼神躲闪。", "Handing out business cards, very polite, avoiding eye contact."), t("「您好，这是我的名片……便当？什么便当？」", "“Hello, here's my card... bento? What bento?”")),
      r(t("一直在悄悄挪垫子，嘴上很客气。", "Keep nudging your tarp over, very politely."), t("「不好意思，你们的垫子好像……多占了一点？」", "“Excuse me, your tarp seems to be... a little over the line?”")),
      r(t("很热情，一直推销团子，被问就转移话题。", "Enthusiastic, pushing your dango, changing the subject when asked."), t("「来串团子吗？今天的特别甜！便当的事我不知道哦。」", "“Dango? Extra sweet today! I don't know anything about a bento.”")),
    ],
  },
  "jp-omiyage-box": {
    beats: [
      t("最后一个人举着空盒子：「我的呢？」全办公室安静了。", "The last person holds up the empty box: “Where's mine?” The office goes quiet."),
      t("每个人说自己几点拿的、拿的是什么味道，别人追问一句。", "Each says when they took theirs and what flavour it was; someone asks a follow-up."),
      t("反转以后，大家盯着那第二个被打开过的盒子。", "After the twist, everyone stares at the second, already-opened box."),
      t("最后每人说一句，下次出差回来伴手礼该怎么分。", "To finish, each says how omiyage should be shared next time."),
    ],
    roles: [
      r(t("很客气，一直解释点心的来历，说多了就露馅。", "Very polite, over-explaining where the sweets came from, slipping up as you go."), t("「这是当地最有名的点心……是在车站买的，但也是当地的！」", "“These are the region's most famous sweets... bought at the station, but still local!”")),
      r(t("一直强调自己戒糖了，可眼睛离不开那个盒子。", "Keep insisting you've quit sugar, eyes glued to the box."), t("「我早就不吃甜的了，你们知道的。……那是什么味道的？」", "“I don't eat sugar anymore, you know that. ...What flavour were they?”")),
      r(t("很无辜，说话很快，一直道歉。", "Wide-eyed, talking fast, apologizing constantly."), t("「对不起！我不知道是一人一个！……我只拿了一个，应该吧。」", "“Sorry! I didn't know it was one each! ...I only took one, I think.”")),
      r(t("拿着扫把，很亲切，说话慢，口袋鼓鼓的。", "Holding a broom, warm and slow-spoken, pockets bulging."), t("「我三点才来打扫，那个盒子……我没注意。」", "“I came to clean at three. The box... I didn't notice.”")),
    ],
  },
  "jp-otoshidama-envelopes": {
    beats: [
      t("拿到空信封的孩子举起来晃了晃：「这个……是空的。」", "The kid with the empty envelope holds it up and shakes it: “This one's... empty.”"),
      t("每个大人说装信封的时候自己在干什么，别人追问一句。", "Each grown-up says what they were doing while the envelopes were stuffed; someone asks a follow-up."),
      t("反转以后，大家赶紧想办法让孩子把照片删掉。", "After the twist, everyone scrambles to get the kid to delete the photo."),
      t("最后每人对孩子说一句新年祝福，顺便补一点压岁钱。", "To finish, each gives the kid a New Year wish, and a little extra money."),
    ],
    roles: [
      r(t("很心疼钱，一直拍口袋，说话有点小气。", "Pained about money, patting your pockets, a bit stingy."), t("「我那份肯定装了，我装的时候还数了三遍呢！」", "“Mine was definitely in there. I counted it three times!”")),
      r(t("很能干，说话很快，总是替自己的孩子说话。", "Capable and fast-talking, always taking your own kid's side."), t("「我装得最仔细了，我们家孩子那个信封……我就多看了一眼。」", "“I was the most careful of all. My kid's envelope... I just double-checked it.”")),
      r(t("很慈祥，笑眯眯的，一提到钱就装没听见。", "Sweet and smiling; pretend not to hear whenever money comes up."), t("「哎呀，新年快乐！钱的事……你说什么？我耳朵不好。」", "“Oh, happy New Year! The money? What's that? My hearing's not great.”")),
    ],
  },

  /* ---------------------------------------------------------------- 伊朗 Iranian */
  "ir-nowruz-haft-sin": {
    beats: [
      t("妈妈站在桌前数了一遍：「一、二、三……六。麦苗呢？」", "Mom stands at the table and counts: “One, two, three... six. Where's the sabzeh?”"),
      t("每个人说昨晚睡觉前最后在干什么，别人追问一句。", "Each says the last thing they did before bed last night; someone asks a follow-up."),
      t("反转以后，大家赶紧想办法，在舅舅一家进门前把桌子摆好。", "After the twist, everyone rushes to fix the table before the uncle's family comes in."),
      t("最后每人说一句新年祝福，祝福里要提到桌上的一样东西。", "To finish, each gives a New Year wish that mentions something on the table."),
    ],
    roles: [
      r(t("很着急，一直摆弄桌上的东西，越摆越乱。", "Frantic, fussing with the table, making it messier."), t("「我种了两个星期的麦苗！两个星期！」", "“I grew that sabzeh for two weeks! Two weeks!”")),
      r(t("很想帮忙，一直说「我再去买一盘」，又一直不出门。", "Eager to help, offering to buy another, never quite leaving."), t("「别急，我现在就去买一盘新的……这个点花店开门吗？」", "“Don't worry, I'll go buy another right now... is the florist even open?”")),
      r(t("一直替男朋友「翻译」，越翻越离谱。", "Keep “translating” for your boyfriend, more and more wildly."), t("「他说……他说新年快乐，而且他什么都没碰。」", "“He says... he says happy New Year, and he didn't touch anything.”")),
      r(t("很平静，一直讲小时候过年的故事，偷偷看金鱼缸。", "Calm, telling stories about New Year when you were a girl, sneaking looks at the goldfish bowl."), t("「我小时候啊，有一年麦苗也丢了。你们猜后来怎么样？」", "“When I was a girl, one year the sabzeh vanished too. Guess what happened?”")),
    ],
  },
  "ir-yalda-watermelon": {
    beats: [
      t("有人把西瓜翻过来，露出底下那个洞：「这是谁干的？」", "Someone turns the watermelon over to show the hole: “Who did this?”"),
      t("每个人说今晚八点以后自己在干什么，别人追问一句。", "Each says what they've done since eight tonight; someone asks a follow-up."),
      t("反转以后，每人念一段自己「翻到的诗」，诗里偷偷说出自己的心事。", "After the twist, each reads out their “poem,” secretly confessing something in it."),
      t("最后大家一起倒数到半夜，每人许一个愿。", "To finish, count down to midnight together, and each makes a wish."),
    ],
    roles: [
      r(t("很慈祥，但眯着眼什么都看不清，一直在找眼镜。", "Gentle, squinting, unable to see a thing, hunting for your glasses."), t("「这个瓜我挑了一个钟头……怎么看起来轻了？」", "“I spent an hour choosing this melon... why does it look lighter?”")),
      r(t("一直强调自己在减肥，身上却有一股石榴味。", "Keep insisting you're on a diet, while smelling of pomegranate."), t("「我在减肥，我连看都不看西瓜一眼！」", "“I'm on a diet. I won't even look at a watermelon!”")),
      r(t("一直扯自己黏黏的袖子，讲多伦多的事。", "Keep tugging at your sticky sleeves, telling stories about Toronto."), t("「在多伦多，我们半夜不吃西瓜的……不过这个洞挖得挺圆。」", "“In Toronto we don't eat watermelon at midnight... though that's a very neat hole.”")),
    ],
  },
  "ir-khastegari-tea": {
    beats: [
      t("男方的妈妈放下茶杯，脸色很难看。女方的爸爸问：「茶……有什么问题吗？」", "His mother sets down her cup, looking ill. Her father asks: “Is the tea... all right?”"),
      t("每个人说今天进没进过厨房，别人追问一句。", "Each says whether they went into the kitchen today; someone asks a follow-up."),
      t("反转以后，大家都盯着男方，看他敢不敢喝那杯咸茶。", "After the twist, all eyes are on the groom: will he drink the salty tea?"),
      t("最后每人说一句话，表明自己支持还是反对这门亲事。", "To finish, each says whether they're for or against the match."),
    ],
    roles: [
      r(t("端着茶盘，笑得很得体，眼睛在观察每一个人。", "Holding the tea tray, smiling gracefully, watching everyone closely."), t("「阿姨，茶不好喝吗？我……我再去泡一壶。」", "“Is the tea not nice? I'll... I'll make a fresh pot.”")),
      r(t("一直擦汗，坐得笔直，什么问题都回答「是的」。", "Mopping your brow, sitting bolt upright, answering “yes” to everything."), t("「是的，叔叔。我的工作很好，非常好，特别好。」", "“Yes, sir. My job is great, very great, extremely great.”")),
      r(t("坐在主位，说话慢，一直问很难回答的问题。", "In the head chair, speaking slowly, asking hard questions."), t("「年轻人，你说说，你一个月……喝几杯茶？」", "“Young man, tell me: how many cups of tea do you drink a month?”")),
      r(t("很有礼貌，一直微笑，眼睛把整个屋子看了个遍。", "Impeccably polite, smiling, eyes inspecting every corner of the room."), t("「这茶……很特别。你们家的糖，是在哪儿买的？」", "“This tea is... unique. Where do you buy your sugar?”")),
      r(t("坐不住，一直插嘴，老想把口袋里的钱拿出来数。", "Can't sit still, keep butting in, itching to count the money in your pocket."), t("「我姐姐人很好！真的！……哥哥你还记得我们说好的吧？」", "“My sister's really nice! Really! ...You remember our deal, right?”")),
      r(t("一直眯着眼看人，像在算命，说话神神秘秘。", "Squint at everyone like a fortune-teller, speaking mysteriously."), t("「我一进门就知道，今天要出事。」", "“I knew the moment I walked in: something was going to happen today.”")),
    ],
  },

  /* ---------------------------------------------------------------- 欧洲 European */
  "eu-christmas-market-cashbox": {
    beats: [
      t("摊主数完钱，「啪」地合上钱箱：「少了一百欧。」", "The stall owner finishes counting and snaps the cash box shut: “We're a hundred euros short.”"),
      t("每个人说今晚自己碰过几次钱箱，别人追问一句。", "Each says how many times they touched the cash box tonight; someone asks a follow-up."),
      t("反转以后，大家冲到雪地里捡硬币，一边捡一边吵。", "After the twist, everyone rushes into the snow to pick up coins, bickering as they go."),
      t("最后每人说一句圣诞祝福，顺便说明年谁来管钱箱。", "To finish, each gives a Christmas wish, and says who should mind the cash box next year."),
    ],
    roles: [
      r(t("很疲惫，说话慢，一直搓手取暖，眼睛盯着钱箱。", "Weary and slow-talking, rubbing your hands for warmth, eyes on the cash box."), t("「三十年了，我的钱箱从来没少过一分钱。」", "“Thirty years, and this box has never been a cent short.”")),
      r(t("很活泼，一直跟路过的朋友挥手打招呼。", "Bubbly, waving at friends walking by."), t("「我一直在倒热巧克力啊，倒了……好多好多杯。」", "“I've just been pouring hot chocolate. So, so many cups.”")),
      r(t("很热情，嗓门大，一提到零钱就转移话题。", "Big and hearty, loud, changing the subject whenever change comes up."), t("「零钱？哈哈，我们邻居之间，谁还算这个！」", "“Change? Ha! Between neighbours, who's counting?”")),
      r(t("一直「呵呵呵」地笑，可时不时偷看手表。", "Ho-ho-hoing constantly, but sneaking looks at your watch."), t("「呵呵呵！圣诞老人什么都没看见……圣诞老人现在得走了。」", "“Ho ho ho! Santa saw nothing... and Santa has to go now.”")),
    ],
  },
  "eu-eurovision-scores": {
    beats: [
      t("算分的朋友举起那张表：「这首歌满分？谁打的？」", "The scorekeeper holds up the sheet: “Full marks for this song? Who did this?”"),
      t("每个人说自己给那首歌打了几分、为什么，别人追问一句。", "Each says what they gave that song and why; someone asks a follow-up."),
      t("反转以后，大家重新评价这首歌，说得越夸张越好。", "After the twist, everyone re-reviews the song, the more over-the-top the better."),
      t("最后每人用唱的方式说一句话，宣布自己心里的冠军。", "To finish, each sings one line announcing their personal champion."),
    ],
    roles: [
      r(t("很兴奋，一直挥着小旗子，说话像电视主持人。", "Thrilled, waving a little flag, talking like a TV host."), t("「欢迎来到一年一度的客厅大赛！……先解释一下这张表。」", "“Welcome to the annual living-room final! ...First, someone explain this scoresheet.”")),
      r(t("拿着计算器一直按，说话很认真，可数字老是对不上。", "Punching the calculator, very serious, but the numbers never add up."), t("「根据我的计算……等一下，我再算一遍。」", "“According to my calculations... hold on, let me redo that.”")),
      r(t("很热情，什么都要跟「在我们国家」比一比。", "Passionate, comparing everything to “back home.”"), t("「在我们国家，这种歌进不了决赛。……不过满分不是我打的。」", "“Back home, a song like this would never reach the final. ...But I didn't give it full marks.”")),
      r(t("一直端着蛋糕给人分，不想让人仔细看蛋糕。", "Carrying the cake around offering slices, not letting anyone look too closely."), t("「我一直在厨房切蛋糕，我自己做的……谁要一块？」", "“I've been in the kitchen cutting my homemade cake... who wants a slice?”")),
      r(t("穿着闪亮的衣服，一直跟着电视唱，激动得停不下来。", "In a sparkly costume, singing along with the TV, too excited to stop."), t("「你们根本不懂这首歌！它是艺术！」", "“You don't understand this song! It's art!”")),
      r(t("一直问「我错过了什么」，说起分数含含糊糊。", "Keep asking “what did I miss,” vague about your scores."), t("「我错过了什么？我的分数……跟大家差不多吧。」", "“What did I miss? My scores were... about the same as everyone's.”")),
    ],
  },
  "eu-nonna-sauce": {
    beats: [
      t("有人举着那个空瓶子走进来：「这是谁的？」全桌安静了。", "Someone walks in holding the empty jar: “Whose is this?” The table goes silent."),
      t("每个人说今天早上自己在厨房待了多久，别人追问一句。", "Each says how long they were in the kitchen this morning; someone asks a follow-up."),
      t("反转以后，大家开始追问：奶奶的妈妈，到底是怎么做酱汁的？", "After the twist, everyone wants to know: how did Nonna's mother really make her sauce?"),
      t("最后每人举杯，说一句给奶奶的话。", "To finish, each raises a glass with a line for Nonna."),
    ],
    roles: [
      r(t("很骄傲，一直搅着锅，说话手舞足蹈。", "Proud, stirring the pot, talking with your hands."), t("「这酱汁我熬了四个小时！四个小时！谁拿来的瓶子？」", "“I cooked this sauce for four hours! Four! Who brought that jar?”")),
      r(t("什么都不懂，一直夸，被问就摆盘子转移注意力。", "Clueless, complimenting everything, rearranging plates when questioned."), t("「我只负责摆桌子，你们看，这些盘子……摆得多整齐。」", "“I'm just on table duty. Look how neatly I set these plates.”")),
      r(t("坐着慢慢吃，笑而不语，一开口就是一句金句。", "Seated, eating slowly, smiling silently; every word you say lands."), t("「嗯……好吃。不过我做的时候，大蒜不放这么多。」", "“Mm... delicious. Though I never used this much garlic.”")),
    ],
  },
};
