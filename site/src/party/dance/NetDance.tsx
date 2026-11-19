import type { DanceView } from "../../shared/protocol";
import { NetStage } from "../stage/NetStage";
import { DANCE } from "./link";

/** 一起跳 · Dance Along at the table: the way into the game at changle.ca/party (party/stage). */
export function NetDance({ v, onLeave }: { v: DanceView; onLeave: () => void }) {
  return <NetStage v={v} link={DANCE} onLeave={onLeave} />;
}
