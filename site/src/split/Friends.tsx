/**
 * Friends on changle.ca, in 两清: inviting them from a ledger's invitation sheet, picking them while
 * starting a ledger, and the invitations from them waiting on the page of ledgers. What happens
 * underneath is invites.ts; the server keeps an invitation in the friend's account
 * (tools/split/src/room/protocol.ts).
 */
import { Check, CircleAlert, LogIn, UserPlus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { Avatar } from "../account/Avatar";
import type { Lang } from "../i18n";
import { go } from "../router";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import type { Ledger } from "./core";
import { askedOf, friendsNow, inviteFriend, memberFor, useInvites, type Asked } from "./invites";
import { inviteNet } from "./net";
import { Sentences } from "./parts";
import type { Invitation, Person } from "./shape";
import { heldOf, meOf, useSaved } from "./store";
import { shown } from "./sync";
import { iAm, joinLedger } from "./syncing";
import { say, type Word } from "./words";

/** How many friends show before the rest are asked for: in the invitation sheet, and as pills while starting a ledger. */
const FIRST_ROWS = 3;
const FIRST_PILLS = 6;
/** A face beside a friend's name: the size of a person's face in 两清's lists (split.css, .split-face). */
const FACE = 32;

/**
 * The signed-in account's friends, read again each time `on` turns on (a sheet opening): null until
 * they have been read once, "away" when they couldn't be. (What was read last time shows meanwhile,
 * and stays while the sheet slides away.)
 */
function useFriends(on: boolean) {
  const { status } = useAccount();
  const [friends, setFriends] = useState<Person[] | "away" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!on || status !== "in") return;
    let live = true;
    void friendsNow().then((got) => {
      if (live) setFriends((was) => got ?? (Array.isArray(was) ? was : "away"));
    });
    return () => {
      live = false;
    };
  }, [on, status, attempt]);
  return { friends, status, retry: () => setAttempt((n) => n + 1) };
}

/** Why an invitation to a friend didn't go, said under the list (null: it went, or nothing has been tried). */
const TROUBLE: Partial<Record<Asked, Word>> = { away: "friendAway", friends: "friendNotFriend", locked: "friendLocked", limit: "friendLimit", signin: "friendSignIn" };

/**
 * The invitation sheet's friends: each friend on changle.ca with a button that invites them (and
 * says once it has). Signed out, a line saying signing in brings them; with none, a line saying
 * where they come from. `ready`: the server has the ledger (until then nobody can be invited).
 * `onLeave`: the sheet closes, for the site's sign-in, which is drawn under any sheet still open.
 */
