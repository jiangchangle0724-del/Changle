import { Grab } from "lucide-react";
import { openRoom, write, type StageLink } from "../stage/link";

/**
 * 抓紧了 · Hang On at the table. The game lives at changle.ca/hang-on (games/hang-on in this
 * repository): a room is opened with `POST /hang-on/api/rooms` (`{ hostPlays: true }` for a
 * phones-only game, when the table has no big screen); a phone is a controller at
 * `/hang-on/pad/?code=CODE&auto=1`, with its name in `hang-on:name`; the stage is the host page,
 * `/hang-on/` on a big screen or `/hang-on/?phone=1` on the host's own phone when it plays too.
 *
 * Not on the table's list of games yet (ONLINE_GAMES): the host page always opens a room of its own
 * and can't take over the one the table opened. docs/briefs/hang-on.md asks the hang-on chat for
 * `?room=CODE` (and `?table=` for the way back); the addresses below already carry both.
 */
const HANG_ON = "/hang-on";
const CODE = /^[A-HJ-NP-Z2-9]{4}$/;

export const HANGON: StageLink = {
  id: "hangon",
  icon: Grab,
  who: { zh: "1 到 6 人 · 每人一部手机，电视当大屏；没电视就在主人的手机上", en: "1 to 6 · a phone each, a TV for the big screen, or the host's phone without one" },
  rules: [
    {
      zh: "每人是一个糯米团，不能跳，只有两只手：按住就抓，松开就放，摇杆管身体往哪边荡。全队都到顶才算过关，摔下去在存档点复活；可以拉着队友荡过去，也可以把队友丢过去。",
      en: "You're a rice dumpling with two arms and no jumping: hold to grab, let go to drop, and the stick swings your body. The whole team has to reach the top; fall and you come back at the last checkpoint. Swing a teammate across, or throw one.",
    },
    {
      zh: "有电视，电视是大屏，大家的手机当手柄；没有电视，主人的手机开局、自己也玩，大家都在自己手机上看。玩完了回到这桌，主人收桌。",
      en: "With a TV, the TV is the big screen and the phones are controllers; without one, the host's phone runs the game and plays too, and everyone watches on their own phone. When it's done, come back to this table and the host ends it here.",
    },
  ],
  stageName: { zh: "大屏", en: "big screen" },
  stageLead: {
    zh: "抓紧了的大屏是它自己的页面：整面墙、每个糯米团和存档点都在那一页上。打开它，这台设备就是大屏，可以投到电视上。",
    en: "Hang On's big screen is a page of its own: the whole wall, every dumpling and the checkpoints. Open it and this device is the big screen, to mirror to a TV.",
  },
  open: async ({ screen }) => {
    const res = await openRoom(`${HANG_ON}/api/rooms`, screen ? {} : { hostPlays: true }, CODE);
    return "code" in res ? { ...res, phone: !screen } : res;
  },
  phoneUrl: (code, table, { host, phone }) => (host && phone ? `${HANG_ON}/?phone=1&room=${code}&table=${table}` : `${HANG_ON}/pad/?code=${code}&auto=1&table=${table}`),
  stageUrl: (code, table) => `${HANG_ON}/?phone=0&room=${code}&table=${table}`,
  handOff: (_code, name, lang) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 16);
    if (clean) write("hang-on:name", clean);
    write("hang-on:lang", lang);
  },
  phase: null,
  hostFirst: false,
};
