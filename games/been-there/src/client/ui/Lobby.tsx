import qrcode from "qrcode-generator";
import { useState } from "preact/hooks";
import { MAX_TEAMS, MAX_TEAM_SIZE, type RoomView } from "../../room/protocol";
import type { Mode, StyleId } from "../../engine";
import { colon, t, type Key } from "../i18n";
import { prefs } from "../prefs";
import { send } from "../store";
import { Btn, TEAM_COLORS, TEAM_LETTERS, TeamFace, styleName, teamLabel } from "./common";

export const joinUrl = (code: string) => `${location.origin}/r/${code}`;

export function Qr({ text, size = 180 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return <div class="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}

export function RoomCode({ code, demo }: { code: string; demo?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (demo) return null;
  return (
    <div class="roomcode">
      <span class="muted">{t("room")}</span>
      <b class="num">{code}</b>
      <Btn
        kind="quiet"
        onClick={() => {
          void navigator.clipboard?.writeText(joinUrl(code)).then(() => {
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
  return (
    <main class="lobby">
      <RoomCode code={v.code} demo={demo} />
      {!demo && (
        <details class="qrbox">
          <summary>QR</summary>
          <Qr text={joinUrl(v.code)} />
        </details>
      )}
      {demo && (
        <header class="demohead">
          <h1>{t("title")}</h1>
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
                    .map((m) => (m ? `${m.name}${m.id === v.you.id ? `（${t("you")}）` : ""}${m.online ? "" : ` · ${t("away")}`}` : ""))
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
                  <small>{t(`modeHint_${m}` as Key)}</small>
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
          <Btn kind="primary" wide disabled={!ready} onClick={() => send({ t: "start" })}>
            {t("start")}
          </Btn>
          {!ready && <p class="hint">{t("needTwo")}</p>}
        </section>
      ) : (
        <p class="muted center">{t("waitHost")}</p>
      )}
    </main>
  );
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
