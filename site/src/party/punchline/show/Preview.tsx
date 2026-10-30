import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../../../account/Avatar";
import type { PunchMatch, PunchView } from "../../../shared/protocol";
import { headToHeadPoints } from "../../../shared/punchline";
import { useStore } from "../../../store";
import { Stage } from "./Stage";

/**
 * Development only (#/dev/show?scene=result&mode=tv&t=5): the show with made-up data, frozen at
 * a moment, for looking at each scene without playing a whole game.
 */

const NAMES = ["Steve", "Mia", "小林", "Jay", "Kev", "Ann", "Bo", "陈晨"];
const IDS = NAMES.map((_, i) => `p${i}`);

function view(scene: string, phaseAt: number): PunchView {
  const base: PunchView = {
    id: "punchline",
    phase: "write",
    round: 1,
    rounds: 3,
    phaseAt,
    endsAt: phaseAt + 90_000,
    step: 1,
    players: IDS.slice(0, 6),
    audience: IDS.slice(6),
    mine: [],
    writing: ["p2", "p4"],
    match: null,
    scores: { p0: 1350, p1: 600, p2: 2100, p3: 950, p4: 0, p5: 1200 },
    before: { p0: 700, p1: 600, p2: 1100, p3: 500, p4: 0, p5: 1200 },
    winners: null,
    last: null,
  };
  const h2h = (phase: "present" | "vote" | "result", sweep: boolean): PunchMatch => {
    const votes = sweep ? [6, 0] : [4, 2];
    const pts = headToHeadPoints(votes, 1, [false, sweep ? false : true]).points;
    const shown = phase === "result";
    return {
      k: 2,
      n: 3,
      of: 6,
      final: false,
      prompt: { zh: "外星人来到地球后发的第一条朋友圈", en: "The first post aliens make after landing on Earth" },
      answers: [
        { text: "这里的人类会自己给自己拍照，还加滤镜", by: shown ? "p2" : null, votes: shown ? votes[0] : null, voters: shown ? ["p0", "p1", "p3", "p5", "p6", "p7"].slice(0, votes[0]) : null, points: shown ? pts[0] : null, safety: shown ? false : null },
        { text: "Wi-Fi 密码到底是多少", by: shown ? "p4" : null, votes: shown ? votes[1] : null, voters: shown ? ["p6", "p7"].slice(0, votes[1]) : null, points: shown ? pts[1] : null, safety: shown ? !sweep : null },
      ],
      canVote: phase === "vote",
      maxVotes: 1,
      myVotes: phase === "vote" ? [0] : [],
      mine: null,
      voted: phase === "vote" ? ["p0", "p1", "p3", "p6"] : [],
      voters: 6,
      sweep: shown && sweep ? 0 : null,
      forfeit: false,
    };
  };
  const finalMatch = (phase: "present" | "vote" | "result"): PunchMatch => {
    const texts = ["今晚没人喝醉，除了那盆绿萝", "我们又一次成功地没聊工作", "披萨比人先到", "Steve 的歌声，邻居的投诉", "一半的人在找手机", "最后一个走的人负责关灯"];
    const votes = [5, 2, 7, 1, 3, 0];
    const shown = phase === "result";
    return {
      k: 0,
      n: 1,
      of: 1,
      final: true,
      prompt: { zh: "如果今晚上新闻，标题是", en: "If tonight made the news, the headline would be" },
      answers: texts.map((text, i) => ({
        text,
        by: shown ? IDS[i] : null,
        votes: shown ? votes[i] : null,
        voters: shown ? IDS.filter((_, j) => j !== i).slice(0, votes[i]) : null,
        points: shown ? Math.round((4000 * votes[i]) / 18) : null,
        safety: shown ? false : null,
      })),
      canVote: phase === "vote",
      maxVotes: 3,
      myVotes: phase === "vote" ? [1, 4] : [],
      mine: 0,
      voted: phase === "vote" ? ["p1", "p2", "p5"] : [],
      voters: 8,
      sweep: null,
      forfeit: false,
    };
  };
  switch (scene) {
    case "write":
      return base;
    case "write2":
      return { ...base, round: 3, players: IDS.slice(0, 8), audience: [] };
    case "present":
      return { ...base, phase: "present", match: h2h("present", false), endsAt: 0 };
    case "vote":
      return { ...base, phase: "vote", match: h2h("vote", false), endsAt: phaseAt + 20_000 };
    case "result":
      return { ...base, phase: "result", match: h2h("result", false), endsAt: 0 };
    case "sweep":
      return { ...base, phase: "result", match: h2h("result", true), endsAt: 0 };
    case "fpresent":
      return { ...base, round: 3, phase: "present", match: finalMatch("present"), endsAt: 0 };
    case "fvote":
      return { ...base, round: 3, phase: "vote", match: finalMatch("vote"), endsAt: phaseAt + 40_000 };
    case "fresult":
      return { ...base, round: 3, phase: "result", match: finalMatch("result"), endsAt: 0 };
    case "scores":
      return { ...base, phase: "scores", endsAt: 0 };
    case "end":
      return { ...base, round: 3, phase: "end", endsAt: 0, winners: ["p2"], last: ["p4"] };
    default:
      return base;
  }
}

export function ShowPreview() {
  const { lang } = useStore();
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const scene = params.get("scene") ?? "present";
  const mode = (params.get("mode") as "tv" | "phone") ?? "tv";
  const t = Number(params.get("t") ?? 6);
  const [phaseAt] = useState(() => Date.now() - t * 1000);
  const v = useMemo(() => view(scene, phaseAt), [scene, phaseAt]);
  const [k, setK] = useState(1);
  useEffect(() => {
    if (mode !== "tv") return;
    const fit = () => setK(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [mode]);
  const who = (pid: string) => {
    const i = IDS.indexOf(pid);
    const name = NAMES[i] ?? "?";
    return { name, face: (size: number) => <Avatar name={name} ac={i * 3} size={size} /> };
  };
  const stage = <Stage v={v} who={who} now={() => Date.now()} mode={mode} sound={false} lang={lang} me="p0" onVote={() => {}} />;
  if (mode === "phone") return <div style={{ padding: 16, maxWidth: 420, margin: "0 auto" }}>{stage}</div>;
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#07040a", overflow: "hidden" }}>
      <div style={{ width: 1600, height: 900, transform: `scale(${k})`, flex: "none" }}>{stage}</div>
    </div>
  );
}
