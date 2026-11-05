import { Crown } from "lucide-react";
import type { KingView } from "../../shared/protocol";
import { Bi, DoneBadge, FacesIn, RoundTag, TvLineup, TvShow, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../People";
import "../../styles/tv-king.css";

/**
 * 国王游戏 on the big screen: everyone drawing their stick (never which one: who holds which number
 * stays on their own phone), the king crowned, the king's order, and the numbers it calls stepping
 * up one by one. A number shows whose it is only once its holder steps up for the order.
 */
export default function TvKing({ v }: TvViewProps<KingView>) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const table = v.inRound.map((pid) => seat(pid)).filter((s): s is NonNullable<typeof s> => !!s);
  const king = seat(v.king);
  const tag = <RoundTag>{tx(`第 ${v.round} 轮`, `Round ${v.round}`)}</RoundTag>;

  if (v.phase === "deal") {
    const people: Person[] = table.map((s) => ({
      seat: s,
      state: v.ready.includes(s.id) ? "ready" : v.pulledIds.includes(s.id) ? "idle" : "dim",
      badge: v.ready.includes(s.id) ? <DoneBadge /> : undefined,
    }));
    return (
      <TvShow game="king" className="tvk is-deal" phase={v.phase} round={tag}>
        <div className="tvk-top">
          <h1 className="tvk-head">
            <Bi t={{ zh: "抽签", en: "Draw a stick" }} />
          </h1>
          <p className="tvk-line">{tx("每人在手机上抽一根，偷偷看一眼：有一根是国王", "Everyone draws one on their phone and peeks: one of them is the king")}</p>
          <p className="tvk-count tabular">{tx(`${v.ready.length}/${table.length} 人看好了`, `${v.ready.length} of ${table.length} ready`)}</p>
        </div>
        <TvLineup people={people} big={250} className="tvk-line-up" />
      </TvShow>
    );
  }

  if (v.phase === "crown")
    return (
      <TvShow game="king" className="tvk is-crown" phase={v.phase} round={tag}>
        <div className="tvk-crown">
          <Crown className="tvk-crown-icon" size={110} strokeWidth={1.8} aria-hidden="true" />
          <h1 className="tvk-king-name">{tx(`${name(v.king)} 是国王！`, `${name(v.king)} is the king!`)}</h1>
          {king && <TvLineup people={[{ seat: king, state: "win" }]} big={300} className="tvk-king" />}
          <p className="tvk-line">{tx("国王在手机上抽一道命令", "The king draws an order on their phone")}</p>
        </div>
      </TvShow>
    );

  // the order: the numbers it names, and who steps up for each
  const nums = v.cmd?.nums ?? [];
  return (
    <TvShow game="king" className="tvk is-command" phase={v.phase} round={tag}>
      <div className="tvk-order">
        <p className="tvk-by">
          {king && <SeatFace seat={king} size={60} />}
          <Crown size={34} strokeWidth={2.2} aria-hidden="true" />
          {tx(`国王 ${name(v.king)} 下令`, `King ${name(v.king)} orders`)}
        </p>
        {v.cmd && <h1 className="tvk-cmd">{tr(v.cmd.text)}</h1>}
        <ol className="tvk-nums">
          {nums.map((n) => {
            const pid = v.stepped[String(n)];
            const who = seat(pid);
            return (
              <li key={n} className={who ? "is-up" : ""}>
                <b className="tvk-num tabular">{n}</b>
                {who ? (
                  <span className="tvk-who">
                    <SeatFace seat={who} size={64} />
                    {who.name}
                  </span>
                ) : (
                  <span className="tvk-who is-waiting">{tx(`${n} 号，站出来`, `Number ${n}, step up`)}</span>
                )}
              </li>
            );
          })}
        </ol>
        {v.refused.length > 0 && (
          <p className="tvk-refused">
            <FacesIn seats={v.refused.map((pid) => seat(pid))} size={52} />
            {tx("不做，认罚", "Refused: penalty")}
          </p>
        )}
      </div>
    </TvShow>
  );
}
