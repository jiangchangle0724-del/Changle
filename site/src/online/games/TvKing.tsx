import { Crown } from "lucide-react";
import { motion } from "motion/react";
import { PorcelainDefs } from "../../components/Dish";
import { Moment } from "../../components/Figure";
import type { KingView } from "../../shared/protocol";
import { Bi, DoneBadge, FacesIn, RoundTag, TvLineup, TvShow, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../People";
import "../../styles/tv-king.css";

/**
 * The phones' cup of sticks (NetKing.tsx), drawn the same: as each one draws, a stick lifts out of
 * the cup and goes, as it does on every phone (never which number it was).
 */
function StickCup({ count, pulled }: { count: number; pulled: number }) {
  const sticks = Array.from({ length: count }, (_, i) => ({ i, h: 150 + ((i * 37) % 5) * 6, x: 60 + (240 / Math.max(1, count - 1)) * i }));
  return (
    <svg viewBox="0 0 360 300" className="tvk-cup" aria-hidden="true">
      <PorcelainDefs />
      <ellipse cx={180} cy={170} rx={140} ry={16} fill="var(--dusk-3)" />
      <ellipse cx={180} cy={170} rx={132} ry={11} fill="var(--night)" />
      {sticks.map((s) => {
        // (the phones take the drawn ones from the right)
        const gone = s.i >= count - pulled;
        return (
          <motion.g key={s.i} initial={false} animate={{ y: gone ? -90 : 0, opacity: gone ? 0 : 1 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
            <rect x={s.x - 5} y={170 - s.h} width={10} height={s.h + 110} rx={4} fill="url(#bamboo)" />
          </motion.g>
        );
      })}
      <path d="M 40 170 L 320 170 L 300 290 L 60 290 Z" fill="url(#plate)" filter="url(#dishShadow)" />
      <path d="M 40 170 A 140 16 0 0 0 320 170" fill="var(--dusk-3)" />
      <path d="M 52 184 L 308 184" stroke="var(--gel)" strokeWidth={2} opacity={0.9} />
      <path d="M 56 196 L 304 196" stroke="var(--gel)" strokeWidth={1} opacity={0.5} />
      <path d="M 70 276 L 290 276" stroke="var(--line)" strokeWidth={1} opacity={0.7} />
    </svg>
  );
}

/**
 * 国王游戏 on the big screen: everyone drawing their stick from the phones' cup (never which one:
 * who holds which number stays on their own phone), the king crowned, the king's order, and the
 * numbers it calls stepping up one by one. A number shows whose it is only once its holder steps up
 * for the order.
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
        <StickCup count={v.count} pulled={v.pulledIds.length} />
        <TvLineup people={people} big={220} className="tvk-line-up" />
      </TvShow>
    );
  }

  if (v.phase === "crown")
    return (
      <TvShow game="king" className="tvk is-crown" phase={v.phase} round={tag}>
        <div className="tvk-crown">
          <Crown className="tvk-crown-icon" size={110} strokeWidth={1.8} aria-hidden="true" />
          <h1 className="tvk-king-name">{tx(`${name(v.king)} 是国王！`, `${name(v.king)} is the king!`)}</h1>
          {/* the phones' moment: the king on a throne, a crown on the head */}
          {king && (
            <div className="tvk-king">
              <Moment seat={king} kind="king" />
            </div>
          )}
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
