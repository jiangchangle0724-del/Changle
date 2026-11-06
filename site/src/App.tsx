import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StoreProvider, useStore } from "./store";
import { setSoundEnabled } from "./lib/sound";
import { initAudio, startMusic, stopMusic } from "./lib/sfx";
import { EASE, play, setLight } from "./lib/motion";
import { Home } from "./home/Home";
import { GAME_BY_ID, type GameId } from "./games/registry";
import type * as LoadingShapes from "./games/GameLoading";
import { GameRun } from "./games/GameRun";
import { back, go, titleOf, useRoute, type Route } from "./router";
import { AccountProvider, useAccount } from "./account/AccountContext";
import { PerkNews } from "./account/PerkNews";
import { ScreenGuard } from "./components/ScreenGuard";
import { SiteGate } from "./components/SiteGate";
import { api } from "./lib/api";
// each game loads when it is opened: the front door stays light
const Rogue13 = lazy(() => import("./games/Rogue13").then((m) => ({ default: m.Rogue13 })));
const TruthDare = lazy(() => import("./games/TruthDare").then((m) => ({ default: m.TruthDare })));
const Undercover = lazy(() => import("./games/Undercover").then((m) => ({ default: m.Undercover })));
const StraightFace = lazy(() => import("./party/straightface/StraightFace").then((m) => ({ default: m.StraightFace })));
const DrawGuess = lazy(() => import("./games/DrawGuess").then((m) => ({ default: m.DrawGuess })));
const KingsGame = lazy(() => import("./games/KingsGame").then((m) => ({ default: m.KingsGame })));
const PromptDecks = lazy(() => import("./games/PromptDecks").then((m) => ({ default: m.PromptDecks })));
const Dice789 = lazy(() => import("./games/Dice789").then((m) => ({ default: m.Dice789 })));
const WheelOfFate = lazy(() => import("./games/WheelOfFate").then((m) => ({ default: m.WheelOfFate })));
const Superlatives = lazy(() => import("./party/superlatives/Superlatives").then((m) => ({ default: m.Superlatives })));
const Drama = lazy(() => import("./party/drama/Drama").then((m) => ({ default: m.Drama })));
const Punchline = lazy(() => import("./party/punchline/Punchline").then((m) => ({ default: m.Punchline })));
const Postit = lazy(() => import("./party/postit/Postit").then((m) => ({ default: m.Postit })));
const Freeze = lazy(() => import("./party/freeze/Freeze").then((m) => ({ default: m.Freeze })));
const Limbo = lazy(() => import("./party/limbo/Limbo").then((m) => ({ default: m.Limbo })));
const Tune = lazy(() => import("./party/tune/Tune").then((m) => ({ default: m.Tune })));
const Euchre = lazy(() => import("./party/euchre/Euchre").then((m) => ({ default: m.Euchre })));
const TripSolo = lazy(() => import("./party/trip/TripSolo").then((m) => ({ default: m.TripSolo })));
const HideSolo = lazy(() => import("./party/hide/HideSolo").then((m) => ({ default: m.HideSolo })));
// 最后一张 plays only online: its own address opens a table for it
const LastCardStart = lazy(() => import("./party/lastcard/Start").then((m) => ({ default: m.LastCardStart })));
// the big screen (a TV or computer showing a table) lives outside the phone frame
const TvApp = lazy(() => import("./tv/TvApp").then((m) => ({ default: m.TvApp })));
const DjTestPage = lazy(() => import("./party/dj/TestPage").then((m) => ({ default: m.DjTestPage })));
const ShowPreview = import.meta.env.DEV ? lazy(() => import("./party/punchline/show/Preview").then((m) => ({ default: m.ShowPreview }))) : null;
// online tables load only when someone sits at one: the front door stays light
const OnlineRoom = lazy(() => import("./online/OnlineRoom").then((m) => ({ default: m.OnlineRoom })));
// accounts: profile, someone else's page, chat, and the sign-in sheet
const MePage = lazy(() => import("./account/MePage").then((m) => ({ default: m.MePage })));
const UserPage = lazy(() => import("./account/UserPage").then((m) => ({ default: m.UserPage })));
const ChatPage = lazy(() => import("./account/ChatPage").then((m) => ({ default: m.ChatPage })));
const AdminPage = lazy(() => import("./account/AdminPage").then((m) => ({ default: m.AdminPage })));
const SignInSheet = lazy(() => import("./account/SignIn").then((m) => ({ default: m.SignInSheet })));

