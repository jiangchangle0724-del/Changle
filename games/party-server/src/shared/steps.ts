// The songs' own moves taught step by step, for someone who has never danced (worked out from the
// songs' videos): how to stand before it starts, what to do on each count, and what to keep in
// mind, in Chinese and English. Mirrored like the coach: "right" is your right. The TV shows them
// beside the coach, the count being danced lit up (client/words.ts); /party/moves shows them whole.
/** Counts `from` to `to` of an 8-count, and what to do on them. */
export type Line = [from: number, to: number, zh: string, en: string];
/**
 * A move taught step by step, for someone who has never danced: how to stand before it starts, what
 * to do on each count, and what to keep in mind. Mirrored like the coach: "right" is your right.
 */
export interface Steps {
  ready: [string, string];
  counts: Line[];
  tip?: [string, string];
}

/** Each move's steps, by its id. */
export const STEPS: Readonly<Record<string, Steps>> = {
  // 江南Style (the official video: the riding hall, the subway, the tour bus, the disco)
  "horse-ride": {
    ready: ["双脚比肩宽一点，脚尖微微朝外，膝盖弯下去，像骑在马背上；双手握拳，右手腕搭在左手腕上，放在胸口前，像握着缰绳", "Feet a little wider than your shoulders, toes slightly out, knees bent as if you're on a horse; make fists and cross your right wrist over the left in front of your chest, like holding the reins"],
    counts: [
      [1, 1, "右脚原地踩一下", "Step on your right foot, on the spot"],
      [2, 2, "左脚踩", "Step on your left"],
      [3, 3, "右脚踩", "Right"],
      [4, 4, "还是右脚，原地再小跳一下，左脚离地", "Right again: a little hop on it, left foot off the floor"],
      [5, 5, "左脚踩", "Left"],
      [6, 6, "右脚踩", "Right"],
      [7, 7, "左脚踩", "Left"],
      [8, 8, "还是左脚，再小跳一下，右脚离地", "Left again: a little hop, right foot off the floor"],
    ],
    tip: ["双手每一拍一起往下压，像拉缰绳；身体跟着上下颠，越像骑马越好", "Press both fists down on every beat, like tugging the reins, and let your body bounce: the more horse, the better"],
  },
  "horse-lasso": {
    ready: ["脚和骑马一样；左小臂横在胸前，手肘朝左；右手举起来，手肘和肩膀一样高，小臂竖直朝上", "Feet as in the horse ride; left forearm flat across your chest, elbow out to the left; right arm up, elbow as high as your shoulder, forearm straight up"],
    counts: [
      [1, 4, "脚：右、左、右、右（右脚小跳）；右手在头顶上转圈，一拍一圈，像甩套马的绳子", "Feet: right, left, right, right (hop); circle your right hand over your head, once a beat, like swinging a lasso"],
      [5, 8, "脚：左、右、左、左（左脚小跳）；右手继续转", "Feet: left, right, left, left (hop); keep the lasso going"],
    ],
    tip: ["转的是手腕和小臂，手肘别往下掉", "It's your wrist and forearm doing the circles: keep the elbow up"],
  },
  "sexy-lady": {
    ready: ["双手叉腰（拳头顶在腰两侧，手肘往外），双脚比肩宽，膝盖放松微弯，下巴抬高，表情要拽", "Hands on your hips (fists at your waist, elbows out), feet wider than your shoulders, knees soft, chin up, a cocky face"],
    counts: [
      [1, 1, "胯往右顶出去，左膝往里扣", "Pop your hips out to the right, left knee bending in"],
      [2, 2, "胯往左顶，右膝往里扣", "Hips to the left, right knee in"],
      [3, 3, "右", "Right"],
      [4, 4, "左", "Left"],
      [5, 8, "同 1-4：右、左、右、左", "Same again: right, left, right, left"],
    ],
    tip: ["上身和手不动，只甩屁股，头往反方向轻轻歪：歌里唱「Eh~ Sexy Lady」的地方", "Your upper body and hands stay still: only your hips swing, your head tipping the other way. It's the 'Eh~ Sexy Lady' part"],
  },
  "disco-point": {
    ready: ["双脚分得很开，膝盖弯低，像半坐着", "Feet wide apart, knees bent low, as if half sitting"],
    counts: [
      [1, 4, "左手往左上方斜着指天，右手往右下方指地；膝盖每拍弹一下，左手跟着往上戳", "Left arm points up and out to the upper left, right hand points down to the lower right; bounce your knees on every beat, jabbing the left hand up with it"],
      [5, 8, "双手举高成 V 字，跟着拍子左右摇", "Both arms up in a V, swaying side to side on the beat"],
    ],
    tip: ["MV 里 PSY 在大巴上和阿姨们蹦迪：放开了跳", "PSY partying with the aunties on the tour bus in the video: let loose"],
  },
  "gangnam-strut": {
    ready: ["右手手掌贴在胸口，左手自然垂着，下巴抬起来", "Right palm flat on your chest, left arm loose, chin up"],
    counts: [
      [1, 1, "右脚往右迈一步", "Step to the right"],
      [2, 2, "左脚跟过来，在右脚边点一下地，肩膀往右一甩", "Bring your left foot in and tap it by the right, shoulders swinging right"],
      [3, 3, "左脚往左迈一步", "Step to the left"],
      [4, 4, "右脚跟过来点地，肩膀往左甩", "Right foot taps in by the left, shoulders swinging left"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["像 MV 里在舞池走向心动的人，越嘚瑟越好", "Like PSY strutting up to someone on the dance floor in the video: the cockier the better"],
  },
  "gangnam-bounce": {
    ready: ["双脚与肩同宽，双手握拳放在胸前，手肘往两边张开", "Feet shoulder-width apart, fists in front of your chest, elbows out"],
    counts: [
      [1, 1, "膝盖往下弹一下", "Bounce your knees down"],
      [2, 2, "胯往前顶一下，拳头跟着往下压", "Push your hips forward, fists pressing down with it"],
      [3, 3, "弹", "Bounce"],
      [4, 4, "顶", "Hips forward"],
      [5, 8, "同 1-4，头跟着点", "Same again, nodding along"],
    ],
    tip: ["学 MV 里的小 PSY：放松、嘚瑟、带点坏笑", "Like little PSY in the video: loose, cheeky, a little grin"],
  },
  "hey-point": {
    ready: ["双脚分开，膝盖放松，双手松松地放在胸前", "Feet apart, knees soft, hands loose in front of your chest"],
    counts: [
      [1, 3, "身体跟着拍子左右晃：右、左、右", "Sway with the beat: right, left, right"],
      [4, 4, "右手往前上方一指，左手叉腰：「嘿！」", "Right arm points forward and up, left hand on your hip: 'Hey!'"],
      [5, 7, "晃：左、右、左", "Sway: left, right, left"],
      [8, 8, "换左手指，右手叉腰：「嘿！」", "Now the left arm points, right hand on your hip: 'Hey!'"],
    ],
    tip: ["歌里唱到「hey」的时候正好指出去", "Point just as the song sings 'hey'"],
  },
  "gangnam-pose": {
    ready: ["最后一个动作，摆个帅的", "The last move: make it look good"],
    counts: [
      [1, 1, "右腿往右踢出去，身体往右斜，右手往上举，左手叉腰", "Kick your right leg out, lean right, right arm up, left hand on your hip"],
      [2, 8, "定住！", "Hold it!"],
    ],
  },
  // Macarena: the 16 counts everyone knows, over and over, a quarter turn to the left each time
  "macarena-arms": {
    ready: ["双脚并拢站好，膝盖放松，跟着拍子轻轻晃", "Feet together, knees soft, swaying lightly with the beat"],
    counts: [
      [1, 1, "右手往前伸直，手心朝下", "Right arm straight out in front, palm down"],
      [2, 2, "左手也往前伸，手心朝下", "Left arm out too, palm down"],
      [3, 3, "右手翻过来，手心朝上", "Turn your right palm up"],
      [4, 4, "左手翻过来，手心朝上", "Turn your left palm up"],
      [5, 5, "右手搭到左肩上", "Right hand onto your left shoulder"],
      [6, 6, "左手搭到右肩上，两手交叉", "Left hand onto your right shoulder, arms crossed"],
      [7, 7, "右手放到脑后", "Right hand behind your head"],
      [8, 8, "左手也放到脑后", "Left hand behind your head too"],
    ],
    tip: ["一拍一个动作，手到位就停住，干脆利落", "One move a beat: get there and stop, crisp"],
  },
  "macarena-hips": {
    ready: ["接着手臂那 8 拍，手从脑后下来", "Straight on from the arms, hands coming down from your head"],
    counts: [
      [1, 1, "右手放到左边胯前", "Right hand to the front of your left hip"],
      [2, 2, "左手放到右边胯前，两手交叉", "Left hand to the front of your right hip, crossed"],
      [3, 3, "右手放到右边屁股后兜", "Right hand to your right back pocket"],
      [4, 4, "左手放到左边后兜", "Left hand to your left back pocket"],
      [5, 7, "手放在后兜，胯绕圈扭三下", "Hands on your back pockets, roll your hips round three times"],
      [8, 8, "拍手，跳起来往左转 90 度：「嘿！」", "Clap, jump and turn a quarter to your left: 'Hey!'"],
    ],
    tip: ["转过去就对着新的方向从头再跳；老师会转回来面对大家", "After the turn you face a new way and start again from the top; the coach turns back to face you"],
  },
  // 科目三 (一笑江湖): 拐 is an ankle rolled out, no weight on it; 摇花手 is the wrists flipping
  "kms-bow": {
    ready: ["双脚并拢站直", "Feet together, stand tall"],
    counts: [
      [1, 2, "右手握拳，左手掌包住拳头，放在胸前", "Make a fist with your right hand and wrap your left palm round it, in front of your chest"],
      [3, 5, "弯腰鞠一躬", "Bow"],
      [6, 8, "慢慢起来", "Come back up, slowly"],
    ],
    tip: ["像武侠片里抱拳行礼，开场和结尾各一次", "A kung fu salute: once at the start, once at the end"],
  },
  "kms-swing": {
    ready: ["双脚分开一点，膝盖放松，双手松松地放在胸前", "Feet a little apart, knees soft, hands loose in front of your chest"],
    counts: [
      [1, 1, "双手一起往右摆，同时右脚踝往外一拐（脚外侧点地，膝盖跟着出去）", "Both hands swing right as your right ankle rolls out (the outside of the foot touches down, the knee goes out with it)"],
      [2, 2, "手腕翻一下，脚收回来", "Flip your wrists, foot back in"],
      [3, 3, "双手往左摆，左脚踝往外拐", "Hands swing left, left ankle rolls out"],
      [4, 4, "收回来", "Back in"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["拐的那只脚不要踩实，只是轻轻点一下；手腕一直翻（摇花手）", "Don't put weight on the rolled foot, just tip it; keep the wrists flipping (the twirling hands)"],
  },
  "kms-roll-throw": {
    ready: ["双脚分开，双手放在胸前", "Feet apart, hands in front of your chest"],
    counts: [
      [1, 4, "两只手在胸前互相绕圈，绕两圈", "Roll your hands round each other in front of your chest, twice"],
      [5, 5, "双手一起往右甩出去，右脚踝一拐", "Throw both hands out to the right, right ankle rolling out"],
      [6, 8, "停住，再慢慢收回来", "Hold it, then bring them back"],
    ],
  },
  "kms-guai": {
    ready: ["双手松松地垂在身体前面", "Hands hanging loose in front of you"],
    counts: [
      [1, 1, "右脚踝往外拐，膝盖跟着出去", "Roll your right ankle out, the knee going out with it"],
      [2, 2, "收回来", "Back"],
      [3, 3, "左脚踝往外拐", "Roll your left ankle out"],
      [4, 4, "收回来", "Back"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["只用脚外侧轻轻点地，不压上去；膝盖一甩一甩的就对了", "Only tip the outside of the foot, no weight on it: the knees swinging out is the look"],
  },
  "kms-open-up": {
    ready: ["双手往两边打开，和肩一样高", "Arms open out to the sides, at shoulder height"],
    counts: [
      [1, 1, "右脚拐", "Right ankle rolls out"],
      [2, 2, "收", "Back"],
      [3, 3, "左脚拐", "Left ankle"],
      [4, 4, "收", "Back"],
      [5, 5, "双手举过头顶摇花手，右脚交叉到左脚前面拐一下", "Hands up over your head, twirling; the right foot crosses in front of the left and rolls out"],
      [6, 6, "收", "Back"],
      [7, 7, "左脚交叉到右脚前面拐一下", "The left foot crosses in front of the right and rolls out"],
      [8, 8, "收", "Back"],
    ],
  },
  "kms-open-guai": {
    ready: ["双手往两边打开，不动", "Arms open out to the sides, held still"],
    counts: [
      [1, 1, "右脚拐", "Right ankle out"],
      [2, 2, "收", "Back"],
      [3, 3, "左脚拐", "Left ankle out"],
      [4, 4, "收", "Back"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  "kms-cross": {
    ready: ["双脚分开一点", "Feet a little apart"],
    counts: [
      [1, 1, "两只小臂在胸前交叉成 X，右脚拐", "Cross your forearms in an X at your chest, right ankle out"],
      [2, 2, "双手往两边打开", "Open your arms out"],
      [3, 3, "交叉，左脚拐", "Cross, left ankle out"],
      [4, 4, "打开", "Open"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  "kms-xiao": {
    ready: ["双脚分开一点", "Feet a little apart"],
    counts: [
      [1, 4, "交叉、打开、交叉、打开（和上一个动作一样）", "Cross, open, cross, open (as in the move before)"],
      [5, 5, "右手举到右上方，右脚拐", "Right hand up high on the right, right ankle out"],
      [6, 6, "右手从上往下斜着削到左下方", "Sweep the right hand down across you to the lower left"],
      [7, 7, "左手举到左上方，左脚拐", "Left hand up high on the left, left ankle out"],
      [8, 8, "左手削到右下方", "Sweep the left hand down to the lower right"],
    ],
  },
  "kms-slow-xiao": {
    ready: ["和销手一样，只是慢下来", "Like the sweeps, slowed down"],
    counts: [
      [1, 4, "左脚拐住，右手从右上方慢慢削下来", "Left ankle rolled out and held, the right hand sweeps slowly down from the upper right"],
      [5, 8, "换右脚拐，左手慢慢削", "Now the right ankle, the left hand sweeping slowly"],
    ],
  },
  "kemusan-hand-twirl": {
    ready: ["双脚分开，膝盖放松", "Feet apart, knees soft"],
    counts: [
      [1, 2, "身体转向左边，双手在左边身前互相绕圈，一拍一圈，脚轻轻往外踢", "Turn to your left: roll your hands round each other on that side, once a beat, flicking a foot out"],
      [3, 4, "转到右边绕", "Over to the right"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["手要松，像在搓一个看不见的球", "Keep the hands loose, as if rolling an invisible ball"],
  },
  // 最炫民族风: the square dance
  "zx-swing": {
    ready: ["双脚分开比肩宽，双手握拳放在胸前", "Feet wider than your shoulders, fists in front of your chest"],
    counts: [
      [1, 2, "重心移到左脚，两个拳头一起甩向左边，身体跟着转一点", "Weight onto your left foot, both fists swing over to the left, body turning with them"],
      [3, 4, "重心移到右脚，拳头甩向右边", "Weight onto the right, fists swing to the right"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  "zx-raise": {
    ready: ["双手握拳放在胸前", "Fists in front of your chest"],
    counts: [
      [1, 1, "右脚往右迈一步，双手直直举过头顶", "Step out to the right, both arms straight up"],
      [2, 2, "收回来，拳头放回胸前", "Back in, fists back to your chest"],
      [3, 3, "左脚往左迈，双手举高", "Step out to the left, arms up"],
      [4, 4, "收回来", "Back in"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  "zx-push-walk": {
    ready: ["双手握拳放在胸前", "Fists in front of your chest"],
    counts: [
      [1, 1, "右脚往前走，双手往前推出去，手心朝下", "Step forward on the right, push both hands out in front, palms down"],
      [2, 2, "左脚往前，手收回胸前", "Left foot forward, hands back to your chest"],
      [3, 3, "右脚往前，再推", "Right foot forward, push again"],
      [4, 4, "左脚并上", "Bring your left foot in"],
      [5, 7, "往后退三步，手照样一推一收", "Walk back three steps, pushing and pulling the same way"],
      [8, 8, "并脚", "Feet together"],
    ],
  },
  "zx-oath": {
    ready: ["双手握拳放在胸前", "Fists in front of your chest"],
    counts: [
      [1, 1, "右脚往右迈一步，右拳举到右边太阳穴旁（手肘和肩一样高），左手叉腰", "Step right, right fist up by your right temple (elbow at shoulder height), left hand on your hip"],
      [2, 2, "收回，双拳放胸前", "Back in, fists at your chest"],
      [3, 3, "左脚往左，左拳举到左边太阳穴，右手叉腰", "Step left, left fist by your left temple, right hand on your hip"],
      [4, 4, "收回", "Back in"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  "zx-travel-clap": {
    ready: ["双手往两边打开", "Arms open to the sides"],
    counts: [
      [1, 1, "左脚往左迈", "Step left"],
      [2, 2, "右脚并过去", "Right foot closes in"],
      [3, 3, "左脚再往左迈", "Left again"],
      [4, 4, "右脚并过去，拍手", "Right closes in: clap"],
      [5, 5, "小跳往右回来，在右肩上方拍手", "A little hop back to the right, clap over your right shoulder"],
      [6, 6, "双手打开", "Arms open"],
      [7, 7, "再小跳，在左肩上方拍手", "Hop again, clap over your left shoulder"],
      [8, 8, "回到中间", "Back to the middle"],
    ],
  },
  "zx-flower": {
    ready: ["双手掌心朝上捧在胸前，像捧着一朵花", "Palms up, cupped in front of your chest, as if holding a flower"],
    counts: [
      [1, 1, "右脚往右前方迈一步", "Step to the front right"],
      [2, 2, "双手捧着往前上方送出去，头微微歪", "Offer your cupped hands up and forward, head tilted a little"],
      [3, 4, "手收回胸前，脚收回", "Hands back to your chest, foot back"],
      [5, 5, "左脚往左前方迈一步", "Step to the front left"],
      [6, 6, "送出去", "Offer"],
      [7, 8, "收回", "Back"],
    ],
  },
  "zx-reach-pull": {
    ready: ["双脚并拢", "Feet together"],
    counts: [
      [1, 2, "右脚往前一步，双手往前平伸，手心朝上", "Step forward on the right, both arms reaching out in front, palms up"],
      [3, 4, "握拳收回到腰边，脚收回", "Fists pull back to your waist, foot back"],
      [5, 8, "换左脚，同样", "The same with the left foot"],
    ],
  },
  "zx-wave-high": {
    ready: ["双手举过头顶成 V 字", "Arms up over your head in a V"],
    counts: [
      [1, 1, "右脚往右迈", "Step right"],
      [2, 2, "左脚并过去，双手跟着往右摆", "Left foot closes in, arms swaying right"],
      [3, 3, "往左迈", "Step left"],
      [4, 4, "并脚，双手往左摆", "Close in, arms swaying left"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["手腕每拍抖一下，越高越好", "Flick your wrists on every beat, as high as you can"],
  },
  "zx-pose": {
    ready: ["最后一个动作", "The last move"],
    counts: [
      [1, 1, "右手直直举上去，左手往前平伸，右脚尖点在前面", "Right arm straight up, left arm straight out in front, right toes pointed in front"],
      [2, 8, "定住！", "Hold it!"],
    ],
  },
  // 爱你
  "aini-wings": {
    ready: ["双手往两边斜下方打开，手心朝下，像一对小翅膀", "Arms out and down at your sides, palms down, like little wings"],
    counts: [
      [1, 2, "膝盖跟着拍子弹，身体往右晃，头往右歪", "Bounce your knees on the beat, sway right, head tilting right"],
      [3, 4, "往左晃，头往左歪", "Sway left, head tilting left"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["手腕一拍一下轻轻扇，笑着跳", "Flap your wrists gently on every beat, and smile"],
  },
  "aini-jianzi": {
    ready: ["双手像翅膀一样打开", "Arms out like wings"],
    counts: [
      [1, 1, "右脚从里面往上踢，脚心朝上，踢到左膝前面，像踢毽子", "Kick your right foot up on the inside, sole up, in front of your left knee, like kicking a shuttlecock"],
      [2, 2, "左脚往上踢到右膝前面", "Left foot up in front of your right knee"],
      [3, 8, "右、左轮流，一拍一下", "Right, left in turn, one a beat"],
    ],
  },
  "aini-skip-turn": {
    ready: ["左手叉腰", "Left hand on your waist"],
    counts: [
      [1, 4, "右手在头上画半圈，小跳着原地转一圈", "Your right hand draws a half circle over your head as you skip round in a full circle"],
      [5, 5, "双手叉腰，扭向右", "Both hands on your waist, twist right"],
      [6, 6, "扭向左", "Twist left"],
      [7, 7, "右", "Right"],
      [8, 8, "左", "Left"],
    ],
  },
  "aini-heart": {
    ready: ["双手在下巴前比一个心", "Make a heart with your hands in front of your chin"],
    counts: [
      [1, 2, "身体往右歪，头往右", "Lean right, head right"],
      [3, 4, "往左歪", "Lean left"],
      [5, 8, "同 1-4", "Same again"],
    ],
    tip: ["笑一个！", "Smile!"],
  },
  "heel-tap": {
    ready: ["双手叉腰，站直", "Hands on your hips, stand tall"],
    counts: [
      [1, 1, "右脚跟往前点地，脚尖勾起来", "Tap your right heel forward, toes up"],
      [2, 2, "收回来", "Back"],
      [3, 3, "左脚跟往前点", "Left heel forward"],
      [4, 4, "收回来", "Back"],
      [5, 8, "同 1-4", "Same again"],
    ],
  },
  // APT.
  "apt-stack": {
    ready: ["双手握拳，放在肚子前面", "Fists in front of your stomach"],
    counts: [
      [1, 1, "右拳放到左拳上面", "Right fist on top of the left"],
      [2, 2, "左拳拿到右拳上面", "Left fist up on top of the right"],
      [3, 3, "右拳再到上面", "Right on top again"],
      [4, 4, "左", "Left"],
      [5, 5, "右", "Right"],
      [6, 6, "左，叠到下巴", "Left, up to your chin"],
      [7, 7, "停住，点点头", "Hold, nodding"],
      [8, 8, "双手放回下面", "Both back down"],
    ],
    tip: ["就是韩国的「아파트」游戏：拳头一层层往上叠，跟着歌喊「APT!」", "It's the Korean 'apartment' game: stack your fists floor by floor as the song chants 'APT!'"],
  },
  "apt-drum": {
    ready: ["双脚分开，膝盖放松", "Feet apart, knees soft"],
    counts: [
      [1, 6, "两手轮流拍大腿，像打鼓：右、左、右、左、右、左", "Drum on your thighs: right, left, right, left, right, left"],
      [7, 7, "拍手", "Clap"],
      [8, 8, "右手举高，左手叉腰", "Right hand up high, left hand on your hip"],
    ],
  },
  "apt-rlr-clap": {
    ready: ["身体稍微转向右边", "Turn a little to your right"],
    counts: [
      [1, 1, "右手举起来", "Right hand up"],
      [2, 2, "换左手举起来", "Now the left hand up"],
      [3, 3, "右手再举", "Right up again"],
      [4, 4, "拍手，左脚轻轻抬一下", "Clap, lifting your left foot a little"],
      [5, 8, "转向左边：左、右、左、拍手", "Turn to your left: left, right, left, clap"],
    ],
  },
  "apt-climb": {
    ready: ["双手放在胸前", "Hands in front of your chest"],
    counts: [
      [1, 4, "左右小步，双手一节一节往上爬：右、左、右、左，像爬梯子", "Small steps side to side as your hands climb hand over hand, right, left, right, left, like up a ladder"],
      [5, 8, "双手张开，抬头，点点头", "Open your arms wide, look up, nod along"],
    ],
  },
  "apt-headphones": {
    ready: ["双脚并拢", "Feet together"],
    counts: [
      [1, 1, "往右一步，右手往右伸出去", "Step right, reaching your right hand out"],
      [2, 2, "收回来", "Back"],
      [3, 3, "往左一步，左手伸出去", "Step left, left hand out"],
      [4, 4, "收回来", "Back"],
      [5, 5, "在右边拍一下手", "Clap over on your right"],
      [6, 8, "双手放到耳朵边，像戴着耳机，左右晃", "Hands over your ears like headphones, swaying side to side"],
    ],
  },

  // Cupid Shuffle (the line dance everyone does to it: 32 counts, then again facing the next wall)
  "cupid-right": {
    ready: ["双脚并拢站直，膝盖放松，双手松松地放在腰前，跟着音乐轻轻晃", "Feet together, knees soft, hands loose in front of your waist, swaying a little to the music"],
    counts: [
      [1, 2, "右脚往右跨一小步，左脚跟过去，并在右脚旁边", "Step your right foot out to the right, then bring the left foot in beside it"],
      [3, 4, "再来一次：右脚往右，左脚并过去", "Again: right foot out, left foot in"],
      [5, 6, "第三次：右、并", "A third time: right, together"],
      [7, 8, "第四次：右脚往右；左脚这次只点一下地，别踩实（下一拍它要往左走）", "A fourth time: right foot out; the left only touches the floor this time, no weight on it (it leads off to the left next)"],
    ],
    tip: ["歌里喊「To the right, to the right…」就是这里：一共往右走四步，肩膀跟着一耸一耸", "It's the 'to the right, to the right…' part: four steps to the right in all, your shoulders bouncing with them"],
  },
  "cupid-left": {
    ready: ["接着上一个动作，左脚是空的", "Straight on from the last move, your left foot free"],
    counts: [
      [1, 2, "左脚往左跨一小步，右脚跟过去并拢", "Step your left foot out to the left, then bring the right in beside it"],
      [3, 4, "再来：左脚往左，右脚并过去", "Again: left foot out, right foot in"],
      [5, 6, "第三次：左、并", "A third time: left, together"],
      [7, 8, "第四次：左脚往左，右脚并过来踩实；这时你正好回到原来的位置", "A fourth time: left foot out, right foot in with your weight on it; you're back where you started"],
    ],
    tip: ["「To the left, to the left…」：往左走四步，回到原位", "'To the left, to the left…': four steps to the left, back to your spot"],
  },
  "cupid-kick": {
    ready: ["双脚并拢，重心放在左脚上", "Feet together, your weight on the left foot"],
    counts: [
      [1, 1, "右脚往前踢出去，离地一小段就好，脚尖微微翘起", "Kick your right foot forward, just a little off the floor, toes up a bit"],
      [2, 2, "右脚收回来，踩在左脚旁边", "Bring the right foot back and put it down by the left"],
      [3, 3, "左脚往前踢", "Kick the left foot forward"],
      [4, 4, "左脚收回来，踩下", "Bring it back down"],
      [5, 8, "再来一遍：右踢、收，左踢、收", "Once more: right kick, back, left kick, back"],
    ],
    tip: ["歌里喊「Now kick」就是这里；踢的时候上身稍微往后靠，站得更稳", "It's 'now kick'; lean back a little as you kick and you'll keep your balance"],
  },
  "cupid-walk": {
    ready: ["双脚分开一点，手臂放松，准备原地走", "Feet a little apart, arms relaxed, ready to walk on the spot"],
    counts: [
      [1, 2, "原地走：右脚、左脚，同时身体开始往左转", "Walk on the spot: right, left, and start turning to your left"],
      [3, 4, "右、左，接着往左转", "Right, left, still turning left"],
      [5, 6, "右、左，快转够四分之一圈了", "Right, left, nearly a quarter of the way round"],
      [7, 8, "右、左：现在你面对原来左手边的那面墙，站好", "Right, left: now you face the wall that was on your left; stand ready"],
    ],
    tip: ["歌里喊「Now walk it by yourself」就是这里：边走边转，胯扭起来，手随意摆。转完以后对着新的方向接着「向右走」；教练会转回来面对你", "It's 'now walk it by yourself': walk and turn, swing your hips, let your arms go. Then start 'to the right' again facing the new wall; the coach turns back to face you"],
  },

  // Cha-Cha Slide: each move is what its call says, counted from the call (1 is the call's first beat)
  "cha-left": {
    ready: ["双脚并拢，膝盖放松", "Feet together, knees soft"],
    counts: [
      [1, 1, "听到「To the left」：左脚往左跨一大步", "On 'to the left': a big step to the left with your left foot"],
      [2, 2, "右脚贴着地面拖过去，并到左脚旁边，身体移到左边", "Drag your right foot in along the floor to meet the left; your body is over on the left now"],
      [3, 8, "站住，等下一句口令", "Hold there for the next call"],
    ],
    tip: ["像在冰上滑一下：脚贴着地，不用抬高", "Like sliding on ice: keep the foot on the floor, no need to lift it"],
  },
  "cha-right": {
    ready: ["双脚并拢，膝盖放松", "Feet together, knees soft"],
    counts: [
      [1, 1, "听到「To the right」：右脚往右跨一大步", "On 'to the right': a big step to the right with your right foot"],
      [2, 2, "左脚贴着地拖过去并拢", "Drag your left foot in along the floor"],
      [3, 8, "站住，等下一句", "Hold for the next call"],
    ],
  },
  "cha-back": {
    ready: ["站直，看着前面", "Stand tall, looking ahead"],
    counts: [
      [1, 1, "听到「Take it back now y'all」：右脚往后退一步", "On 'take it back now y'all': step back with your right foot"],
      [2, 2, "左脚往后退", "Left foot back"],
      [3, 3, "右脚往后退", "Right foot back"],
      [4, 4, "左脚往后，踩在右脚旁边，站稳", "Left foot back beside the right, and steady"],
      [5, 8, "站住，准备往前跳", "Hold, ready to hop forward"],
    ],
    tip: ["步子小一点，别撞到后面的人；手臂跟着前后摆", "Small steps, mind the people behind you; your arms swing along"],
  },
  "cha-hop": {
    ready: ["双脚并拢，膝盖微弯", "Feet together, knees a little bent"],
    counts: [
      [1, 1, "听到「One hop this time」：双脚一起往前跳一下", "On 'one hop this time': jump forward once, both feet together"],
      [2, 2, "落地时膝盖弯一下，轻轻落", "Land softly, bending your knees"],
      [3, 8, "站住，等下一句", "Hold for the next call"],
    ],
  },
  "cha-hop2": {
    ready: ["双脚并拢，膝盖微弯", "Feet together, knees a little bent"],
    counts: [
      [1, 1, "听到「Two hops this time」：往前跳一下", "On 'two hops this time': a hop forward"],
      [2, 2, "再跳一下", "And another"],
      [3, 8, "落稳，站住", "Land soft and hold"],
    ],
  },
  "cha-hops": {
    ready: ["双脚并拢，膝盖微弯", "Feet together, knees a little bent"],
    counts: [[1, 8, "「Five hops」「Hop it out」：双脚一起，一拍跳一下，一直跳到下一句口令", "'Five hops', 'hop it out': both feet together, a hop on every beat until the next call"]],
    tip: ["跳得低一点、轻一点，更省力", "Keep the hops low and light: it saves your legs"],
  },
  "cha-stomp-r": {
    ready: ["双手握拳放在身前，双脚分开一点", "Fists in front of you, feet a little apart"],
    counts: [
      [1, 1, "听到「Right foot let's stomp」：右膝抬起来，右脚用力跺下去，拳头跟着往下一压", "On 'right foot let's stomp': lift your right knee and stamp the foot down hard, fists pumping down with it"],
      [2, 8, "站住，等下一句", "Hold for the next call"],
    ],
  },
  "cha-stomp-l": {
    ready: ["双手握拳放在身前，双脚分开一点", "Fists in front of you, feet a little apart"],
    counts: [
      [1, 1, "听到「Left foot let's stomp」：左膝抬起来，左脚用力跺下去", "On 'left foot let's stomp': lift your left knee and stamp the foot down hard"],
      [2, 8, "站住，等下一句", "Hold for the next call"],
    ],
  },
  "cha-stomp2-r": {
    ready: ["双手握拳放在身前", "Fists in front of you"],
    counts: [
      [1, 1, "听到「Right foot two stomps」：右脚跺一下", "On 'right foot two stomps': stamp your right foot"],
      [2, 2, "再跺一下", "And again"],
      [3, 8, "站住", "Hold"],
    ],
  },
  "cha-stomp2-l": {
    ready: ["双手握拳放在身前", "Fists in front of you"],
    counts: [
      [1, 1, "听到「Left foot two stomps」：左脚跺一下", "On 'left foot two stomps': stamp your left foot"],
      [2, 2, "再跺一下", "And again"],
      [3, 8, "站住", "Hold"],
    ],
  },
  "cha-cha": {
    ready: ["膝盖放松，双臂弯起来放在身体两边，手肘朝外", "Knees soft, arms bent at your sides, elbows out"],
    counts: [
      [1, 1, "听到「Cha cha real smooth」：右脚往前踩一小步，重心跟过去", "On 'cha cha real smooth': a small step forward on your right foot, weight onto it"],
      [2, 2, "重心退回左脚", "Weight back onto the left"],
      [3, 4, "原地小碎步「恰、恰、恰」：右、左、右，胯跟着扭", "Little steps on the spot, 'cha-cha-cha': right, left, right, the hips swinging"],
      [5, 5, "左脚往前踩一小步", "A small step forward on your left"],
      [6, 6, "重心退回右脚", "Weight back onto the right"],
      [7, 8, "「恰、恰、恰」：左、右、左", "'Cha-cha-cha': left, right, left"],
    ],
    tip: ["记住节奏「一、二、恰恰恰」；跳不准也没关系，扭起来就对了", "The rhythm is 'one, two, cha-cha-cha'; never mind being exact, just get those hips going"],
  },
  "cha-turn": {
    ready: ["双脚分开一点", "Feet a little apart"],
    counts: [
      [1, 2, "听到「Turn it out」：原地踩小步，往左转四分之一圈", "On 'turn it out': little steps on the spot, turning a quarter to your left"],
      [3, 8, "现在面对原来左手边的那面墙，接着跳；教练会转回来面对你", "Now you face the wall that was on your left: carry on that way; the coach turns back to face you"],
    ],
  },
  "cha-criss": {
    ready: ["双脚分开和肩一样宽", "Feet as wide as your shoulders"],
    counts: [
      [1, 1, "听到「Criss cross」：跳起来，落地时双脚交叉，右脚在前", "On 'criss cross': jump and land with your feet crossed, the right in front"],
      [2, 2, "再跳起来，落地时双脚分开", "Jump again and land with them apart"],
      [3, 8, "站住，等下一句", "Hold for the next call"],
    ],
    tip: ["双手跟着脚：交叉时手也在胸前交叉，分开时手也张开", "Your arms copy your feet: crossed in front when they cross, open when they open"],
  },
  "cha-knees": {
    ready: ["双脚分开站，弯腰，双手放在膝盖上", "Feet apart, bend over, hands on your knees"],
    counts: [
      [1, 1, "听到「Hands on your knees」：膝盖往里收", "On 'hands on your knees': knees in"],
      [2, 2, "膝盖往外打开", "Knees out"],
      [3, 8, "一拍一下，里、外、里、外，手一直扶着膝盖", "In, out, in, out, a beat each, your hands staying on your knees"],
    ],
  },
  "cha-funky": {
    ready: ["双脚分开，手握拳放松", "Feet apart, loose fists"],
    counts: [[1, 8, "随便扭！胸口往前送、往后收，肩膀一高一低地抖，跟着音乐来", "Anything goes! Push your chest forward and back, shake your shoulders up and down, ride the music"]],
    tip: ["这里没有对错：听到「Get funky」「Come on」「Oh yeah」就放开跳", "No wrong moves here: on 'get funky', 'come on', 'oh yeah', just let loose"],
  },
  "cha-clap": {
    ready: ["双脚并拢，双手放在胸前", "Feet together, hands in front of your chest"],
    counts: [
      [1, 1, "右脚往右一步，拍手", "Step right and clap"],
      [2, 2, "左脚往左一步，拍手", "Step left and clap"],
      [3, 8, "左右左右，一拍拍一下", "Right, left, right, left, a clap on every beat"],
    ],
    tip: ["「Everybody clap your hands」：跟着大家一起拍", "'Everybody clap your hands': clap along with everyone"],
  },
  "cha-freeze": {
    ready: ["随时准备", "Be ready"],
    counts: [[1, 8, "听到「Freeze」：马上定住，双手举起来，一动不动，等音乐回来", "On 'freeze': stop dead, hands up, don't move a muscle until the music's back"]],
    tip: ["谁先动谁就输了", "The first to move loses"],
  },
  "cha-low": {
    ready: ["双脚分开比肩宽，脚尖朝外", "Feet wider than your shoulders, toes turned out"],
    counts: [[1, 8, "「How low can you go」：膝盖往外打开，一拍比一拍蹲得低，手在身前左右摆；能蹲多低蹲多低", "'How low can you go': knees out, a little lower on every beat, hands swinging in front of you; as low as you can"]],
    tip: ["膝盖跟脚尖一个方向；蹲不下去就停在舒服的高度", "Keep your knees over your toes; if you can't go lower, stay where it's comfortable"],
  },
  "cha-top": {
    ready: ["从蹲着的地方开始", "From down low"],
    counts: [[1, 8, "「Bring it to the top」：慢慢站起来，双手一点点往上举，最后踮起脚，手举到最高挥一挥", "'Bring it to the top': come up slowly, your hands rising with you, until you're on your toes waving them up high"]],
  },
  "cha-reverse": {
    ready: ["双脚并拢，膝盖微弯", "Feet together, knees a little bent"],
    counts: [
      [1, 1, "听到「Reverse」：跳起来，在空中往左转半圈", "On 'reverse': jump, turning halfway round to the left in the air"],
      [2, 8, "落地面向后面；再听到「Reverse」就再转回来", "Land facing the back; on the next 'reverse', turn back again"],
    ],
  },
  "cha-charlie": {
    ready: ["双脚并拢，手臂放松", "Feet together, arms loose"],
    counts: [
      [1, 1, "听到「Charlie Brown」：右脚往前踩一步", "On 'Charlie Brown': step forward on your right foot"],
      [2, 2, "左脚往前踢起来", "Kick your left foot forward"],
      [3, 3, "左脚往后踩回来", "Step back onto the left"],
      [4, 4, "右脚往后点一下地", "Touch your right foot behind"],
      [5, 8, "再来：往前踩、踢，往后踩、点，手臂跟着前后摆", "Again: forward, kick, back, touch, your arms swinging forward and back"],
    ],
    tip: ["像摇摇椅一样前后摇", "Rock forward and back like a rocking chair"],
  },

  // Y.M.C.A. (the letters the crowds have made with their arms since 1979)
  "ymca-groove": {
    ready: ["双脚并拢，双手放在胸前，准备拍手", "Feet together, hands in front of your chest, ready to clap"],
    counts: [
      [1, 1, "右脚往右跨一步", "Step out to the right"],
      [2, 2, "左脚并过去点地，同时拍手", "Bring the left foot in with a tap, and clap"],
      [3, 3, "左脚往左跨一步", "Step out to the left"],
      [4, 4, "右脚并过去点地，拍手", "Right foot in with a tap, clap"],
      [5, 8, "再来一遍：右、拍，左、拍", "Again: right, clap, left, clap"],
    ],
    tip: ["跟着鼓点左右摇，笑起来", "Sway with the drums, and smile"],
  },
  "ymca-pump": {
    ready: ["双手握拳放在肩膀前", "Fists up by your shoulders"],
    counts: [
      [1, 1, "右脚往右一步，右拳往天上打", "Step right and punch your right fist up to the sky"],
      [2, 2, "左脚并过去，右拳收回肩膀", "Left foot in, right fist back to your shoulder"],
      [3, 3, "左脚往左一步，左拳往天上打", "Step left and punch your left fist up"],
      [4, 4, "右脚并过去，左拳收回", "Right foot in, left fist back"],
      [5, 8, "再来一遍：右拳、收，左拳、收", "Again: right up, back, left up, back"],
    ],
  },
  "ymca-letters": {
    ready: ["站稳，双脚分开和肩一样宽", "Stand steady, feet as wide as your shoulders"],
    counts: [
      [1, 1, "Y：双臂伸直往上斜着举，张成 V 字", "Y: both arms straight up and out in a V"],
      [2, 2, "M：双手指尖放到头顶，手肘往两边张开", "M: fingertips on top of your head, elbows out to the sides"],
      [3, 3, "C：双臂一起弯到左边，上面一只、下面一只，像个半圆；身体往左歪", "C: both arms curved over to your left, one above, one below, like half a circle; lean left"],
      [4, 4, "A：双手在头顶合起来，手肘张开，像个尖屋顶", "A: hands together over your head, elbows out, like a pointed roof"],
      [5, 8, "左右踏步拍手，等下一次「Y-M-C-A」", "Step side to side and clap, till the next 'Y-M-C-A'"],
    ],
    tip: ["歌里唱「Y、M、C、A」的时候，一个字母一拍；全场一起比，最好看", "One letter a beat as the song sings them; best with the whole room doing it together"],
  },

  // Watch Me (Whip/Nae Nae): each dance the song calls, as its video's dancers do it
  "wm-watch": {
    ready: ["双脚分开和肩一样宽，膝盖放松", "Feet as wide as your shoulders, knees soft"],
    counts: [
      [1, 2, "双手食指指着自己的眼睛（「Watch me」：看我）", "Point both index fingers at your eyes ('watch me')"],
      [3, 4, "双手往前指向大家", "Point both hands out at everyone"],
      [5, 8, "双手握拳放胸前，肩膀一拍一边地往上弹", "Fists at your chest, bounce your shoulders up, one side a beat"],
    ],
  },
  "wm-whip": {
    ready: ["双手握拳放在胸前，双脚分开", "Fists at your chest, feet apart"],
    counts: [
      [1, 2, "膝盖跟着拍子弹两下（「Now watch me」）", "Bounce your knees twice ('now watch me')"],
      [3, 3, "Whip：右脚往前一点、膝盖弯，身体往后靠，右手往前一甩伸直，手心朝下，像甩方向盘", "Whip: right foot a little forward with the knee bent, lean back, and throw your right arm straight out in front, palm down, like whipping a steering wheel"],
      [4, 4, "保持住，摆个酷的表情", "Hold it, with your coolest face"],
      [5, 8, "Nae Nae：右手举过头顶，一拍往右一拍往左地挥，身体跟着摇，左手放在肚子前", "Nae nae: right hand up over your head, waving right then left a beat each, body swaying with it, left hand by your stomach"],
    ],
    tip: ["屏幕上出现「WHIP」「NAE NAE」的字时就是这两个动作", "When the video shows 'WHIP' and 'NAE NAE', these are the moves"],
  },
  "wm-whip2": {
    ready: ["双手握拳放在胸前，双脚分开", "Fists at your chest, feet apart"],
    counts: [
      [1, 1, "Whip：右手往前一甩，身体往后靠", "Whip: throw the right arm out, leaning back"],
      [2, 2, "收回来", "Back in"],
      [3, 3, "再 Whip 一次", "Whip again"],
      [4, 4, "保持住", "Hold it"],
      [5, 8, "Nae Nae：右手举高左右挥，身体跟着摇", "Nae nae: right hand up high, waving side to side, body swaying"],
    ],
    tip: ["歌里唱「Now watch me whip, whip」就是这两下", "It's the 'now watch me whip, whip' line"],
  },
  "wm-stanky": {
    ready: ["双脚分开，膝盖弯一点，双臂往两边张开放低", "Feet apart, knees a little bent, arms out low at your sides"],
    counts: [
      [1, 1, "右膝往里扣，脚跟往外转", "Right knee in, heel turning out"],
      [2, 2, "右膝往外转回来", "Right knee rolls back out"],
      [3, 4, "再来一次：扣进去、转出来，膝盖像在画圈", "Again: in and out, the knee drawing circles"],
      [5, 8, "换左腿：左膝扣进去、转出来，两次", "Now the left: knee in, then out, twice"],
    ],
    tip: ["「Do the stanky leg」：只动一条腿，另一条腿站稳", "'Do the stanky leg': only one leg moves; the other stands firm"],
  },
  "wm-break": {
    ready: ["双脚分开和肩一样宽，膝盖弯一点", "Feet as wide as your shoulders, knees a little bent"],
    counts: [
      [1, 1, "双膝往里扣，脚跟往外踢，身体往右一点", "Knees knock in, heels kick out, body a little to the right"],
      [2, 2, "双脚放平", "Feet flat again"],
      [3, 3, "再扣一次，身体往左", "Knock them in again, body to the left"],
      [4, 4, "放平", "Flat"],
      [5, 8, "一样再来：扣、平、扣、平", "The same again: in, flat, in, flat"],
    ],
    tip: ["「Break your legs」：动作快，脚踩稳，别真的扭到", "'Break your legs': quick, but keep your feet planted; don't really twist anything"],
  },
  "wm-bop": {
    ready: ["踮起脚尖，膝盖放松", "Up on your toes, knees soft"],
    counts: [
      [1, 4, "一拍弹一下，双手在身前一前一后地划，像划船；同时往左边挪几小步", "Bounce on every beat, your hands rowing in front, one forward, one back; take a few small steps over to the left"],
      [5, 8, "接着弹、接着划，挪回原来的位置", "Keep bouncing and rowing, back to where you were"],
    ],
    tip: ["「Bop, bop… to the left」：轻快地弹，像在跳绳", "'Bop, bop… to the left': light and quick, like skipping rope"],
  },
  "wm-yule": {
    ready: ["双脚分开，身体稍微往后靠", "Feet apart, leaning back a little"],
    counts: [
      [1, 4, "Yule：拳头在胯边一前一后地转，像摇手柄，一拍换一边", "Yule: crank your fists by your hips, one forward, one back, swapping on every beat"],
      [5, 5, "超人：轻轻跳起来", "Superman: a little jump"],
      [6, 8, "落地时双手往前伸直，身体往前倾，左腿往后踢起来，像在飞，保持住", "Land with both arms straight out in front, leaning forward, left leg kicked up behind you, flying; hold it"],
    ],
    tip: ["「Now watch me yule」「Now watch me Superman」两句各四拍", "'Now watch me yule' and 'now watch me Superman': four beats each"],
  },
  "wm-duff": {
    ready: ["双手张开，掌心朝前，放在脸的两边", "Hands open, palms forward, either side of your face"],
    counts: [
      [1, 1, "胯往右顶，身体弹一下", "Pop your hips to the right with a bounce"],
      [2, 2, "胯往左顶", "Hips to the left"],
      [3, 8, "右、左、右、左……一拍一下，手一直放在脸边", "Right, left, right, left… a beat each, hands staying by your face"],
    ],
  },
  // The Ketchup Song (Aserejé): Las Ketchup's chorus hands
  "ketchup-sway": {
    ready: ["双脚并拢，双手放在胸前", "Feet together, hands in front of your chest"],
    counts: [
      [1, 1, "右脚往右一步，胯跟着往右摆", "Step right, hips swinging right"],
      [2, 2, "左脚并过去，轻轻拍一下手", "Left foot in, a soft clap"],
      [3, 3, "左脚往左一步，胯往左摆", "Step left, hips swinging left"],
      [4, 4, "右脚并过去，拍手", "Right foot in, clap"],
      [5, 8, "一样再来", "The same again"],
    ],
    tip: ["像在海边酒吧里跟着吉他慢慢扭", "Like swaying to the guitars at a beach bar"],
  },
  "ketchup-hands": {
    ready: ["站好，双手手心朝下放在腰前", "Stand easy, hands in front of your waist, palms down"],
    counts: [
      [1, 1, "「Aserejé」：双手在身前交叉，右手在上", "'Aserejé': cross your hands in front of you, the right on top"],
      [2, 2, "双手往两边分开", "Sweep them apart"],
      [3, 3, "再交叉，这次左手在上", "Cross again, the left on top this time"],
      [4, 4, "再分开", "Apart again"],
      [5, 5, "「De jebe tu」：右手竖起大拇指，往右肩后面指，像在路边搭车", "'De jebe tu': right thumb up, pointing back over your right shoulder, like hitchhiking"],
      [6, 6, "左手大拇指也往左肩后面指", "Left thumb back over your left shoulder too"],
      [7, 8, "「Seibiunouva」：双手握拳，在胸前一个绕一个地往前转", "'Seibiunouva': fists in front of your chest, rolling round each other"],
    ],
    tip: ["副歌每句 12 拍：这 8 拍，加上下一个动作的 4 拍", "Each chorus line is 12 beats: these 8, then the next move's 4"],
  },
  "ketchup-head": {
    ready: ["接着上一个动作", "Straight on from the last move"],
    counts: [
      [5, 5, "「An de bugui」：右手搭在额头上像遮太阳往远处看，左手叉腰，胯往右扭", "'An de bugui': right hand to your forehead as if shading your eyes, looking far off, left hand on your hip, hips to the right"],
      [6, 6, "胯往左扭", "Hips to the left"],
      [7, 8, "「An de buididipí」：再右、左扭两下，头跟着转", "'An de buididipí': right, left again, your head turning with it"],
    ],
  },

  // Gee (少女时代 Girls' Generation)
  "gee-groove": {
    ready: ["双手轻轻握拳放在下巴前，双脚并拢", "Loose fists by your chin, feet together"],
    counts: [
      [1, 2, "右脚往右一步，左脚并过来点地，头往右歪，肩膀一耸", "Step right, left foot taps in, head tilting right, a little shoulder shrug"],
      [3, 4, "左脚往左一步，右脚并过来点地，头往左歪", "Step left, right foot taps in, head tilting left"],
      [5, 8, "再来一遍", "Once more"],
    ],
    tip: ["表情要可爱：笑着歪头", "Keep it cute: smile and tilt your head"],
  },
  "gee-crab": {
    ready: ["双脚分开比肩宽，脚尖朝外，膝盖往外弯下去；双手手心朝下，放在胯两边", "Feet wider than your shoulders, toes out, knees bent outwards; hands palms down at your hips"],
    counts: [
      [1, 4, "「Gee Gee Gee Gee」：一拍挪一小步往右，像螃蟹横着走，手掌跟着一拍一拍往下拍", "'Gee gee gee gee': a little step to the right on every beat, like a crab going sideways, your palms patting down with each beat"],
      [5, 8, "「Baby baby baby」：一样的样子往左挪回来", "'Baby baby baby': the same, back to the left"],
    ],
    tip: ["这是《Gee》最有名的动作：膝盖一直弯着，头跟着轻轻晃", "Gee's most famous move: keep your knees bent the whole time, your head bobbing along"],
  },
  "gee-shy": {
    ready: ["双手捂住脸颊", "Hands on your cheeks"],
    counts: [
      [1, 4, "身体往右摇，头往右歪，像不好意思", "Sway to the right, head tilting right, bashful"],
      [5, 8, "往左摇", "Sway to the left"],
    ],
  },
  "gee-sparkle": {
    ready: ["双手张开放在眼睛两边，手心朝前", "Hands open by your eyes, palms forward"],
    counts: [
      [1, 4, "「너무 반짝반짝」（闪闪发光）：手指一张一合地闪，头往右转，像被晃到眼睛", "'반짝반짝' (sparkle, sparkle): flash your fingers open and shut, head turning right as if dazzled"],
      [5, 8, "继续闪，头往左转", "Keep flashing, head turning left"],
    ],
  },
  "gee-surprise": {
    ready: ["双手握拳放在下巴前", "Fists by your chin"],
    counts: [
      [1, 2, "「깜짝」：小跳一下往后缩，双手捂住嘴，像吓了一跳", "'깜짝' (startled): a little jump back, hands to your mouth"],
      [3, 4, "再吓一跳", "Startled again"],
      [5, 8, "一样再来两次", "Twice more"],
    ],
  },
  "gee-shiver": {
    ready: ["双手交叉抱住自己的胳膊", "Arms crossed, hugging yourself"],
    counts: [[1, 8, "「짜릿짜릿」（浑身发麻）：肩膀和身体快速地抖，像过电", "'짜릿짜릿' (tingling): shiver your shoulders and body quickly, like a jolt of electricity"]],
  },
  // 海草舞
  "hc-seaweed": {
    ready: ["双脚分开，双手举过头顶，掌心相对", "Feet apart, arms up over your head, palms facing"],
    counts: [
      [1, 4, "「像一棵海草海草海草海草」：双手在头顶上往右、往左、往右、往左摇，身体像海草一样跟着摆", "'像一棵海草…': sway your arms over your head right, left, right, left, your body swaying after them like seaweed"],
      [5, 8, "「随波飘摇」：双手放到身前，手心朝下，像水波一样左右摆", "'随波飘摇': bring your hands down in front, palms down, waving side to side like water"],
    ],
    tip: ["手要软，像在水里漂", "Keep your arms soft, as if floating in water"],
  },
  "hc-look": {
    ready: ["双脚分开站好", "Feet apart"],
    counts: [
      [1, 4, "「人海啊」：右手放在额头上遮着眼睛，往右边远处看，左手叉腰", "'人海啊': right hand to your forehead shading your eyes, look far off to the right, left hand on your hip"],
      [5, 8, "「茫茫啊」：换左手遮眼睛，往左边看", "'茫茫啊': swap hands and look off to the left"],
    ],
  },
  "hc-float": {
    ready: ["双脚分开，膝盖放松", "Feet apart, knees soft"],
    counts: [
      [1, 2, "「随波逐流」：双手在身前低低地往右摆，膝盖蹲一下", "'随波逐流': hands low in front, waving to the right as your knees dip"],
      [3, 4, "往左摆，站起来", "Wave to the left as you come up"],
      [5, 8, "「浮浮沉沉」：一样，一沉一浮", "'浮浮沉沉': the same, sinking and floating"],
    ],
  },
  "hc-dream": {
    ready: ["双手合十", "Palms together"],
    counts: [
      [1, 4, "「人生啊」：双手合起来贴在右脸边，头靠上去像睡觉，身体往右摇", "'人生啊': hands together against your right cheek, head resting on them as if asleep, sway right"],
      [5, 8, "「如梦啊」：换到左脸边，往左摇", "'如梦啊': over to your left cheek, sway left"],
    ],
  },
  "hc-where": {
    ready: ["双手放在胸前", "Hands at your chest"],
    counts: [
      [1, 4, "「亲爱的你」：双手在胸前比一个心", "'亲爱的你': make a heart with your hands at your chest"],
      [5, 8, "「在哪里」：右手往前伸出去，左手叉腰，左右找一找", "'在哪里': reach your right hand out, left hand on your hip, looking around for them"],
    ],
  },
  "hc-bounce": {
    ready: ["双手握拳放在肩膀前", "Fists up by your shoulders"],
    counts: [
      [1, 2, "右脚往右一步，右拳往上打；左脚并过去，拳头收回", "Step right, punching your right fist up; left foot in, fist back"],
      [3, 4, "左脚往左一步，左拳往上打；右脚并过去，收回", "Step left, left fist up; right foot in, back"],
      [5, 8, "一样再来", "The same again"],
    ],
    tip: ["说唱的部分：跟着节奏点头，轻松一点", "The rap: nod along to the beat, keep it easy"],
  },
  "hc-hero": {
    ready: ["双脚并拢", "Feet together"],
    counts: [
      [1, 4, "「你我都是这茫茫人海中…那一棵草」：膝盖弯下去，双手在身前捧着，像一棵小草", "'…渺小不起眼的那一棵草': bend your knees, hands cupped in front of you, like a little blade of grass"],
      [5, 8, "「谁说小人物不可以做英雄」：站起来，双脚分开，右拳往天上举，像英雄", "'谁说小人物不可以做英雄': stand up tall, feet apart, right fist up to the sky, a hero"],
    ],
  },
};
