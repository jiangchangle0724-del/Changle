import { Eye, Hand } from "lucide-react";
import type { DramaView } from "../../shared/protocol";
import { useStore } from "../../store";
import { Pill } from "../../ui/Pill";
import { Tabs } from "../../ui/Tabs";
import type { Face } from "./parts";

type Want = "act" | "watch";
type Choice = Want | "either";

/** What the next scene will be, in one line: how many go on, or why nobody can yet. */
function nextLine(v: DramaView, zh: boolean, players: number): string {
  const n = v.next;
  if (!n) return "";
  if (v.mode === "pk") {
    if (!n.ok) return zh ? "演技 PK 要两个人上台：至少两个人选「我要上台」或「都行」。" : "A duel needs two on stage: at least two people have to pick “I'll act” or “Either way”.";
    return zh ? "演技 PK 每次两个人上台，报名的先上。" : "A duel puts two on stage; volunteers go first.";
  }
  if (v.mode === "read") {
    if (!n.ok) return zh ? "朗读要一个人上台：至少一个人选「我要上台」或「都行」。" : "A reading needs someone on stage: at least one person has to pick “I'll act” or “Either way”.";
    if (n.auto) return zh ? "还没人报名：从「都行」的人里抽一个上台朗读，读得少的先上。" : "No volunteers yet: one of the “Either way” crowd reads, whoever has read least first.";
    return zh ? "每一幕一个人上台朗读。报名的轮流来，读得少的先上。" : "One person reads each act. Volunteers take turns, whoever has read least first.";
  }
  if (!n.ok) return zh ? "大家都只想看：至少要有一个人选「我要上台」或「都行」，才能开演。" : "Everyone's just watching. Someone has to pick “I'll act” or “Either way” before the curtain can go up.";
  if (n.auto) {
    const k = n.lo === n.hi ? `${n.hi}` : zh ? `${n.lo} 到 ${n.hi}` : `${n.lo} to ${n.hi}`;
    return zh ? `还没人报名：从「都行」的人里随机抽 ${k} 个上台。` : `No volunteers yet: ${k} of the “Either way” crowd go up at random.`;
  }
  const volunteers = Object.values(v.want ?? {}).filter((w) => w === "act").length;
  if (v.mode === "classic") {
    // a famous scene has no secret to guess, only stars
    if (n.lo === 1) return zh ? "下一幕一个人上台，独自演一段名场面。" : "Next up: one person plays a famous moment solo.";
    if (n.lo >= players) return zh ? `下一幕 ${n.lo} 个人全都上台，没人当观众：演完以后互相打星。` : `Next scene: all ${n.lo} of you on stage. With nobody watching, you'll rate each other.`;
  }
  if (n.lo === 1) return zh ? "下一幕是独角戏：一个人上台，大家来猜 TA 藏着什么秘密。" : "Next up: a one-person show. Everyone else guesses what they're hiding.";
  if (n.lo >= players) return zh ? `下一幕 ${n.lo} 个人全都上台，没人当观众：演完以后互相猜、互相打星。` : `Next scene: all ${n.lo} of you on stage. With nobody watching, you'll guess and rate each other.`;
  if (volunteers > n.lo) return zh ? `下一幕 ${n.lo} 个人演。报名的人比角色多，演得少的先上。` : `Next scene: ${n.lo} on stage. More volunteered than there are roles: whoever has acted least goes first.`;
  return zh ? `下一幕 ${n.lo} 个人演。` : `Next scene: ${n.lo} on stage.`;
}

/**
 * Who goes on stage next. Online, each player says for themselves: I'll act, either way, or just
 * watching (`me`); everyone sees who's in. On one phone (no `me`), the phone taps the names of
 * whoever is acting next; nobody tapped, it picks at random. The choice holds until it's changed.
 */
export function StageCall({ v, ids, nameOf, face, me, onWant }: { v: DramaView; ids: string[]; nameOf: (pid: string) => string; face: Face; me?: string; onWant: (want: Want | null, who?: string) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const want = v.want ?? {};
  const acting = ids.filter((p) => want[p] === "act");
  const watching = ids.filter((p) => want[p] === "watch");
  const line = nextLine(v, zh, ids.length);
  const mine: Choice = me ? (want[me] ?? "either") : "either";
  return (
    <section className="panel dm-stagecall" aria-labelledby="dm-stagecall-title">
      <h3 id="dm-stagecall-title" className="dm-stagecall-title">
        {zh ? "下一幕谁上台？" : "Who's on stage next?"}
      </h3>
      {me ? (
        <Tabs<Choice>
          variant="segmented"
          label={zh ? "下一幕我" : "Next scene, I'm"}
          value={mine}
          onChange={(c) => onWant(c === "either" ? null : c)}
          items={[
            { key: "act", label: zh ? "我要上台" : "I'll act" },
            { key: "either", label: zh ? "都行" : "Either way" },
            { key: "watch", label: zh ? "我只看" : "Just watching" },
          ]}
        />
      ) : (
        <>
          <p className="dm-stagecall-hint">{zh ? "点名字选这一幕上台的人，一个都不点就随机抽。" : "Tap whoever's acting next. Tap nobody and it's picked at random."}</p>
          <div className="dm-stagecall-names" role="group" aria-label={zh ? "上台的人" : "On stage"}>
            {ids.map((pid) => (
              <Pill key={pid} kind="toggle" tone="accent" selected={want[pid] === "act"} onToggle={(on) => onWant(on ? "act" : null, pid)}>
                {face(pid, 24)}
                {nameOf(pid)}
              </Pill>
            ))}
          </div>
        </>
      )}
      {line && <p className="dm-stagecall-next" aria-live="polite">{line}</p>}
      {me && (acting.length > 0 || watching.length > 0) && (
        <div className="dm-stagecall-who">
          {acting.length > 0 && (
            <p>
              <Hand size={16} strokeWidth={2.4} aria-hidden="true" />
              <strong>{zh ? "要上台" : "Acting"}</strong>
              <span>{acting.map((p) => nameOf(p)).join(zh ? "、" : ", ")}</span>
            </p>
          )}
          {watching.length > 0 && (
            <p>
              <Eye size={16} strokeWidth={2.4} aria-hidden="true" />
              <strong>{zh ? "只看" : "Watching"}</strong>
              <span>{watching.map((p) => nameOf(p)).join(zh ? "、" : ", ")}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