/** A one-phone game that ran a minute or more goes into the signed-in player's history. */
function useSoloHistory(route: Route) {
  const { status } = useAccount();
  const { players } = useStore();
  const run = useRef<{ game: GameId; started: number } | null>(null);
  const names = useRef<string[]>([]);
  names.current = players.map((p) => p.name).filter(Boolean);
  const signedIn = status === "in";
  const gameId = route.kind === "game" ? route.id : null;
  useEffect(() => {
    if (!gameId || !signedIn) return;
    run.current = { game: gameId, started: Date.now() };
    let sent = false;
    const finish = () => {
      const r = run.current;
      if (!r || sent) return;
      const ms = Date.now() - r.started;
      if (ms < 60_000) return;
      sent = true;
      void api("/me/history", { body: { game: r.game, players: names.current.slice(0, 15), minutes: Math.round(ms / 60_000) } }).catch(() => {});
    };
    window.addEventListener("pagehide", finish);
    return () => {
      window.removeEventListener("pagehide", finish);
      finish();
      run.current = null;
    };
  }, [gameId, signedIn]);
}

function Shell() {
  const route = useRoute();
  const { sound, music, players, lang } = useStore();
  // a game opened by a link with fewer players than it needs on this phone: its card on the home
  // page first, to add people (or play online), instead of a game that can't work (a link of the
  // game's own, a 猜歌名 challenge, opens the game: one person can take it on)
  const short = route.kind === "game" && !route.c && players.length < (GAME_BY_ID[route.id].solo?.min ?? GAME_BY_ID[route.id].minPlayers);
  const { signInOpen, openSignIn } = useAccount();
  // 再来一局 in a game's tally: the same game again from nothing (a new key mounts it afresh)
  const [restarts, setRestarts] = useState(0);
  const gel = route.kind === "game" ? GAME_BY_ID[route.id].gel : "";
  const run = useMemo(() => ({ gel, restart: () => setRestarts((n) => n + 1) }), [gel]);
  // a game's or a page's shape while its own file downloads (GameLoading, PageLoading): a small file of
  // its own, fetched once this page has settled (at once when it opens on a game or a page of its own in
  // the phone frame; the big screen never shows it), so the front door doesn't carry it; if even that
  // fails, the old blank wait
  const [Loading, setLoading] = useState<typeof LoadingShapes | null>(null);
  const opensElsewhere = useRef(route.kind !== "home" && route.kind !== "tv" && route.kind !== "djtest" && route.kind !== "dev");
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => void import("./games/GameLoading").then((m) => live && setLoading(m), () => {}),
      opensElsewhere.current ? 0 : 1500,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);
  const [signInUsed, setSignInUsed] = useState(false);
  useEffect(() => {
    if (signInOpen) setSignInUsed(true);
  }, [signInOpen]);
  // the address is the card's, not the game's, while people are missing
  useEffect(() => {
    if (short && route.kind === "game") go({ kind: "home", tab: "party", game: route.id }, true);
  }, [short, route]);
  // changle.ca/login: the sign-in sheet over home, once
  const wantsLogin = route.kind === "home" && route.open === "login";
  const loginShown = useRef(false);
  useEffect(() => {
    if (!wantsLogin || loginShown.current) return;
    loginShown.current = true;
    openSignIn();
  }, [wantsLogin, openSignIn]);
  useEffect(() => {
    document.title = titleOf(route, lang);
  }, [route, lang]);
  useSoloHistory(short ? { kind: "home", tab: "party" } : route);
  useEffect(() => initAudio(), []);
  useEffect(() => setSoundEnabled(sound), [sound]);
  useEffect(() => {
    const sync = () => {
      if (music && sound && document.visibilityState === "visible") startMusic();
      else stopMusic();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      stopMusic();
    };
  }, [music, sound]);

  useEffect(() => {
    if (route.kind === "game") setLight(GAME_BY_ID[route.id].gel);
  }, [route]);

  // ‹ goes back only to a page of this site: a game opened from a link elsewhere (a chat, another
  // site) goes to the home page instead of leaving the site (router.ts: back)

  let screen: React.ReactNode;
  if (route.kind === "home" || short)
    screen = (
      <Home
        tab={route.kind === "home" ? route.tab : "party"}
        game={route.kind === "home" ? route.game : route.kind === "game" ? route.id : undefined}
        openSettings={route.kind === "home" && route.open === "settings"}
        onTab={(tab) => go({ kind: "home", tab }, true)}
        onCard={(id) => (id ? go({ kind: "home", tab: "party", game: id }) : back())}
        // the card's entry becomes the game's: ‹ in the game goes home, as before
        onPlay={(id) => go({ kind: "game", id }, true)}
      />
    );
  else if (route.kind === "room") screen = <OnlineRoom key={route.code} code={route.code} onExit={() => go({ kind: "home", tab: "party" }, true)} />;
  else if (route.kind === "me") screen = <MePage onBack={back} />;
  else if (route.kind === "admin") screen = <AdminPage onBack={back} />;
  else if (route.kind === "user") screen = <UserPage key={route.id} id={route.id} onBack={back} />;
  else if (route.kind === "chat") screen = <ChatPage key={route.id} id={route.id} onBack={back} />;
  else if (route.kind === "game") {
    switch (route.id) {
      case "rogue":
        screen = <Rogue13 onBack={back} />;
        break;
      case "truth":
        screen = <TruthDare onBack={back} />;
        break;
      case "undercover":
        screen = <Undercover onBack={back} />;
        break;
      case "straightface":
        screen = <StraightFace onBack={back} />;
        break;
      case "draw":
        screen = <DrawGuess onBack={back} />;
        break;
      case "king":
        screen = <KingsGame onBack={back} />;
        break;
      case "prompts":
        screen = <PromptDecks onBack={back} />;
        break;
      case "dice":
        screen = <Dice789 onBack={back} />;
        break;
      case "wheel":
        screen = <WheelOfFate onBack={back} />;
        break;
      case "superlatives":
        screen = <Superlatives onBack={back} />;
        break;
      case "drama":
        screen = <Drama onBack={back} />;
        break;
      case "punchline":
        screen = <Punchline onBack={back} />;
        break;
      case "postit":
        screen = <Postit onBack={back} />;
        break;
      case "freeze":
        screen = <Freeze onBack={back} />;
        break;
      case "limbo":
        screen = <Limbo onBack={back} />;
        break;
      case "tune":
        screen = <Tune onBack={back} challenge={route.c} />;
        break;
      case "euchre":
        screen = <Euchre onBack={back} />;
        break;
      case "trip":
        screen = <TripSolo onBack={back} />;
        break;
      case "hide":
        screen = <HideSolo onBack={back} />;
        break;
      case "lastcard":
        screen = <LastCardStart onBack={back} />;
        break;
      default:
        screen = null;
    }
  }

  const key =
    route.kind === "home" || short
      ? "home"
      : route.kind === "room"
        ? `room-${route.code}`
        : route.kind === "game"
          ? `${route.id}.${restarts}`
          : route.kind === "me" || route.kind === "admin" || route.kind === "tv" || route.kind === "dev" || route.kind === "djtest"
            ? route.kind
            : `${route.kind}-${route.id}`;
  if (route.kind === "tv")
    return (
      <SiteGate signIn={null}>
        <Suspense fallback={null}>
          <TvApp key={`${route.code ?? "new"}:${route.game ?? ""}`} code={route.code} game={route.game} />
        </Suspense>
      </SiteGate>
    );
  if (route.kind === "djtest")
    return (
      <SiteGate signIn={null}>
        <Suspense fallback={null}>
          <DjTestPage />
        </Suspense>
      </SiteGate>
    );
  // development only: the Punchline show with made-up data
  if (ShowPreview && route.kind === "dev")
    return (
      <Suspense fallback={null}>
        <ShowPreview key={route.search} />
      </Suspense>
    );
  return (
    <SiteGate
      signIn={
        signInUsed && (
          <Suspense fallback={signInOpen && Loading && <Loading.SignInLoading lang={lang} onClose={() => openSignIn(false)} />}>
            <SignInSheet />
          </Suspense>
        )
      }
    >
      <div className="room-light" aria-hidden="true" />
      <PerkNews />
      <main className="app" style={route.kind === "game" ? ({ ["--gel" as string]: GAME_BY_ID[route.id].gel } as React.CSSProperties) : undefined}>
        <Scene sceneKey={key}>
          <ScreenGuard key={key} onHome={() => go({ kind: "home", tab: "party" })}>
            {route.kind === "game" && !short ? (
              // a game: its shape while its file downloads, and what its shell can ask of the page
              <Suspense fallback={Loading && <Loading.GameLoading id={route.id} lang={lang} />}>
                <GameRun.Provider value={run}>{screen}</GameRun.Provider>
              </Suspense>
            ) : (
              <Suspense fallback={Loading && <Loading.PageLoading lang={lang} />}>{screen}</Suspense>
            )}
          </ScreenGuard>
        </Scene>
      </main>
    </SiteGate>
  );
}

/** Each screen arrives with a short rise; the previous one is simply replaced. */
function Scene({ sceneKey, children }: { sceneKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!ref.current) return;
    window.scrollTo(0, 0);
    // no transform may stay behind (play() leaves none): it would pin every full-screen layer in the game to this box
    play(ref.current, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: EASE.settle });
  }, [sceneKey]);
  return (
    <div className="screen" ref={ref} key={sceneKey}>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AccountProvider>
        <Shell />
      </AccountProvider>
    </StoreProvider>
  );
}
