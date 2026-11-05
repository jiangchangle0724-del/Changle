import { useRoom } from "../../online/RoomContext";
import type { PunchView } from "../../shared/protocol";
import { useStore } from "../../store";
import type { TvViewProps } from "../../tv/views";
import { Stage } from "./show/Stage";
import { useWho } from "./show/who";

/** Punchline on the big screen: the whole show (show/Stage.tsx), drawn for the room. */
export default function TvPunch({ v, sound }: TvViewProps<PunchView>) {
  const { room, now } = useRoom();
  const { lang } = useStore();
  const who = useWho(room?.seats ?? []);
  return <Stage v={v} who={who} now={now} mode="tv" sound={sound} lang={lang} me={null} />;
}
