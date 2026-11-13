import { useRoom } from "../../online/RoomContext";
import { DECK, SHARED_BY } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { useDjNames } from "./names";
import { Playlist, Requests } from "./phone/DeckPad";
import { Player } from "./phone/Player";

/**
 * What the shared phone's 点歌 sheet holds (SharedPhone.tsx): the phones' own player, song box and
 * playlist, as the big screen's (SHARED_BY): 暂停, 播放, 切歌 and 上一曲, its songs the table's (up to
 * the table's thirty, not three), its own taken back, 随机 switched.
 */
export default function SharedSongs({ v }: { v: DjView }) {
  const { g } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  return (
    <div className="djk dj-share">
      <Player v={v} me={SHARED_BY} g={g} zh={zh} nameOf={nameOf} />
      <Requests v={v} me={SHARED_BY} g={g} zh={zh} each={DECK.reqMax} />
      <Playlist v={v} me={SHARED_BY} g={g} zh={zh} boss />
    </div>
  );
}
