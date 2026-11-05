import { useEffect, useState } from "react";
import type { HideView } from "../../shared/protocol";
import { useStore } from "../../store";
import { cameBackFromEnd, hideUrl, markWent, wentTo } from "./link";

/**
 * 藏在人群里 plays on its own big screen at changle.ca/hide: the TV goes there by itself once the host
 * has opened the game, and comes back here when the host takes everyone back to the table.
 * (`Notice` is the TV's own notice card, passed in so this file needs nothing else from the TV.)
 */
export function TvHide({ v, table, Notice }: { v: HideView; table: string; Notice: (p: { title: string; spinning?: boolean; children?: React.ReactNode }) => React.ReactElement }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [state, setState] = useState<"going" | "back" | "over">("going");
  useEffect(() => {
    if (!v.code) return;
    if (cameBackFromEnd(v.code, true)) return setState("over");
    if (wentTo(v.code, true)) return setState("back");
    markWent(v.code, true);
    window.location.assign(hideUrl(v.code, table, true));
  }, [v.code, table]);
  if (!v.code) return <Notice title={zh ? "藏在人群里：主人的手机正在开局" : "Hide in the Crowd: the host's phone is opening the game"} spinning />;
  if (state === "going") return <Notice title={zh ? "正在打开藏在人群里…" : "Opening Hide in the Crowd…"} spinning />;
  if (state === "over") return <Notice title={zh ? "这局玩完了，等主人回到大厅" : "That game is over. The host takes everyone back to the lobby"} />;
  return (
    <Notice title={zh ? "藏在人群里还在进行" : "Hide in the Crowd is still on"}>
      <button
        type="button"
        className="tv-btn tv-btn-main"
        onClick={() => {
          markWent(v.code!, true);
          window.location.assign(hideUrl(v.code!, table, true));
        }}
      >
        {zh ? "打开它的大屏" : "Open its big screen"}
      </button>
    </Notice>
  );
}
