import { Footprints } from "lucide-react";
import { openRoom, write, type StageLink } from "../stage/link";

/**
 * 一起跳 · Dance Along at the table. The game lives at changle.ca/party (games/party-server and
 * games/dance in this repository): a room is opened with `POST /party/api/rooms`; its stage (the 3D
 * coach, the music) is `/party/screen#CODE`, and a phone dances at `/party/join?code=CODE`, which
 * goes straight in when this tab's `party:room` is that code, with the name in `party:name` and the
 * language in `party:lang`. The room's host there is whoever joins first, so the table's host goes
 * first. `?table=` is this table's number, the game's way back: its pages have a 「回到桌子」 link, and
 * when the room ends they leave `sessionStorage["dance.over"]` (the stage `"dance.over.tv"` too) and
 * come back here, a phone to /t/TABLE and the stage to the page that sent it (/tv/TABLE or /t/TABLE).
 * `GET /party/api/rooms/CODE` says how the room is going.
 */
const PARTY = "/party";
const CODE = /^[A-HJ-NP-Z2-9]{4}$/;

/** How the room is going, from its server. */
async function dancePhase(code: string): Promise<"lobby" | "playing" | "over" | "gone" | null> {
  try {
    const response = await fetch(`${PARTY}/api/rooms/${code}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { exists?: boolean; phase?: string };
    if (!data.exists) return "gone";
    return data.phase === "lobby" || data.phase === "playing" || data.phase === "over" ? data.phase : null;
  } catch {
    return null;
  }
}

export const DANCE: StageLink = {
  id: "dance",
  icon: Footprints,
  who: { zh: "1 到 15 人 · 每人一部手机，电视当舞台", en: "1 to 15 · a phone each, a TV for the stage" },
  rules: [
    {
      zh: "电视（或一台只看的手机）是舞台：3D 老师先一段一段教，再跟着音乐一起跳。每个人拿着自己的手机跳，手机知道你有没有踩在拍子上。",
      en: "The TV (or a phone that only watches) is the stage: a 3D coach teaches a few moves, then everyone dances to the music, phone in hand. The phone knows whether you're on the beat.",
    },
    {
      zh: "6 支练习舞，还有一串热歌，零基础也能跳完一首。跳完了回到这桌，主人收桌。",
      en: "Six practice dances and a set of hit songs; anyone can finish a song. When it's done, come back to this table and the host ends it here.",
    },
  ],
  stageName: { zh: "舞台", en: "stage" },
  stageLead: {
    zh: "一起跳的舞台是它自己的页面：3D 老师、音乐和大家的拍子都在那一页上。打开它，这台设备就是舞台，可以投到电视上。",
    en: "Dance Along's stage is a page of its own: the 3D coach, the music and everyone's beat. Open it and this device is the stage, to mirror to a TV.",
  },
  open: () => openRoom(`${PARTY}/api/rooms`, {}, CODE),
  phoneUrl: (code, table) => `${PARTY}/join?code=${code}&table=${table}`,
  stageUrl: (code, table) => `${PARTY}/screen?table=${table}#${code}`,
  handOff: (code, name, lang) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 16);
    if (clean) write("party:name", clean);
    write("party:lang", lang);
    try {
      // the join page goes straight into this room when this tab was in it (it was: the table sent it)
      sessionStorage.setItem("party:room", code);
    } catch {
      // no session storage: the join page shows its form, with the code filled in
    }
  },
  phase: dancePhase,
  hostFirst: true,
};