export function FriendsToInvite({ ledger, lang, open, ready, onLeave }: { ledger: Ledger; lang: Lang; open: boolean; ready: boolean; onLeave: () => void }) {
  const { openSignIn } = useAccount();
  const { friends, status, retry } = useFriends(open);
  useInvites();
  const [all, setAll] = useState(false);
  const [trouble, setTrouble] = useState<{ who: string; asked: Asked } | null>(null);
  // each time it opens: the first few, and nothing gone wrong
  useLayoutEffect(() => {
    if (!open) return;
    setAll(false);
    setTrouble(null);
  }, [open]);
  if (status === "loading") return null;
  if (status !== "in")
    return (
      <section className="split-friends" aria-labelledby="split-friends-head">
        <h3 id="split-friends-head" className="split-friends-head">
          {say(lang, "friendsHead")}
        </h3>
        <p className="split-note">{say(lang, "friendsSignIn")}</p>
        <Button
          tone="quiet"
          size="sm"
          icon={LogIn}
          onClick={() => {
            onLeave();
            openSignIn();
          }}
        >
          {say(lang, "signIn")}
        </Button>
      </section>
    );
  const invite = async (friend: Person) => {
    setTrouble(null);
    const { asked } = await inviteFriend(ledger.id, friend, lang, memberFor(ledger, friend.name));
    if (TROUBLE[asked]) setTrouble({ who: friend.name, asked });
  };
  const why = trouble && TROUBLE[trouble.asked];
  return (
    <section className="split-friends" aria-labelledby="split-friends-head">
      <h3 id="split-friends-head" className="split-friends-head">
        {say(lang, "friendsHead")}
      </h3>
      {friends === null ? (
        <p className="split-note" role="status">
          {say(lang, "friendsReading")}
        </p>
      ) : friends === "away" ? (
        <>
          <p className="split-note">{say(lang, "friendsAway")}</p>
          <Button tone="quiet" size="sm" onClick={retry}>
            {say(lang, "retry")}
          </Button>
        </>
      ) : !friends.length ? (
        <p className="split-note">{say(lang, "friendsNone")}</p>
      ) : (
        <>
          <ul className="split-people">
            {(all ? friends : friends.slice(0, FIRST_ROWS)).map((f) => {
              const asked = askedOf(ledger.id, f.id);
              const done = asked === "sent" || asked === "in";
              return (
                <li key={f.id} className="split-person">
                  <Avatar uid={f.id} name={f.name} av={f.av} ac={f.ac} size={FACE} />
                  <span className="split-person-name">{f.name}</span>
                  <Button tone="quiet" size="sm" icon={done ? Check : UserPlus} busy={asked === "busy"} disabled={!ready || done} onClick={() => void invite(f)}>
                    {say(lang, asked === "sent" ? "friendInvited" : asked === "in" ? "friendIn" : "inviteShort")}
                  </Button>
                </li>
              );
            })}
          </ul>
          {!all && friends.length > FIRST_ROWS && (
            <Button tone="quiet" size="sm" onClick={() => setAll(true)}>
              {say(lang, "friendsMore", { n: friends.length - FIRST_ROWS })}
            </Button>
          )}
          <p className={`split-note${why ? " is-off" : ""}`} role="status">
            {why && <CircleAlert aria-hidden="true" />}
            {/* (the note is a row with room for a mark: its sentences sit together in one item of it) */}
            {why ? (
              say(lang, why, { who: trouble.who })
            ) : (
              <span>
                <Sentences text={say(lang, "friendsNote")} lang={lang} />
              </span>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Starting a ledger: friends on changle.ca to pick, besides names typed. One picked is one of the
 * people in it, by their name there, and gets an invitation once the ledger starts. (Only signed in,
 * and only when there are friends: otherwise nothing here at all.)
 */
export function PickFriends({ lang, open, picked, onPick, note }: { lang: Lang; open: boolean; picked: Set<string>; onPick: (friend: Person) => void; note: string | null }) {
  const { friends, status } = useFriends(open);
  const [all, setAll] = useState(false);
  if (status !== "in" || !Array.isArray(friends) || !friends.length) return null;
  const rest = friends.length - FIRST_PILLS;
  return (
    <fieldset className="split-choice">
      <legend className="field-label">{say(lang, "pickFriends")}</legend>
      <div className="split-pills">
        {(all ? friends : friends.slice(0, FIRST_PILLS)).map((f) => (
          // the light is on the ones picked, and only there
          <Pill key={f.id} kind="toggle" tone={picked.has(f.id) ? "tool" : "neutral"} selected={picked.has(f.id)} onToggle={() => onPick(f)}>
            {f.name}
          </Pill>
        ))}
        {!all && rest > 0 && (
          <Button tone="quiet" size="sm" onClick={() => setAll(true)}>
            {say(lang, "friendsMore", { n: rest })}
          </Button>
        )}
      </div>
      {/* (a friend who couldn't be picked says why, in place of what picking does) */}
      {(note || picked.size > 0) && (
        <p className={`split-note${note ? " is-off" : ""}`} role="status">
          {note ?? (
            <span>
              <Sentences text={say(lang, "pickedNote")} lang={lang} />
            </span>
          )}
        </p>
      )}
    </fieldset>
  );
}

/**
 * The invitations from friends waiting for the signed-in account (none signed out), read as the page
 * of ledgers comes up. One to a ledger this phone holds already isn't among them. `gone`: one taken
 * off the page (turned down).
 */
export function useInvitations(account: string | null) {
  const saved = useSaved();
  const [list, setList] = useState<{ account: string; invitations: Invitation[] } | null>(null);
  useEffect(() => {
    if (!account) return;
    let live = true;
    void inviteNet.waiting().then((got) => {
      if (live && got.data) setList({ account, invitations: got.data });
    });
    return () => {
      live = false;
    };
  }, [account]);
  const held = new Set(saved.held.map((h) => h.server.id));
  const waiting = list && list.account === account ? list.invitations.filter((i) => !held.has(i.ledger)) : [];
  const gone = (ledger: string) => setList((l) => l && { ...l, invitations: l.invitations.filter((i) => i.ledger !== ledger) });
  return { waiting, gone };
}

/**
 * The page of ledgers, signed in: the invitations from friends, each with who sent it, to join (the
 * ledger opens as one opened by its link would, as the person it is for when they said) or to turn
 * down.
 */
export function Invitations({ lang, waiting, gone }: { lang: Lang } & ReturnType<typeof useInvitations>) {
  if (!waiting.length) return null;
  return (
    <section className="split-invitations" aria-labelledby="split-invitations-head">
      <h2 id="split-invitations-head" className="split-section-head">
        {say(lang, "invitesHead")}
      </h2>
      <ul className="split-ledgers">
        {waiting.map((i) => (
          <li key={i.ledger}>
            <InvitationCard invitation={i} lang={lang} onGone={() => gone(i.ledger)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitationCard({ invitation: i, lang, onGone }: { invitation: Invitation; lang: Lang; onGone: () => void }) {
  const [state, setState] = useState<"opening" | "key" | "gone" | "away" | null>(null);
  const join = async () => {
    setState("opening");
    const how = await joinLedger(i.ledger, i.key);
    if (how === "in") {
      // (the person it is for, if they are still in it and this phone isn't someone else there)
      const h = heldOf(i.ledger);
      if (i.member && h && !meOf(i.ledger) && shown(h).members.some((m) => m.id === i.member)) iAm(i.ledger, i.member);
      go({ kind: "split", id: i.ledger });
      return;
    }
    // (one that will never open it again goes from the account's list; the card stays to say why, until it is turned down)
    if (how !== "away") void inviteNet.drop(i.ledger);
    setState(how);
  };
  const problem = state === "key" ? "inviteStale" : state === "gone" ? "inviteGone" : state === "away" ? "joinAway" : null;
  return (
    <div className="split-invitation">
      <Avatar uid={i.from.id} name={i.from.name || i.name} av={i.from.av} ac={i.from.ac} size={FACE} />
      <div className="split-invitation-text">
        <strong>{i.name}</strong>
        <span>{say(lang, "invitedBy", { who: i.from.name || "?" })}</span>
        {problem && (
          <span className="split-ledger-flag is-loud">
            <CircleAlert aria-hidden="true" />
            {say(lang, problem)}
          </span>
        )}
        {state !== "key" && state !== "gone" && (
          <Button tone="quiet" size="sm" busy={state === "opening"} onClick={() => void join()}>
            {say(lang, "inviteJoin")}
          </Button>
        )}
      </div>
      <Button
        tone="icon"
        icon={X}
        label={say(lang, "inviteNo", { name: i.name })}
        onClick={() => {
          void inviteNet.drop(i.ledger);
          onGone();
        }}
      />
    </div>
  );
}
