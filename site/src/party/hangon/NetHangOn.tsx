import type { HangOnView } from "../../shared/protocol";
import { NetStage } from "../stage/NetStage";
import { HANGON } from "./link";

/** 抓紧了 · Hang On at the table: the way into the game at changle.ca/hang-on (party/stage). */
export function NetHangOn({ v, onLeave }: { v: HangOnView; onLeave: () => void }) {
  return <NetStage v={v} link={HANGON} onLeave={onLeave} />;
}
