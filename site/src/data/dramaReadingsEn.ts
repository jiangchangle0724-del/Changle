import type { T } from "../i18n";
import type { ReadKind, ReadPiece } from "./dramaReadings";

/**
 * 朗读 · English internet: pieces in the formats the English-speaking internet loves (acceptance
 * speeches, best-man toasts, LinkedIn posts, "am I wrong" posts, storytime, the HR breakup text, the
 * villain era, town criers, Shakespeare, movie-trailer and nature-documentary voices, crashouts,
 * reply-all storms, soap operas, infomercials, live shopping, Notes-app and YouTube apologies, slam
 * poetry, old-time radio, Gen Alpha slang), with a Chinese version for Chinese phones. All our own words.
 */

const t = (zh: string, en: string): T => ({ zh, en });
const p = (id: string, kind: ReadKind, title: T, how: T, lines: T[]): ReadPiece => ({ id, set: "en", kind, level: "all", title, how, lines });

export const READ_EN: ReadPiece[] = [
  /* ---------------------------------------------------------------- read it in tears */
  p("en-cry-employee-month", "cry", t("「本月最佳员工」获奖感言", "My acceptance speech for Employee of the Month"), t("双手捧着「奖杯」（手机或杯子都行），忍着眼泪，读到「我妈」那句彻底忍不住。", "Clutch your “trophy” (a phone or a cup), fight back the tears, and lose the fight at “my mum”."), [
    t("天哪。我什么都没准备。我准备了这个。", "Oh my god. I didn't prepare anything. I prepared this."),
    t("我要感谢学院。我是说，人事部的琳达。", "I want to thank the Academy. By which I mean Linda from HR."),
    t("三楼的自动售货机：你每天都吞我一块钱，我还是每天回来。这就是忠诚。", "To the vending machine on the third floor: you ate my dollar every single day, and I came back anyway. That's loyalty."),
    t("感谢我的经理，你终于相信了我，在很多很多封邮件以后。", "To my manager, who believed in me. Eventually. After a lot of emails."),
    t("感谢我妈，你到现在都不知道我是做什么的，但你跟所有人说我是「搞电脑的」。", "To my mum, who still doesn't know what I do, but tells everyone I'm “in computers”."),
    t("还有这个奖品，门口的专属停车位：它属于每一个在停车场转了二十分钟的人。", "And this prize, the parking spot by the door: it belongs to everyone who has ever circled the lot for twenty minutes."),
    t("我会永远珍惜它。或者珍惜到下个月。", "I'll treasure it forever. Or until next month."),
    t("谢谢，谢谢，我爱你们，晚安！", "Thank you. Thank you. I love you all. Goodnight!"),
  ]),
  p("en-cry-best-man", "cry", t("伴郎致辞", "The best man's toast"), t("举着杯子，开头很自信，读到第三句就崩了，然后再也没缓过来。", "Glass raised. Start confident, break down by the third line, and never really recover."), [
    t("大家好。不认识我的朋友，我是戴夫最好的朋友，从幼儿园开始。", "Hi everyone. For those who don't know me, I'm Dave's best friend. Since kindergarten."),
    t("六岁那年，戴夫把他的三明治分了我一半。是火腿的。我讨厌火腿。我还是吃了。这就是友情。", "When we were six, Dave gave me half his sandwich. It was ham. I hate ham. I ate it anyway. That's friendship."),
    t("十六岁那年，戴夫把他妈妈的车撞了，跟他妈说是我开的。他妈到现在都不理我。", "When we were sixteen, Dave crashed his mum's car and told her it was me. She still doesn't talk to me."),
    t("二十六岁那年，戴夫遇见了艾玛，我就知道了：他终于找到了一个愿意吃火腿的人。", "When we were twenty-six, Dave met Emma, and I knew. He'd found someone who would eat the ham."),
    t("艾玛，你嫁的是我认识的最好的人。他善良，他忠诚，他还欠我四百块。", "Emma, you're marrying the best guy I know. He's kind. He's loyal. He owes me four hundred dollars."),
    t("对不起，对不起，我没事。只是……他是我最重要的人啊。", "Sorry. Sorry, I'm fine. It's just... he's my person."),
    t("请大家举杯。敬戴夫和艾玛。也敬我吧，从今以后一个人了。", "Please raise your glasses. To Dave and Emma. And to me, I guess. Alone now."),
  ]),
  p("en-cry-first-car", "cry", t("写给我的第一辆车的告别信", "A goodbye letter to my first car"), t("对着车读（一把椅子就行），最后一句轻轻摸一下它的「仪表盘」。", "Read it to the car (a chair will do), and gently stroke its “dashboard” on the last line."), [
    t("亲爱的贝西：", "Dear Betsy,"),
    t("你是一辆二〇〇六年的两厢车，跑了二十万公里，只有一个喇叭还响。", "You were a 2006 hatchback with two hundred thousand kilometres and one working speaker."),
    t("你只能收到一个电台，全是广告。可我还是爱你。", "You only picked up one radio station, and it was all ads. I loved you anyway."),
    t("你的发动机故障灯亮了四年，我们说好了都不提。", "Your check-engine light was on for four years. We agreed not to talk about it."),
    t("你陪我考过了驾照，陪我上了第一份班，陪我熬过了三次分手，从来没有嫌弃过我。", "You got me through my driving test, my first job and three breakups. You never once judged me."),
    t("除了你的车门掉下来的那一次。那一次我感觉到了嫌弃。", "Except the time your door fell off. That felt like judgement."),
    t("今天，报废厂的大叔说，你值九十块。", "Today, the man at the scrapyard said you're worth ninety dollars."),
    t("他错了。你是无价的。但我还是收了那九十块。", "He's wrong. You're priceless. But I took the ninety dollars."),
  ]),

  /* ---------------------------------------------------------------- straight face */
  p("en-deadpan-linkedin", "deadpan", t("领英帖：被甩了以后", "A LinkedIn post about getting dumped"), t("像台上的「思想领袖」：慢慢点头，意味深长地停顿，千万别笑。", "Read it like a thought leader on a stage: slow nods, meaningful pauses. Do not crack."), [
    t("我昨天被甩了。", "I got dumped yesterday."),
    t("下面说说这件事教会了我什么样的 B2B 销售。", "Here's what it taught me about B2B sales."),
    t("她说我从来不听她说话。我说：「这个反馈很好，我们回头再对一下。」", "She said I never listen. I said, “That's great feedback. Let's circle back.”"),
    t("那一刻我明白了：每一段感情都是一个销售漏斗，大多数线索都不会成交。", "That's when I realised: every relationship is a sales funnel. Most leads don't convert."),
    t("我本可以哭的。但我选择了更新客户管理系统。", "I could have cried. Instead, I updated my CRM."),
    t("第一课：线索不能放凉。第二课：永远要请对方转介绍。所以我请了。她把我拉黑了。", "Lesson one: never let a lead go cold. Lesson two: always ask for a referral. So I did. She blocked me."),
    t("被拒绝不是失败，是数据。", "Rejection isn't failure. It's data."),
    t("我很谦卑。我很感恩。我单身了。同意吗？", "I'm humbled. I'm grateful. I'm single. Agree?"),
  ]),
  p("en-deadpan-chair", "deadpan", t("求评理：我把自己的椅子带去了婚礼", "Am I wrong for bringing my own chair to a wedding?"), t("像一个冷静、讲道理的人在讲，虽然问题明明就出在你身上。", "Read it like a calm, reasonable person who is absolutely the problem."), [
    t("我把自己的椅子带去了我姐的婚礼，我错了吗？", "Am I wrong for bringing my own chair to my sister's wedding?"),
    t("先说背景：我三十四岁，有一把很特别的椅子。是躺椅，带杯架。", "Some context. I'm 34, and I have a very specific chair. It's a recliner. It has cup holders."),
    t("我姐说婚礼场地「有椅子」。我问那些椅子能不能躺。她挂了我的电话。", "My sister said the venue “has chairs”. I asked if they recline. She hung up."),
    t("所以我把椅子带去了，还带了一个小插线板，给按摩功能用。", "So I brought my chair. And a small extension cord, for the massage function."),
    t("交换誓词的时候，它可能发出了一点声音。那个声音是「嗡——」。", "During the vows, it may have made a noise. The noise was “whirr”."),
    t("现在全家都说我「抢了风头」。可我坐得很舒服啊，爱不就是这样吗？", "Now my whole family says I “made it about me”. But I was very comfortable, and isn't that what love is?"),
    t("补充：所有说我错了的人，我正坐在我的椅子上看你们的评论。", "Edit: to everyone saying I'm wrong, I'm reading your comments from my chair."),
  ]),
  p("en-deadpan-goose", "deadpan", t("亲身经历：我是怎么成了一只鹅的领导的", "Storytime: how I became the leader of a goose"), t("像老兵回忆一段很沉重的往事：停顿要长，一个笑都不能有。", "Tell it like a war veteran remembering something heavy. Long pauses. Not one smile."), [
    t("这是一个关于我怎么一不小心成了一只鹅的领导的故事。", "This is the story of how I accidentally became the leader of a goose."),
    t("那是一个星期二。我在公园吃三明治。一只鹅看着我。", "It was a Tuesday. I was eating a sandwich in the park. A goose looked at me."),
    t("我跟它对视了。这是我犯的第一个错误。", "I made eye contact. That was my first mistake."),
    t("我给了它一点面包屑。就一点。这是我犯的第二个错误。", "I gave it one crumb. Just one. That was my second mistake."),
    t("它跟着我回家，跟着我上班，还参加了一次视频会议，自己打开了麦克风。", "It followed me home. It followed me to work. It attended a video call. It unmuted."),
    t("房东问我是不是养了宠物。我说：「没有，那是我同事。」", "My landlord asked if I had a pet. I said, “No. I have a colleague.”"),
    t("我们在一起三年了。我还是不知道它叫什么。它知道我叫什么。", "We've been together three years now. I still don't know its name. It knows mine."),
    t("每天，我吃我的三明治；每天，它看着我；每天，我给它一点面包屑。", "Every day, I eat my sandwich. Every day, it watches. Every day, I give it one crumb."),
  ]),

  /* ---------------------------------------------------------------- the breakup */
  p("en-breakup-hr-text", "breakup", t("一条像人事部写的分手短信", "A breakup text, written like an HR email"), t("像一封非常礼貌的工作邮件，读到最后一句，突然绷不住了。", "Read it like a very polite work email. Then, on the last line, crumble."), [
    t("乔丹你好，希望你一切都好。", "Hi Jordan, hope this finds you well."),
    t("根据我们周六的谈话，我决定在没有你的情况下继续前进。", "Following our conversation on Saturday, I've decided to move forward without you."),
    t("本决定即时生效，不接受讨论。", "This decision is effective immediately and is not open for discussion."),
    t("请尽快归还：我的卫衣、我的充电器，和我信任别人的能力。", "Please return my hoodie, my phone charger and my ability to trust, at your earliest convenience."),
    t("你使用我视频会员的权限，将于今天下班前取消。", "Your access to my streaming account will be revoked by end of day."),
    t("感谢你这八个月以来的付出。在某些时候，你曾是我生活中宝贵的一员。", "Thank you for your eight months of service. You were, at times, a valued member of my life."),
    t("重申我上一条短信：我们结束了。", "As per my last text: we're done."),
    t("……除非你周五想一起吃个饭。不。不。此致敬礼。", "...Unless you want to get dinner on Friday. No. No. Kind regards."),
  ]),
  p("en-breakup-gym", "breakup", t("亲爱的健身房：不是你的问题，是我的问题", "Dear Gym: it's not you, it's me"), t("温柔，像在体面地拒绝一个人，每一句「不是你的问题」之前都停一下。", "Gentle, like letting someone down easy. Pause before every “it's not you”."), [
    t("亲爱的健身房：", "Dear Gym,"),
    t("不是你的问题，是我的问题。", "It's not you. It's me."),
    t("你一直都那么支持我。两百台器械，免费毛巾，还有一个我从来没去过的果昔吧台。", "You've been nothing but supportive. Two hundred machines. Free towels. A smoothie bar I have never once visited."),
    t("你每周都给我发邮件：「我们想你了。」「你的目标在等你。」「你还好吗？」", "You email me every week. “We miss you.” “Your goals are waiting.” “Are you okay?”"),
    t("我很好。我只是有了别人。她叫沙发。她从来不让我出汗。", "I'm okay. I've just found someone else. Her name is Sofa. She never makes me sweat."),
    t("我知道你会好好的。你还有布拉德。布拉德每天早上五点都在。布拉德才是你的真命天子。", "I know you'll be fine. You have Brad. Brad is there every morning at five. Brad is the one for you."),
    t("请别再从我的卡里扣钱了。我只有这一个请求。", "Please stop charging my card. That's all I ask."),
    t("再见了。我会永远记得我唯一一次用划船机的样子。坐反了。", "Goodbye. I'll always remember the one time I used the rowing machine. The wrong way round."),
  ]),
  p("en-breakup-villain-era", "breakup", t("宣布：我进入了反派时代", "Announcing my villain era"), t("开头又小又委屈，然后慢慢站起来，像流行歌星一样宣布。", "Start small and sad, then slowly stand up and announce it like a pop star."), [
    t("他说他需要「空间」。所以我给了他空间，全都给了他。", "He said he needed “space”. So I gave him space. I gave him all of it."),
    t("我在车里哭，在淋浴间哭，在麦片货架前哭，一个陌生人递给我一张优惠券。", "I cried in the car. I cried in the shower. I cried in the cereal aisle, and a stranger handed me a coupon."),
    t("可是今天，有些东西变了。", "But today, something changed."),
    t("我买了一件黑大衣。我学会了直视别人的眼睛。不好笑的事，我不再回「哈哈」。", "I bought a black coat. I learned to make eye contact. I stopped replying “haha” to things that aren't funny."),
    t("我不再心碎了。我进入了我的反派时代。", "I'm not heartbroken any more. I'm in my villain era."),
    t("他的卫衣我会还的。还给慈善二手店。", "I will be returning his hoodie. To the charity shop."),
    t("给每一个需要听到这句话的人：你就是主角，拿出主角的样子来。", "To anyone who needs to hear this: you are the main character. Act like it."),
  ]),

  /* ---------------------------------------------------------------- the royal court */
  p("en-court-fridge", "court", t("关于办公室冰箱的皇家公告", "A royal proclamation concerning the office fridge"), t("先摇一下想象中的铃铛，像中世纪街头的报信人一样宣读：大声、缓慢、庄重。", "Ring an imaginary bell first, then proclaim it like a town crier: loud, slow and grand."), [
    t("听着！听着！四楼的所有子民，都给我听好了！", "Hear ye! Hear ye! Let all who dwell on the fourth floor attend!"),
    t("奉王室之命：本周五中午十二点，御用冰箱将被清空！", "By order of the Crown, the Royal Fridge shall be emptied this Friday at noon!"),
    t("凡是日期写着上个月的酸奶，一律流放！", "Any yogurt bearing last month's date shall be banished!"),
    t("最里面那个神秘的饭盒，里面的东西没人叫得出名字，一律焚毁！", "The mysterious container at the back, whose contents no one can name, shall be burned!"),
    t("凡偷吃他人午饭者，在复印机旁示众一小时！", "Whosoever taketh another's lunch shall be placed in the stocks, by the photocopier, for one hour!"),
    t("至于在牛奶上写着「别碰，说的就是你，加里」的那位：王室看见你了，王室同意你。", "And whosoever labelled the milk “DO NOT TOUCH, THIS MEANS YOU, GARY”: the Crown sees you, and the Crown agrees."),
    t("冰箱万岁！", "God save the Fridge!"),
  ]),
  p("en-court-laundry", "court", t("莎士比亚式独白：洗衣服", "A Shakespearean soliloquy about laundry"), t("像举着骷髅头一样举起一只袜子，对着它说。声音要大、要慢、要悲壮。", "Hold up a sock like a skull and speak to it. Big, slow and tragic."), [
    t("叠，还是不叠：这是一个问题。", "To fold, or not to fold: that is the question."),
    t("是默默忍受那一堆皱巴巴的衣服更高贵，", "Whether 'tis nobler in the mind to suffer the wrinkles of outrageous laundry,"),
    t("还是拿起武器，对抗这一片袜子的海洋，把它们一件件叠好，从此了结？", "or to take arms against a sea of socks, and by folding, end them?"),
    t("唉，可怜的袜子！我曾那么熟悉你。你的另一只呢？它去了哪里？", "Alas, poor sock! I knew him well. Where is thy brother? Whither hath he gone?"),
    t("你们成双成对地走进烘干机，出来的时候，却只剩你一个。", "Thou went'st into the dryer as a pair, and cam'st out alone."),
    t("椅子上那一堆越堆越高，像我的罪孽堆成的山。", "The pile upon the chair grows higher, like a mountain of my sins."),
    t("明天，明天，还有明天，我会叠的。明天。", "Tomorrow, and tomorrow, and tomorrow, I shall fold it. Tomorrow."),
  ]),
  p("en-court-victorian-chat", "court", t("一位维多利亚时代的淑女，写信抱怨群聊", "A Victorian lady writes to complain about the group chat"), t("端庄得体，翘起小拇指，读到「流眼泪」时倒吸一口气。", "Prim and proper, little finger raised, with a gasp at “weeping”."), [
    t("我最亲爱的玛格丽特：", "My dearest Margaret,"),
    t("我怀着无比沉痛的心情给你写信。", "I write to you in the gravest distress."),
    t("昨晚，我们认识的一位绅士在群里发了一条消息，只有三个字母：「lol」。", "Last evening, a gentleman of our acquaintance sent a message to the group consisting solely of the word “lol”."),
    t("我不知道那是什么意思。我担心那是法语。", "I know not what it means. I fear it is French."),
    t("没过多久，另一位绅士回了一张小黄脸，笑得流眼泪。流眼泪啊，玛格丽特！", "Moments later, a second gentleman replied with a small yellow face, weeping with laughter. Weeping, Margaret!"),
    t("我闻着嗅盐卧床不起，并且把那个群静音到了明年春天。", "I have taken to my bed with smelling salts, and I have muted the group until spring."),
    t("如果你想与我通信，请写信，按照上帝的旨意。", "Should you wish to correspond, kindly write a letter, as God intended."),
    t("你极其痛苦的，埃莉诺。", "Yours, most dreadfully, Eleanor."),
  ]),

  /* ---------------------------------------------------------------- broadcast voice */
  p("en-anchor-trailer", "anchor", t("电影预告片：我去超市", "The movie trailer for my trip to the grocery store"), t("电影预告片那种低沉的嗓音，每一句都像人类历史上最重要的一句话。", "The deep movie-trailer voice. Every line is the most important thing ever said."), [
    t("在一个……冰箱空空的世界里……", "In a world... where the fridge is empty..."),
    t("有一个男人……必须……去超市。", "One man... must go... to the store."),
    t("他有一张购物清单。但他不会照着买。", "He has a list. He will not follow it."),
    t("一辆推车。一个摇摇晃晃的轮子。没有退路。", "One trolley. One wobbly wheel. No way back."),
    t("他是来买牛奶的。他走的时候，带走了一盏台灯、三根蜡烛，和一种说不清的感觉。", "He came for milk. He leaves with a lamp, three candles, and a feeling he can't explain."),
    t("本片适合所有年龄，含轻微危险情节，以及零食。", "Rated PG. For mild peril. And snacks."),
    t("即将登陆……你家附近的厨房。", "Coming soon... to a kitchen near you."),
  ]),
  p("en-anchor-roommate", "anchor", t("自然纪录片：我的室友", "A nature documentary about my roommate"), t("自然纪录片的旁白：压低声音，充满敬畏，好像大声一点它就会被吓跑。", "A hushed, awed nature-documentary whisper, as if one loud word would scare him off."), [
    t("而在这里……在它的天然栖息地……沙发上……我们发现了一只室友。", "And here... in his natural habitat... the sofa... we find the roommate."),
    t("它已经六个小时没有动过了。对它这个物种来说，这完全正常。", "He has not moved in six hours. This is perfectly normal for his species."),
    t("仔细看。它察觉到了什么。是一股味道……别人的披萨的味道。", "Watch closely. He senses something. The smell... of someone else's pizza."),
    t("它站起来了。缓慢地，无声地。狩猎开始了。", "He rises. Slowly. Silently. The hunt has begun."),
    t("它靠近冰箱……然后僵住了。披萨上贴着名字。", "He approaches the fridge... and freezes. The pizza is labelled."),
    t("片刻的犹豫。然后，自然法则占了上风。它吃了一块。然后把名字也吃了。", "A moment of doubt. Then nature takes its course. He eats one slice. Then he eats the label."),
    t("不可思议。真的是……不可思议。", "Remarkable. Truly... remarkable."),
  ]),
  p("en-anchor-mum-shopping", "anchor", t("现场解说：我妈逛超市", "Live commentary: my mum at the supermarket"), t("一个不敢相信自己眼睛的体育解说员，一句比一句大声、一句比一句快。", "A sports commentator who can't believe what he's seeing. Louder and faster with every line."), [
    t("她进场了！穿过自动门，这开局太漂亮了！", "And she's in! Through the automatic doors, and what a start!"),
    t("她拿了一辆推车。不，是购物篮！不，还是推车！她改主意了！这战术太神了！", "She takes a trolley. No, a basket! No, a trolley! She's changed her mind! Incredible tactics!"),
    t("冲进蔬果区，她在捏牛油果，一个、两个、三个，她一个都不满意！", "Down the produce aisle, she's squeezing the avocados, one, two, three, and she's not happy with any of them!"),
    t("哦，前面是试吃台！她要上了！她拿了两块！两块！难以置信的一幕！", "Oh, here comes a sample stand! She's going for it! She's taken two! TWO! Unbelievable scenes!"),
    t("她到收银台了！九件商品走了八件以内的快速通道！全场沸腾了！", "She's at the checkout! Nine items in the eight-items lane! The crowd is going wild!"),
    t("她拿出了优惠券！优惠券过期了！她在据理力争！她赢了！", "She has a coupon! The coupon has expired! She's arguing! She's WINNING!"),
    t("比赛结束！她做到了！多么精彩的表演！快去把车发动起来！", "And it's all over! She's done it! What a performance! Get the car started!"),
  ]),

  /* ---------------------------------------------------------------- the meltdown */
  p("en-rant-birthday-chat", "rant", t("崩溃：在群里约生日饭", "Crashout: planning a birthday in the group chat"), t("开头是热心的组织者，结尾是一个彻底绝望的人。一句比一句快。", "Start as the friendly organiser, end as someone who has lost all hope. Faster every line."), [
    t("大家好！问一下：周六给山姆过生日还算数吧？", "Hi everyone! Quick one: are we still on for Sam's birthday on Saturday?"),
    t("十一个人看了这条消息。十一个！没有一个人回！", "Eleven people have seen this. Eleven! Nobody has replied!"),
    t("杰丝回了个大拇指。杰丝，大拇指是什么意思？去？不去？你喜欢「生日」这个概念？", "Jess reacted with a thumbs up. What does the thumbs up mean, Jess? Yes? No? You like the concept of birthdays?"),
    t("迈克说「看情况」。迈克，三个星期了！你不能还在「看情况」！", "Mike said “maybe”. Mike, it's been three weeks. You can't still be “maybe”!"),
    t("有人说「到时候看心情」。到时候我们什么心情都不会有，因为什么都没订！", "Someone said we should “just see how we feel on the day”. We will feel NOTHING on the day, because nothing will be BOOKED!"),
    t("我发了个投票。两个人投了。一个是我。另一个也是我，用我的另一部手机！", "I made a poll. Two people voted. One of them was me. The other one was ALSO me, on my other phone!"),
    t("好！我订！我订一张十一个人的桌子，没人来的话，我一个人吃十一份！", "FINE. I'm booking it. A table for eleven, and if nobody comes, I'm eating eleven dinners!"),
    t("……山姆刚说他周六没空。", "...Sam just said he's busy on Saturday."),
  ]),
  p("en-rant-self-checkout", "rant", t("在自助收银机前崩溃", "Losing it at the self-checkout"), t("开头是礼貌的顾客，结尾在对着一台机器大吼。破音也没关系。", "Polite customer at first. By the end you're shouting at a machine. Voice cracks welcome."), [
    t("好。扫一下香蕉。嘀。很好。", "Okay. Scanning the bananas. Beep. Lovely."),
    t("「请将商品放入装袋区。」放了，在装袋区。", "“Please place the item in the bagging area.” It's in the bagging area."),
    t("「装袋区有异物。」那是香蕉！你刚刚才认识它！", "“Unexpected item in the bagging area.” It's the bananas! You just met them!"),
    t("「请等待工作人员协助。」我不要协助！我要香蕉！", "“Please wait for assistance.” I don't want assistance! I want bananas!"),
    t("过来一个十六岁的少年，他对着我叹气。他？对着我？叹气？", "A sixteen-year-old is coming over. He's sighing at me. HE is sighing at ME?"),
    t("他在屏幕上点了一下。好了。凭什么他一点就好了？！", "He taps the screen once. It works. Why does it work for HIM?!"),
    t("我根本就不喜欢吃香蕉！我是来买牛奶的！我忘了买牛奶！", "I don't even like bananas! I came here for milk! I forgot the milk!"),
    t("……感谢您的光临，祝您愉快。你也是。", "...Thank you for shopping with us. Have a nice day. You too."),
  ]),
  p("en-rant-reply-all", "rant", t("全部回复：别再点全部回复了", "Reply all: stop replying all"), t("一个上班族当场崩溃：一句比一句大声，倒数第二句吼出来，最后一句小声。", "An office worker cracking in real time. Louder every line, roar the second-to-last, then whisper the end."), [
    t("大家好，温馨提醒一下：回复公司简报的时候，请不要点「全部回复」。", "Hi all, just a gentle reminder: please don't reply all to the newsletter."),
    t("大家好，再说一次，回复的时候请把全公司从收件人里删掉，谢谢！", "Hi all, again: please remove the whole company from your replies. Thanks!"),
    t("大家好。四百个人。四百个！已经有四百个人对着全公司回复了「请把我从这个名单里删掉」。", "Hi all. Four hundred people. FOUR HUNDRED. Have now replied “please remove me from this list” to the list."),
    t("财务部的布伦达回复了六次「退订」。布伦达，上班是退订不了的！", "Brenda from Accounts has replied “unsubscribe” six times. Brenda, you can't unsubscribe from WORK!"),
    t("有人回了一句「周五快乐！」还配了一张动图。今天是星期二，凯文！是星期二！", "Someone replied “Happy Friday!” with a GIF. It's Tuesday, Kevin! It is TUESDAY!"),
    t("我的收件箱有九千封未读邮件，全都是这一封！", "My inbox has nine thousand unread emails, and they are all THIS EMAIL!"),
    t("别！再！全部回复了！", "STOP. REPLYING. ALL!"),
    t("（小声）此致敬礼。发自我的手机。哦不。我点了全部回复。", "(quietly) Kind regards. Sent from my phone. Oh no. I replied all."),
  ]),

  /* ---------------------------------------------------------------- melodrama */
  p("en-melo-dentist", "melodrama", t("肥皂剧大揭秘", "The soap opera reveal"), t("白天肥皂剧的强度：说得很慢，每一句都是一颗炸弹，每次揭秘都猛地转头。", "Daytime-drama intensity: slow, every line a bombshell, and whip your head round on every reveal."), [
    t("你以为你二十年后回到这里，我就认不出你了？", "You thought you could come back here after twenty years and I wouldn't recognise you?"),
    t("哦，我知道你是谁。", "Oh, I know who you are."),
    t("你不是我俄亥俄州的表妹。", "You're not my cousin from Ohio."),
    t("你根本就不是我表妹。", "You're not even my cousin."),
    t("你是我的牙医。", "You're my dentist."),
    t("没错。十年来，每半年一次，你看着我的嘴，当着我的面撒谎。", "That's right. Every six months for ten years, you looked into my mouth and lied to my face."),
    t("「没有蛀牙。」你说。没有蛀牙？", "“No cavities,” you said. NO CAVITIES?"),
    t("告诉你吧，医生。我有三颗。而且我要嫁给你弟弟了。", "Well, I have news for you, Doctor. I have three. And I'm marrying your brother."),
  ]),
  p("en-melo-holiday-movie", "melodrama", t("节日爱情电影的高潮", "The big moment in a holiday romance movie"), t("轻柔又喘不过气，深情地看着一个观众的眼睛。雪在下（在你心里）。", "Soft and breathless, staring into someone's eyes in the audience. Snow is falling (in your heart)."), [
    t("我回到这个小镇，是为了卖掉那家面包店。关掉它，然后回大城市。", "I came back to this little town to sell the bakery. To close it down. To go back to the city."),
    t("可是后来我遇见了你。经营圣诞树农场的那个人。还经营五金店。还在消防站上班。不知道怎么做到的。", "But then I met you. The guy who runs the Christmas tree farm. And the hardware store. And the fire station. Somehow."),
    t("你教会了我怎么装饰饼干。你教会了我节日真正的意义。", "You taught me how to decorate a cookie. You taught me the real meaning of the holidays."),
    t("你还教会了我：一个女人可以是大城市的律师，同时也可以突然很会滑冰。", "You taught me that a woman can be a big-city lawyer and also, suddenly, very good at ice skating."),
    t("我不回大城市了。", "I'm not going back to the city."),
    t("我要留下来。面包店我不卖了。我要给它起名叫……「希望」。", "I'm staying. I'm keeping the bakery. I'm calling it... “Hope”."),
    t("（小声）你看，下雪了。这里从来没下过雪。", "(whisper) Look. It's snowing. It's never snowed here before."),
    t("我们才认识四天。你愿意嫁给我吗？", "We've known each other four days. Will you marry me?"),
  ]),
  p("en-melo-towels", "melodrama", t("电视剧里的大对质", "The telenovela confrontation"), t("拉满的南美电视剧风格：倒吸一口气、手扶额头，最后一句拖一个长长的「不——」。", "Full telenovela: dramatic gasps, a hand on the forehead, and a long “Nooo” at the end."), [
    t("塞巴斯蒂安。你怎么能这样？", "Sebastián. How could you?"),
    t("我相信你。我们全家都相信你。我奶奶把她的房子都留给了你！", "I trusted you. My family trusted you. My grandmother left you her house!"),
    t("而你……你……用我最好的毛巾，给狗擦身子。", "And you... you... used my good towels. To dry the dog."),
    t("（倒吸一口气）别碰我！", "(gasp) Don't you touch me!"),
    t("二十年了，我一直把那些毛巾洗得雪白。二十年！", "Twenty years I have kept those towels white. Twenty years!"),
    t("你想要我原谅你？那就说实话。只有毛巾吗？", "You want forgiveness? Then tell me the truth. Was it only the towels?"),
    t("（长长的停顿）……浴袍也是？", "(long pause) ...The bathrobe too?"),
    t("不——————！", "Nooooooooo!"),
  ]),

  /* ---------------------------------------------------------------- the hard sell */
  p("en-sell-spoon", "sell", t("深夜电视购物：勺子", "Late-night infomercial: the Spoon"), t("电视购物的气势：指着观众，越来越快，「等一下，还有更多！」要喊出来。", "Big infomercial energy. Point at the audience, get faster, and shout “But wait, there's more!”"), [
    t("你是不是已经受够了用叉子喝汤？", "Are you tired of eating soup with a fork?"),
    t("你是不是每天早上都把麦片洒一地？（叹气）一定有更好的办法！", "Do you spill your cereal every single morning? (sigh) There has to be a better way!"),
    t("隆重推出……勺子！它像叉子一样，但它能装液体！", "Introducing... the Spoon! It's like a fork, but it holds liquid!"),
    t("喝汤？勺子！吃冰淇淋？勺子！一边看着窗外一边搅咖啡？勺子！", "Soup? Spoon! Ice cream? Spoon! Stirring your coffee while staring out of the window? SPOON!"),
    t("现在订购，送你的不是一把，是两把勺子！", "Order now and get not one, but TWO spoons!"),
    t("等一下，还有更多！十分钟内打进电话，再加送一把小一点的勺子，给孩子用！", "But wait, there's more! Call in the next ten minutes and we'll throw in a second, slightly smaller spoon, for the kids!"),
    t("接线员正在等你！别让汤赢了你！", "Operators are standing by! Don't let soup win!"),
  ]),
  p("en-sell-tap-water", "sell", t("直播购物：匠心自来水", "Live shopping: artisanal tap water"), t("一个兴奋过头的直播购物主播，把评论区读出来，好像都是真的。", "A live-shopping host who is far too excited. Read out the comments as if they were real."), [
    t("姐妹们好，欢迎回到直播间！今天上新的这款，绝对独家。", "Hi besties, welcome back to the stream! Today's drop is SO exclusive."),
    t("是水。但不是普通的水。这是匠心、小批量、本地采集的……自来水。", "It's water. But not just any water. This is artisanal, small-batch, locally sourced... tap water."),
    t("采集自我家厨房，由我亲手灌装，装进我找到的一个罐子里。", "Sourced from my kitchen, hand-poured by me, into a jar I found."),
    t("无麸质，零糖，说实话，主打一个补水。", "It's gluten-free, sugar-free, and honestly? It's giving hydration."),
    t("哦，评论区有人问「这不就是水吗？」宝，这是一种生活方式。", "Oh, someone in the comments asks, “Isn't this just water?” Babe, it's a lifestyle."),
    t("只有五十罐！四十九！有人刚买了六罐！说是婚礼用！", "Only fifty jars! Forty-nine! Somebody just bought six! For a wedding!"),
    t("链接在主页，不退不换，绝不骗人！", "Link in bio, no refunds, no cap!"),
  ]),
  p("en-sell-cozy-studio", "sell", t("看房：一套非常「温馨」的公寓", "Open house: a very cosy apartment"), t("一个绝不承认任何缺点的房产中介：笑容要大，双臂张开。", "An estate agent who will never admit anything is wrong. Big smile, arms wide."), [
    t("欢迎欢迎！快请进！小心台阶。小心另一个台阶。台阶有点多。", "Welcome, welcome! Come in! Mind the step. Mind the other step. There are a lot of steps."),
    t("这就是我们说的温馨小开间。温馨的意思是，你可以同时摸到两面墙。来，试试看！", "This is what we call a cosy studio. Cosy means you can touch both walls at once. Go on, try it!"),
    t("厨房是开放式的。因为它就在卧室里。", "The kitchen is open-plan. Because it's in the bedroom."),
    t("卫生间带雨淋式花洒。因为它就在漏水的地方下面。", "The bathroom has a rainfall shower. Because it's under the leak."),
    t("采光？那当然。每天早上六点，整整十一分钟。", "Natural light? Absolutely. Every morning at six, for eleven minutes."),
    t("邻居很热闹。我们就用这个词：热闹。", "The neighbours are lively. That's the word we use. Lively."),
    t("一个月才两千！已经有五个人出价了！现在开始竞价！", "Only two thousand a month! Five offers already! Bidding starts now!"),
  ]),

  /* ---------------------------------------------------------------- the apology */
  p("en-sorry-notes-app", "sorry", t("手机备忘录道歉：剩下的饺子", "A Notes-app apology for the leftover dumplings"), t("网红道歉：眼神忧伤，声音轻柔，开口前长长叹一口气，举起手机像在展示截图。", "Influencer apology: sad eyes, soft voice, a long sigh before you start, phone held up like a screenshot."), [
    t("致我的室友们。我沉默了几个小时，因为我需要时间反思。", "To my roommates. I've been quiet for a few hours, because I needed time to reflect."),
    t("昨天晚上，我吃了冰箱里剩下的饺子。那不是我的饺子。", "Last night, I ate the leftover dumplings. They were not my dumplings."),
    t("我想说清楚：没有任何借口。我饿了，它们就在那里，我做了一个选择。", "I want to be clear: there is no excuse. I was hungry, they were there, and I made a choice."),
    t("我看见你们了。我听见你们了。我在学习。", "I see you. I hear you. I'm learning."),
    t("这不是真正的我。好吧，这是凌晨两点的我。", "This is not who I am. Well. It is who I was at 2 a.m."),
    t("接下来我会暂时远离冰箱，专注于自我成长。", "I'll be stepping back from the fridge for a while to focus on my growth."),
    t("谢谢你们对我的监督。对不起。请不要截图。", "Thank you for holding me accountable. I'm sorry. Please don't screenshot this."),
  ]),
  p("en-sorry-mid", "sorry", t("我的道歉视频（我说一部剧「一般般」）", "My apology video (I called a show “mid”)"), t("慢慢坐下，深深叹气，看着镜头，每一声「大家」都说得像很痛。", "Sit down slowly, sigh deeply, look into the camera, and say “guys” like it hurts."), [
    t("大家好。这个视频很难拍。", "Hey guys. So. This is a hard video to make."),
    t("（长长地叹气）我今天没化妆，因为这件事很严肃。", "(long sigh) I'm not wearing makeup, because this is serious."),
    t("上周直播的时候，我说一部很火的剧，原话是：「一般般」。", "Last week, on my livestream, I said that a very popular show was, and I quote, “mid”."),
    t("我没有意识到我的话会带来多大的影响。对粉丝，对演员，也对「一般般」这个词。", "I didn't understand the impact my words would have. On the fans. On the cast. On the word “mid”."),
    t("从那以后，我掉了四万个粉丝，还掉了一个姑姑。", "Since then, I've lost forty thousand followers and one aunt."),
    t("我会暂时离开网络，好好反思。周四回来。", "I'm taking a break from the internet to reflect. I'll be back on Thursday."),
    t("请点赞订阅。我是说，如果你愿意的话。没有压力。点赞订阅。", "Please like and subscribe. I mean, if you want. No pressure. Like and subscribe."),
  ]),
  p("en-sorry-karaoke", "sorry", t("就昨晚的卡拉 OK，向全楼邻居正式道歉", "A formal apology to the neighbours for last night's karaoke"), t("像开记者会：清清嗓子，慢慢读，最后鞠躬。千万别唱出来。", "A press conference: clear your throat, read slowly, and bow at the end. Do not sing."), [
    t("致 3A 到 3F 的各位住户。", "To the residents of apartments 3A to 3F."),
    t("周六晚上十一点到凌晨三点，我在家里开了一场卡拉 OK 派对。", "On Saturday night, between eleven and three in the morning, I hosted a karaoke party."),
    t("对于发生的一切，我愿意承担全部责任，尤其是那几首苦情歌。", "I take full responsibility for what happened. Especially the power ballads."),
    t("我知道，那首最难的高音情歌，我试了九次，没有一次成功。", "I am aware that the hardest power ballad was attempted nine times. None of the attempts were successful."),
    t("致 3C 的女士：对不起，让你的猫听到了那些声音。对不起，我还邀请你的猫一起唱。", "To the lady in 3C: I'm sorry your cat had to hear that. I'm sorry I invited your cat to join in."),
    t("致那位敲墙的先生：我以为你在帮我打拍子。现在我知道了，你不是。", "To the gentleman who banged on the wall: I thought you were keeping the beat. I see now that you were not."),
    t("麦克风已经还回去了。那些回忆，还不回去了。", "The microphone has been returned. The memories cannot be."),
  ]),

  /* ---------------------------------------------------------------- do the voice */
  p("en-voice-slam-order", "voice", t("Slam 诗歌：一份外卖订单", "Slam poetry: a delivery order"), t("Slam 诗歌的腔调：有节奏，打响指，被句号隔开的字一个一个重重地砸下去，每句后面停一下。", "Slam poetry: rhythm, finger snaps, hit the capital words hard, and pause after every line."), [
    t("这首诗的名字叫……《多加酱》。", "This poem is called... “Extra Sauce”."),
    t("一个汉堡。五分熟。不是七分熟。我说的是五分熟。", "One burger. Medium. NOT medium-well. I said MEDIUM."),
    t("不要酸黄瓜。我再说一遍。不。要。酸黄瓜。酸黄瓜伤害过我。", "No pickles. I repeat. No. Pickles. Pickles have hurt me before."),
    t("加培根。加芝士。加上我从来没有过的勇气。", "Add bacon. Add cheese. Add the courage I never had."),
    t("薯条要脆。脆得像我上一个十月的落叶。", "Fries, but make them crispy. Crispy like the leaves of my last October."),
    t("多加酱。多加酱。多。加。酱。", "Extra sauce. Extra sauce. EXTRA. SAUCE."),
    t("放门口。按门铃。然后跑。跑吧，外卖员。跑吧，去自由吧。", "Leave it at the door. Ring the bell. Then run. Run, delivery driver. Run, and be free."),
    t("（打响指，打响指，打响指）", "(snap, snap, snap)"),
  ]),
  p("en-voice-radio-battery", "voice", t("老式广播：手机电量危机", "Old-time radio: a bulletin about my phone battery"), t("上世纪四十年代的电台播音员：语速快、字字清楚、带点鼻音，好像国家的命运就靠这条新闻了。", "A 1940s radio announcer: fast, crisp, a little nasal, as if the fate of the nation depended on it."), [
    t("女士们，先生们，晚上好，欢迎收听本台特别新闻！", "Good evening, ladies and gentlemen, and welcome to this special bulletin!"),
    t("我们中断正常节目，为您播报一条来自客厅的重大消息！", "We interrupt our regular programme with grave news from the living room!"),
    t("今晚七点三十二分，那位年轻人的电话，电量跌到了百分之四！", "At seven thirty-two this evening, the young man's telephone fell to four per cent!"),
    t("据目击者称，他当时正在看一个男人修复一把生锈的刀，根本停不下来！", "Witnesses report he was watching a video of a man restoring a rusty knife. He could not look away!"),
    t("充电器最后一次出现是在厨房，目前仍下落不明！全国人民屏住了呼吸！", "The charger, last seen in the kitchen, remains missing! The nation holds its breath!"),
    t("等一下！刚刚收到消息！充电器找到了！一直就在他自己手里！", "Wait! This just in! The charger has been found! It was in his hand the whole time!"),
    t("请继续收听我们的下一个节目：《为什么它充得这么慢？》", "Stay tuned for our next programme: “Why Is It Charging So Slowly?”"),
  ]),
  p("en-voice-gen-alpha", "voice", t("用 Alpha 世代的网络黑话讲小红帽", "Little Red Riding Hood, in Gen Alpha slang"), t("像围着篝火讲故事一样严肃，但每一个网络黑话都说得理直气壮。", "Tell it like a very serious storyteller by the fire, with total confidence in every slang word."), [
    t("从前，有一个气场拉满的女孩。戴着红帽子。她赢麻了，干干净净。", "Once upon a time, there was a girl with insane aura. Red hood. She ate. No crumbs."),
    t("她奶奶有点不舒服，她就带了一篮子零食过去，零食绝绝子。", "Her grandma was lowkey sick, so she brought a basket of snacks, and the snacks were bussin'."),
    t("在森林里，她遇到一只狼。狼想撩她。属实有点下头。", "In the woods, she met a wolf. The wolf tried to rizz her up. It was giving creep."),
    t("「小姑娘，你要去哪儿呀？」狼说。她给了它一个面无表情的凝视。零回应。封神。", "“Where are you going, little girl?” he said. She gave him the stare. Zero response. Iconic."),
    t("狼跑到奶奶家，穿上了奶奶的睡衣。说实话，这操作有点离谱。", "The wolf ran to Grandma's house and put on her nightgown. Delulu behaviour, honestly."),
    t("「奶奶，你的眼睛怎么这么大？」「这样才能更好地——」「兄弟，你完蛋了。」", "“Grandma, what big eyes you have.” “All the better to—” “Bro, you're cooked.”"),
    t("伐木工出现了，主角光环拉满。狼呢？气场负一千。", "The woodcutter showed up. Main character energy. The wolf? Minus a thousand aura."),
    t("从此她过上了幸福的生活。六，七。", "And she lived happily ever after. Six, seven."),
  ]),
];
