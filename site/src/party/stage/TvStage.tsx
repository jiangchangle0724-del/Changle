import { useEffect, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import type { DanceView, HangOnView } from "../../shared/protocol";
import { useStore } from "../../store";
import { cameBackFromEnd, markWent, wentTo, type StageLink } from "./link";

/**
 * A game with a stage of its own (一起跳, 抓紧了) on the table's TV: the TV goes to the game's stage by
 * itself once the host has opened the game, and comes back here when the host takes everyone back
 * to the table. (`Notice` is the TV's own notice card, passed in so this file needs nothing else
 * from the TV.)
 */
export function TvStage({ v, link, table, Notice }: { v: DanceView | HangOnView; link: StageLink; table: string; Notice: (p: { title: string; spinning?: boolean; children?: React.ReactNode }) => React.ReactElement }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const name = zh ? GAME_BY_ID[link.id].name.zh : GAME_BY_ID[link.id].name.en;
  const stage = zh ? link.stageName.zh : link.stageName.en;
  // a phones-only room (抓紧了 opened when no big screen was at the table): the host's phone is its stage
  const phone = v.id === "hangon" && v.phone;
  const [state, setState] = useState<"going" | "back" | "over">("going");
  useEffect(() => {
    if (!v.code || phone) return;
    if (cameBackFromEnd(link.id, v.code, true)) return setState("over");
    if (wentTo(link.id, v.code, true)) return setState("back");
    markWent(link.id, v.code, true);
    window.location.assign(link.stageUrl(v.code, table));
  }, [v.code, table, link, phone]);
  if (!v.code) return <Notice title={zh ? `${name}：主人的手机正在开局` : `${name}: the host's phone is opening the game`} spinning />;
  if (phone) return <Notice title={zh ? `这局是在主人的手机上开的：主人的手机就是${stage}，大家都在自己手机上看` : `This game was opened on the host's phone: that phone is the ${stage}, and everyone watches on their own phone`} />;
  if (state === "going") return <Notice title={zh ? `正在打开${name}的${stage}…` : `Opening ${name}'s ${stage}…`} spinning />;
  if (state === "over") return <Notice title={zh ? "这局玩完了，等主人回到大厅" : "That game is over. The host takes everyone back to the lobby"} />;
  return (
    <Notice title={zh ? `${name}还在进行` : `${name} is still on`}>
      <button
        type="button"
        className="tv-btn tv-btn-main"
        onClick={() => {
          markWent(link.id, v.code!, true);
          window.location.assign(link.stageUrl(v.code!, table));
        }}
      >
        {zh ? `打开它的${stage}` : `Open its ${stage}`}
      </button>
    </Notice>
  );
}
