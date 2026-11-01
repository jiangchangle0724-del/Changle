import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./store";
import { setSoundEnabled } from "./lib/sound";
import { initAudio, startMusic, stopMusic } from "./lib/sfx";
import { gsap, reduced, setLight } from "./lib/anim";
import { Home, type HomeTab } from "./home/Home";
import { GAME_BY_ID, isGameId, type GameId } from "./games/registry";
import { AccountProvider, useAccount } from "./account/AccountContext";
import { PerkNews } from "./account/PerkNews";
import { ScreenGuard } from "./components/ScreenGuard";
import { SiteGate } from "./components/SiteGate";
import { api } from "./lib/api";
// each game loads when it is opened: the front door stays light
const Rogue13 = lazy(() => import("./games/Rogue13").then((m) => ({ default: m.Rogue13 })));
const TruthDare = lazy(() => import("./games/TruthDare").then((m) => ({ default: m.TruthDare })));
const Undercover = lazy(() => import("./games/Undercover").then((m) => ({ default: m.Undercover })));
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
// the big screen (a TV or computer showing a table) lives outside the phone frame
const TvApp = lazy(() => import("./tv/TvApp").then((m) => ({ default: m.TvApp })));
const ShowPreview = import.meta.env.DEV ? lazy(() => import("./party/punchline/show/Preview").then((m) => ({ default: m.ShowPreview }))) : null;
// online tables load only when someone sits at one: the front door stays light
const OnlineRoom = lazy(() => import("./online/OnlineRoom").then((m) => ({ default: m.OnlineRoom })));
// accounts: profile, someone else's page, chat, and the sign-in sheet
const MePage = lazy(() => import("./account/MePage").then((m) => ({ default: m.MePage })));
const UserPage = lazy(() => import("./account/UserPage").then((m) => ({ default: m.UserPage })));
const ChatPage = lazy(() => import("./account/ChatPage").then((m) => ({ default: m.ChatPage })));
const AdminPage = lazy(() => import("./account/AdminPage").then((m) => ({ default: m.AdminPage })));
const SignInSheet = lazy(() => import("./account/SignIn").then((m) => ({ default: m.SignInSheet })));

type Route =
  | { kind: "home"; tab: HomeTab }
  | { kind: "game"; id: GameId }
  | { kind: "room"; code: string }
  | { kind: "me" }
  | { kind: "admin" }
  | { kind: "user"; id: string }
  | { kind: "chat"; id: string }
  | { kind: "tv"; code?: string; game?: GameId };

// changle.ca/tv is easy to type on a TV remote: it means the big screen
{
  const m = /^\/tv(?:\/([A-Za-z0-9]{4}))?\/?$/i.exec(window.location.pathname);
  if (m) window.history.replaceState(null, "", `/${window.location.search}#/tv${m[1] ? `/${m[1].toUpperCase()}` : ""}`);
}

function parse(hash: string): Route {
  const tv = /^#\/tv(?:\/([A-Za-z0-9]{4}))?(?:\?g=([a-z]+))?/.exec(hash);
  if (tv) return { kind: "tv", code: tv[1]?.toUpperCase(), game: tv[2] && isGameId(tv[2]) ? tv[2] : undefined };
  const g = /^#\/g\/([a-z]+)/.exec(hash);
  if (g && isGameId(g[1]) && GAME_BY_ID[g[1]].ready) return { kind: "game", id: g[1] };
  const r = /^#\/r\/([A-Za-z0-9]{1,8})/.exec(hash);
  if (r) return { kind: "room", code: r[1].toUpperCase() };
  if (/^#\/me\b/.test(hash)) return { kind: "me" };
  if (/^#\/admin\b/.test(hash)) return { kind: "admin" };
  const u = /^#\/u\/(u[a-z0-9]{6,20})/.exec(hash);
  if (u) return { kind: "user", id: u[1] };
  const c = /^#\/chat\/(u[a-z0-9]{6,20})/.exec(hash);
  if (c) return { kind: "chat", id: c[1] };
  if (/^#\/tools/.test(hash)) return { kind: "home", tab: "tools" };
  if (/^#\/wish/.test(hash)) return { kind: "home", tab: "wish" };
  return { kind: "home", tab: "party" };
}

function hashOf(r: Route) {
  switch (r.kind) {
    case "home":
      return r.tab === "party" ? "#/" : `#/${r.tab}`;
    case "room":
      return `#/r/${r.code}`;
    case "game":
      return `#/g/${r.id}`;
    case "me":
      return "#/me";
    case "admin":
      return "#/admin";
    case "user":
      return `#/u/${r.id}`;
    case "chat":
      return `#/chat/${r.id}`;
    case "tv":
      return `#/tv${r.code ? `/${r.code}` : ""}${r.game ? `?g=${r.game}` : ""}`;
  }
}

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

function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (r: Route, replace = false) => {
    const h = hashOf(r);
    if (replace) window.location.replace(h);
    else window.location.hash = h;
  };
  return { route, go };
}

function Shell() {
  const { route, go } = useHashRoute();
  const { sound, music } = useStore();
  const { signInOpen } = useAccount();
  const [signInUsed, setSignInUsed] = useState(false);
  useEffect(() => {
    if (signInOpen) setSignInUsed(true);
  }, [signInOpen]);
  useSoloHistory(route);
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

  const back = () => {
    if (window.history.length > 1 && window.location.hash !== "" && window.location.hash !== "#/") window.history.back();
    else go({ kind: "home", tab: "party" });
  };

  let screen: React.ReactNode;
  if (route.kind === "home") screen = <Home tab={route.tab} onTab={(tab) => go({ kind: "home", tab }, true)} onOpenGame={(id) => go({ kind: "game", id })} />;
  else if (route.kind === "room") screen = <OnlineRoom key={route.code} code={route.code} onExit={() => window.location.replace("#/")} />;
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
        screen = <Tune onBack={back} />;
        break;
      case "euchre":
        screen = <Euchre onBack={back} />;
        break;
      case "trip":
        screen = <TripSolo onBack={back} />;
        break;
      default:
        screen = null;
    }
  }

  const key =
    route.kind === "home"
      ? "home"
      : route.kind === "room"
        ? `room-${route.code}`
        : route.kind === "game"
          ? route.id
          : route.kind === "me" || route.kind === "admin" || route.kind === "tv"
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
  // development only: the Punchline show with made-up data
  if (ShowPreview && window.location.hash.startsWith("#/dev/show"))
    return (
      <Suspense fallback={null}>
        <ShowPreview key={window.location.hash} />
      </Suspense>
    );
  return (
    <SiteGate
      signIn={
        signInUsed && (
          <Suspense fallback={null}>
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
            <Suspense fallback={null}>{screen}</Suspense>
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
    if (reduced() || !ref.current) return;
    window.scrollTo(0, 0);
    // no transform may stay behind: it would pin every full-screen layer in the game to this box
    gsap.fromTo(ref.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, clearProps: "transform,opacity" });
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
