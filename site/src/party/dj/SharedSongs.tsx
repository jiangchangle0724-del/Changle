import { useRoom } from "../../online/RoomContext";
import { DECK, SHARED_BY } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { useDjNames } from "./names";
import { JukeSwitch, Playlist, Requests, SongTime } from "./phone/DeckPad";

/**
 * What the shared phone's 点歌 sheet holds (SharedPhone.tsx): the phones' own song box, playlist,
 * whole song and 点歌模式, as the big screen's (SHARED_BY): its songs the table's (up to the table's
 * thirty, not three), its own taken back, any song skipped, 随机 and 点歌模式 switched.
 */
export default function SharedSongs({ v }: { v: DjView }) {
  const { g } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  return (
    <div className="djk dj-share">
      <JukeSwitch v={v} g={g} zh={zh} boss />
      {v.deck.song && <SongTime v={v} me={SHARED_BY} g={g} zh={zh} nameOf={nameOf} boss />}
      <Requests v={v} me={SHARED_BY} g={g} zh={zh} each={DECK.reqMax} />
      <Playlist v={v} me={SHARED_BY} g={g} zh={zh} boss />
    </div>
  );
}
