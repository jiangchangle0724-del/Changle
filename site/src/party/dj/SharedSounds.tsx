import { useRoom } from "../../online/RoomContext";
import { SHARED_BY } from "../../shared/dj/types";
import { useStore } from "../../store";
import { useDjNames } from "./names";
import { SoundBoard } from "./phone/SoundBoard";

/**
 * What the shared phone's 音效 sheet holds (SharedPhone.tsx; Steve on Nov 14: "点歌按钮的下面也设置
 * 一个音效按钮，这样投屏的手机也可以发音效"): the phones' sound board, as the table's (SHARED_BY). The
 * sound plays from this page, the speaker, at once: on the TV when the phone is shown there, from
 * the phone itself when it isn't.
 */
export default function SharedSounds() {
  const { g } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  return (
    <div className="djk dj-share">
      <SoundBoard g={g} zh={zh} nameOf={nameOf} me={SHARED_BY} />
    </div>
  );
}
