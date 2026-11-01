import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Confetti } from "../components/Figure";
import { Sheet } from "../components/Sheet";
import { useStore } from "../store";
import { useAccount, useLive } from "./AccountContext";
import { Avatar } from "./Avatar";

/**
 * The news when a game someone wished for goes live: their face in its new gold frame, and the
 * limited outfits now theirs in the AI avatar maker.
 */
export function PerkNews() {
  const { me } = useAccount();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [about, setAbout] = useState<string | null>(null);
  useLive((e) => {
    if (e.t === "perk" && e.perk === "wish") setAbout(e.about || "");
  });
  if (!me) return null;
  return (
    <Sheet open={about !== null} onClose={() => setAbout(null)} title={zh ? "你许的愿成真了" : "Your wish came true"} gel="#ffcf5a">
      <div className="perk-news">
        <span className="perk-face">
          <Avatar uid={me.id} name={me.name} av={me.av} ac={me.ac} size={96} frame="gold" />
          <Confetti className="perk-confetti" />
        </span>
        <p className="perk-lead">{about ? (zh ? `「${about}」上线了。` : `"${about}" is live.`) : zh ? "你许的游戏上线了。" : "The game you wished for is live."}</p>
        <p className="hint">{zh ? "谢谢你的点子。送你一个金色头像边框，所有人都看得到；AI 头像里的三套限量服饰也归你了。" : "Thank you for the idea. Your face now has a gold frame everyone sees, and the three limited outfits in the AI avatar maker are yours."}</p>
        <a className="btn btn-primary btn-lg btn-block" href="#/me" onClick={() => setAbout(null)}>
          <Sparkles size={18} />
          {zh ? "去穿限量款" : "Try the limited outfits"}
        </a>
      </div>
    </Sheet>
  );
}
