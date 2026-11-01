import { Crown, Dices, Play, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../games/registry";
import { Tile } from "../home/Tile";
import { setLight, reduced } from "../lib/anim";
import { haptic, sfx } from "../lib/sfx";
import { runSweep } from "../lib/sweep";
import { ONLINE_GAMES, ONLINE_MIN } from "../shared/protocol";
import { useStore } from "../store";
import { QUEUE } from "./config";
import { NetFrame, useFrame } from "./NetFrame";
import { PersonSheet, SeatFace } from "./People";
import { useRoom, useRoomEvent } from "./RoomContext";
import { useAccount } from "../account/AccountContext";
import type { SeatView } from "../shared/protocol";
import { RoomFigures } from "../components/Figure";

/** The online lobby: everyone at the table, the board of games, the host picks or spins. */
export function Lobby({ onLeave }: { onLeave: () => void }) {
  const { lang } = useStore();
  const { room } = useRoom();
  const center = (
    <span className="lobby-title">
      <span>{lang === "zh" ? "桌号" : "Table"}</span>
      <strong>{room?.code ?? ""}</strong>
    </span>
  );
  return (
    <NetFrame center={center} onLeave={onLeave} className="lobby-screen">
      <LobbyBoard />
    </NetFrame>
  );
}

function LobbyBoard() {
  const { room, me, isHost, act, nameOf, code } = useRoom();
  const { ui, lang } = useStore();
  const frame = useFrame();
  const [lit, setLit] = useState<number | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [person, setPerson] = useState<SeatView | null>(null);
  const account = useAccount();
  const tl = useRef<gsap.core.Timeline | null>(null);
  const front = room?.front ?? 0;
  const shown = sweeping && lit !== null ? lit : front;

  useEffect(() => () => void tl.current?.kill(), []);
  useEffect(() => {
    if (!sweeping) setLight(GAME_BY_ID[ONLINE_GAMES[front]].gel, 0.5);
  }, [front, sweeping]);

  const play = (from: number, to: number, duration: number) => {
    tl.current?.kill();
    // a quick hop, or the phone asks for less motion: land on the game without the walk
    if (duration < 0.5 || reduced()) {
      setSweeping(false);
      setLit(null);
      sfx.tap();
      return;
    }
    setSweeping(true);
    tl.current = runSweep(ONLINE_GAMES.length, from, to, {
      duration,
      onStep: (idx, p) => {
        // a hidden game has no tile to light (unless it's where the spin lands)
        if (GAME_BY_ID[ONLINE_GAMES[idx]].hidden && idx !== to) return;
        setLit(idx);
        setLight(GAME_BY_ID[ONLINE_GAMES[idx]].gel, 0.16);
        sfx.tick(1.1 - p * 0.6);
      },
      onDone: () => {
        setSweeping(false);
        setLit(null);
        sfx.settle();
        haptic([10, 40, 18]);
      },
    });
  };

  // every phone replays the host's spin from the same plan
  useRoomEvent((e) => {
    if (e.k === "spin" && e.scope === "lobby") play(shownRef.current, e.index, e.duration);
  });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // a table opened from a game's card starts with that game up
  useEffect(() => {
    if (!isHost) return;
    try {
      const raw = sessionStorage.getItem(QUEUE);
      if (!raw) return;
      const q = JSON.parse(raw) as { code: string; game: string };
      sessionStorage.removeItem(QUEUE);
      const idx = ONLINE_GAMES.indexOf(q.game as (typeof ONLINE_GAMES)[number]);
      if (q.code === code && idx >= 0 && idx !== front) act({ a: "spin", scope: "lobby", index: idx, delta: 0, duration: 0.2 });
    } catch {
      /* fine */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  if (!room) return null;
  const id = ONLINE_GAMES[front];
  const game = GAME_BY_ID[id];
  const need = ONLINE_MIN[id];
  // (someone just watching isn't a player)
  const players = room.seats.filter((s) => !s.watch).length;
  const enough = players >= need;
  const host = nameOf(room.host);
  // the board: every game on it, and a hidden one only while it is the game up (the DJ booth)
  const onBoard = ONLINE_GAMES.map((_, i) => i).filter((i) => !GAME_BY_ID[ONLINE_GAMES[i]].hidden || i === front);

  const spin = () => {
    if (sweeping) return;
    const options = onBoard.filter((i) => players >= ONLINE_MIN[ONLINE_GAMES[i]] && i !== front && !GAME_BY_ID[ONLINE_GAMES[i]].hidden);
    const pool = options.length ? options : onBoard.filter((i) => !GAME_BY_ID[ONLINE_GAMES[i]].hidden);
    const target = pool[Math.floor(Math.random() * pool.length)];
    haptic(6);
    act({ a: "spin", scope: "lobby", index: target, delta: 1, duration: 3.4 });
  };

  return (
    <div className="lobby">
      <RoomFigures seats={room.seats} host={room.host} />
      <section className="lobby-seats" aria-label={ui("atTable", { n: room.seats.length })}>
        <ul className="faces">
          {room.seats.map((s) => {
            const mine = s.id === me;
            const tap = mine ? (account.status === "in" ? undefined : () => account.openSignIn()) : () => setPerson(s);
            const label = mine ? (account.status === "in" ? ui("you") : lang === "zh" ? "登录后显示你的头像" : "Sign in to show your photo") : s.name;
            return (
              <li key={s.id} className={`face ${s.on ? "" : "is-away"} ${mine ? "is-me" : ""}`}>
                <button type="button" className="face-dot" onClick={tap} disabled={!tap} aria-label={label}>
                  <SeatFace seat={s} size={50} />
                  {s.id === room.host && (
                    <span className="face-crown" aria-label={ui("host")}>
                      <Crown size={11} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
                <span className="face-name">{mine ? ui("you") : s.name}</span>
                {s.watch && <span className="face-watch">{lang === "zh" ? "旁观" : "Watching"}</span>}
              </li>
            );
          })}
          <li className="face face-add">
            <button type="button" className="face-dot" onClick={frame.openInvite} aria-label={ui("invite")}>
              <UserPlus size={18} />
            </button>
            <span className="face-name">{ui("invite")}</span>
          </li>
        </ul>
      </section>

      <div className="board-head">
        <h2 className="section-title">{isHost ? ui("pickGame") : ui("waitHost", { name: host })}</h2>
      </div>
      <div className={`board ${sweeping ? "is-spinning" : ""}`}>
        {onBoard.map((i) => (
          <Tile
            key={ONLINE_GAMES[i]}
            g={GAME_BY_ID[ONLINE_GAMES[i]].hidden ? { ...GAME_BY_ID[ONLINE_GAMES[i]], ready: true } : GAME_BY_ID[ONLINE_GAMES[i]]}
            i={i}
            lang={lang}
            lit={i === shown}
            disabled={!isHost || sweeping}
            onOpen={() => {
              if (i !== front) act({ a: "spin", scope: "lobby", index: i, delta: 0, duration: 0.2 });
            }}
          />
        ))}
      </div>

      <div className="lobby-dock" style={{ ["--gel" as string]: game.gel }}>
        {!enough && (
          <p className="lobby-need">
            {ui("needN", { n: need, m: players })}
            <button type="button" className="link-btn" onClick={frame.openInvite}>
              {ui("invite")}
            </button>
          </p>
        )}
        {isHost ? (
          <div className="lobby-actions">
            <button type="button" className="btn btn-ghost" onClick={spin} disabled={sweeping} aria-label={ui("spin")}>
              <Dices size={18} />
              {ui("spin")}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => act({ a: "start", game: id })} disabled={sweeping || !enough}>
              <Play size={18} />
              {lang === "zh" ? `开始 ${game.name.zh}` : `Start ${game.name.en}`}
            </button>
          </div>
        ) : (
          <p className="lobby-wait">
            <Crown size={15} strokeWidth={2.4} />
            {lang === "zh" ? `${host} 在选，现在是 ${game.name.zh}` : `${host} is picking. Up now: ${game.name.en}`}
          </p>
        )}
      </div>
      <PersonSheet seat={person} onClose={() => setPerson(null)} />
    </div>
  );
}

