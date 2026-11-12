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
};
