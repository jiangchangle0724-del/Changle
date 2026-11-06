import qrcode from "qrcode-generator";
import { useState } from "preact/hooks";
import { MAX_TEAMS, MAX_TEAM_SIZE, TIMING, TRIVIA_PRIZE, TRIVIA_WRONG, type RoomView } from "../../room/protocol";
import { START_CASH, START_CASH_CHOICES, TARGETS, type CashChoice, type Mode, type StyleId } from "../../engine";
import { backToTable, joinUrl, onChangle, tableFrom } from "../base";
import { colon, money, t, type Key } from "../i18n";
import { prefs } from "../prefs";
import { send } from "../store";
import { WatchTv } from "./Settings";
import { Btn, GameTitle, TEAM_COLORS, TEAM_LETTERS, TeamFace, styleName, teamLabel } from "./common";

export function Qr({ text, size = 180 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return <div class="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}

/** The code people join with: the changle.ca table's when the game came from one, else the room's. */
export function RoomCode({ code, table, demo }: { code: string; table: string | null; demo?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (demo) return null;
  return (
    <div class="roomcode">
      <span class="muted">{table ? t("tableCode") : t("room")}</span>
      <b class={table ? "tablecode" : "num"}>{table ?? code}</b>
      <Btn
        kind="quiet"
        onClick={() => {
          void navigator.clipboard?.writeText(joinUrl(code, table)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? t("copied") : t("shareLink")}
      </Btn>
    </div>
  );
}

export function Lobby({ v, demo }: { v: RoomView; demo?: boolean }) {
  const me = v.members.find((m) => m.id === v.you.id);
  const [name, setName] = useState(me?.name ?? prefs.name);
  const host = v.you.host;
  const ready = v.teams.filter((x) => x.bot || x.members.length > 0).length >= 2;
  const unassigned = v.members.filter((m) => !m.team && m.role === "player");
  const table = demo ? null : tableFrom(v);
  return (
    <main class="lobby">
      {table && (
        <Btn kind="ghost" class="back-table" onClick={() => backToTable(table)}>
          ‹ {t("backToTable")}
        </Btn>
      )}
      <RoomCode code={v.code} table={table} demo={demo} />
      {!demo && (
        <details class="qrbox">
          <summary>QR</summary>
          <Qr text={joinUrl(v.code, table)} />
        </details>
      )}
      {demo && onChangle() && (
        <Btn kind="ghost" class="back-table" onClick={() => location.assign("/")}>
          ‹ {t("backToSite")}
        </Btn>
      )}
      {demo && (
        <header class="demohead">
          <GameTitle />
          <p class="hint">{t("localDemo")}</p>
        </header>
      )}
      {!demo && (
        <label class="field">
          <span>{t("yourName")}</span>
          <input
            value={name}
            maxLength={16}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onBlur={() => {
              prefs.name = name;
              send({ t: "name", name });
            }}
          />
        </label>
      )}
      <h2>{t("teams")}</h2>
      {!v.you.team && !demo && <p class="hint">{t("noTeamYet")}</p>}
      <ul class="teams">
        {v.teams.map((team) => {
          const mineTeam = v.you.team === team.id;
          return (
            <li key={team.id} class={mineTeam ? "mine" : ""} style={{ "--team": TEAM_COLORS[team.color] }}>
              <TeamFace color={team.color} size={40} />
              <span class="letter">{TEAM_LETTERS[team.color]}</span>
              <div class="grow">
                {mineTeam || (host && !team.bot) ? <TeamName team={team} /> : <b>{teamLabel(team)}</b>}
                <p class="muted">
                  {team.members
                    .map((id) => v.members.find((m) => m.id === id))
                    .map((m) => (m ? `${m.name}${m.id === v.you.id ? t("youTag") : ""}${m.online ? "" : ` · ${t("away")}`}` : ""))
                    .join("、")}
                </p>
              </div>
              {team.bot && host && (
                <span class="bot-tools">
                  <select value={team.bot} onChange={(e) => send({ t: "bot", op: "style", team: team.id, style: (e.target as HTMLSelectElement).value as StyleId })}>
                    {(["balanced", "tycoon", "saver", "jetsetter", "gambler"] as StyleId[]).map((st) => (
                      <option key={st} value={st}>
                        {styleName(st)}
                      </option>
                    ))}
                  </select>
                  <Btn kind="quiet" onClick={() => send({ t: "bot", op: "remove", team: team.id })}>
                    {t("removeBot")}
                  </Btn>
                </span>
              )}
              {!team.bot && !mineTeam && !demo && team.members.length < MAX_TEAM_SIZE && (
                <Btn onClick={() => send({ t: "team", op: "join", team: team.id })}>{t("joinTeam")}</Btn>
              )}
            </li>
          );
        })}
      </ul>
      <div class="choices">
        {(!v.you.team || demo) && v.teams.length < MAX_TEAMS && (
          <Btn onClick={() => send({ t: "team", op: "create" })}>{demo ? t("demoAdd") : t("newTeam")}</Btn>
        )}
        {v.you.team && !demo && (
          <Btn kind="quiet" onClick={() => send({ t: "team", op: "leave" })}>
            {t("leaveTeam")}
          </Btn>
        )}
        {host && v.teams.length < MAX_TEAMS && <Btn onClick={() => send({ t: "bot", op: "add" })}>{t("addBot")}</Btn>}
      </div>
      {unassigned.length > 0 && !demo && (
        <p class="muted">
          {t("spectators")}{colon()}{unassigned.map((m) => m.name).join("、")}
        </p>
      )}
      {!demo && <LobbyWatch v={v} />}
      {host ? (
        <section class="host">
          <h2>{t("hostControls")}</h2>
          <fieldset class="modes">
            <legend>{t("length")}</legend>
            {(["target", 15, 60] as Mode[]).map((m) => (
              <label key={String(m)} class="radio">
                <input type="radio" name="mode" checked={v.settings.mode === m} onChange={() => send({ t: "settings", mode: m })} />
                <span>
                  <b>{t(`mode_${m}` as Key)}</b>
                  <small>{t(`modeHint_${m}` as Key, targets(v))}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label class="radio">
            <input type="checkbox" checked={v.settings.party} onChange={(e) => send({ t: "settings", party: (e.target as HTMLInputElement).checked })} />
            <span>
              <b>{t("party")}</b>
              <small>{t("partyHint")}</small>
            </span>
          </label>
          <label class="radio">
            <input type="checkbox" checked={!!v.settings.news} onChange={(e) => send({ t: "settings", news: (e.target as HTMLInputElement).checked })} />
            <span>
              <b>{t("news")}</b>
              <small>{t("newsHint")}</small>
            </span>
          </label>
          <label class="radio">
            <input type="checkbox" checked={v.settings.trivia !== false} onChange={(e) => send({ t: "settings", trivia: (e.target as HTMLInputElement).checked })} />
            <span>
              <b>{t("triviaSwitch")}</b>
              <small>{t("triviaSwitchHint", { mins: TIMING.triviaEvery / 60_000, amount: money(TRIVIA_PRIZE), fine: money(TRIVIA_WRONG) })}</small>
            </span>
          </label>
          <MoreRules v={v} />
          <Btn kind="primary" wide disabled={!ready} onClick={() => send({ t: "start" })}>
            {t("start")}
          </Btn>
          {!ready && <p class="hint">{t("needTwo")}</p>}
        </section>
      ) : (
        <>
          <p class="muted center">{t("waitHost")}</p>
          {rulesNow(v).length > 0 && <p class="muted center">{t("moreRulesNow", { list: rulesNow(v).join(" · ") })}</p>}
        </>
      )}
    </main>
  );
}

/** A game to the target: the targets with the host's starting cash (it moves them). */
function targets(v: RoomView) {
  const diff = START_CASH_CHOICES[v.settings.cash ?? "normal"] - START_CASH;
  return { amount: money(TARGETS.more + diff), two: money(TARGETS.two + diff) };
}

/** The more rules the host has changed from the step-3 game's, in a few words. */
function rulesNow(v: RoomView): string[] {
  const st = v.settings;
  const cash = st.cash ?? "normal";
  return [
    ...(cash !== "normal" ? [`${t("startCash")} ${money(START_CASH_CHOICES[cash])}`] : []),
    ...(st.auctions === false ? [t("rule_noAuctions")] : []),
    ...(st.hideCash ? [t("rule_hideCash")] : []),
    ...(st.world === false ? [t("rule_noWorld")] : []),
  ];
}

/** 更多规则: the starting cash, auctions, hidden money, world upheaval. Folded away; what's changed shows on its fold. */
function MoreRules({ v }: { v: RoomView }) {
  const st = v.settings;
  const cash = st.cash ?? "normal";
  const now = rulesNow(v);
  return (
    <details class="more-rules">
      <summary>
        {t("moreRules")}
        {now.length > 0 && <small>{t("moreRulesNow", { list: now.join(" · ") })}</small>}
      </summary>
      <fieldset class="modes">
        <legend>{t("startCash")}</legend>
        {(["low", "normal", "high"] as CashChoice[]).map((c) => (
          <label key={c} class="radio">
            <input type="radio" name="cash" checked={cash === c} onChange={() => send({ t: "settings", cash: c })} />
            <span>
              <b>{money(START_CASH_CHOICES[c])}</b>
              <small>{t(`cash_${c}` as Key)}</small>
            </span>
          </label>
        ))}
        {st.mode === "target" && <p class="hint">{t("cashTargetMoves")}</p>}
      </fieldset>
      <label class="radio">
        <input type="checkbox" checked={st.auctions !== false} onChange={(e) => send({ t: "settings", auctions: (e.target as HTMLInputElement).checked })} />
        <span>
          <b>{t("auctionsSwitch")}</b>
          <small>{t("auctionsSwitchHint")}</small>
        </span>
      </label>
      <label class="radio">
        <input type="checkbox" checked={!!st.hideCash} onChange={(e) => send({ t: "settings", hideCash: (e.target as HTMLInputElement).checked })} />
        <span>
          <b>{t("hideCashSwitch")}</b>
          <small>{t("hideCashSwitchHint")}</small>
        </span>
      </label>
      <label class="radio">
        <input type="checkbox" checked={st.world !== false} onChange={(e) => send({ t: "settings", world: (e.target as HTMLInputElement).checked })} />
        <span>
          <b>{t("worldSwitch")}</b>
          <small>{t("worldSwitchHint")}</small>
        </span>
      </label>
    </details>
  );
}

/** 旁观（接电视） in the lobby: this device can become the room's big screen instead of joining a team. */
function LobbyWatch({ v }: { v: RoomView }) {
  const [open, setOpen] = useState(false);
  return <WatchTv v={v} open={open} onOpen={() => setOpen(true)} />;
}

function TeamName({ team }: { team: RoomView["teams"][number] }) {
  const [name, setName] = useState(team.name);
  return (
    <input
      class="teamname"
      value={name}
      maxLength={16}
      aria-label={t("renameTeam")}
      onInput={(e) => setName((e.target as HTMLInputElement).value)}
      onBlur={() => name !== team.name && send({ t: "team", op: "rename", name, team: team.id })}
    />
  );
}
