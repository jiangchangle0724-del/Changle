/* The site's addresses (src/router.ts). Run with `npx tsx tests/routes.test.ts` */
import { GAMES } from "../src/games/registry";
import { fromLegacyHash, gameFrom, parse, pathOf, stageOf, titleOf, type Route } from "../src/router";
import { ONLINE_GAMES } from "../src/shared/protocol";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const at = (url: string) => {
  const u = new URL(url, "https://changle.ca");
  return parse(u.pathname, u.search);
};

// every game has its own address, and they are all different
const slugs = GAMES.map((g) => g.slug);
ok(new Set(slugs).size === GAMES.length, `${GAMES.length} games, ${new Set(slugs).size} different addresses`);
ok(slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)), "every address is lowercase words joined by -");
for (const g of GAMES) {
  ok(gameFrom(g.slug) === g.id && gameFrom(g.id) === g.id, `${g.slug} and the old id ${g.id} both find ${g.id}`);
  if (g.hidden) {
    ok(same(at(`/g/${g.slug}`), { kind: "home", tab: "party" }), `/g/${g.slug} is home: a hidden game has no card`);
    const play = at(`/g/${g.slug}/play`);
    if (g.speaker) ok(same(play, { kind: "tv", game: g.id }), `/g/${g.slug}/play is its big screen`);
    else ok(g.ready ? same(play, { kind: "game", id: g.id }) : play.kind === "home", `/g/${g.slug}/play ${g.ready ? "opens the hidden game: its own address is the only way in" : "is home (not playable yet)"}`);
    continue;
  }
  ok(same(at(`/g/${g.slug}`), { kind: "home", tab: "party", game: g.id }), `/g/${g.slug} is its card over home`);
  const play = at(`/g/${g.slug}/play`);
  if (g.speaker) {
    ok(same(play, { kind: "tv", game: g.id }) && pathOf(play) === g.speaker, `/g/${g.slug}/play is its big screen, ${g.speaker}`);
    continue;
  }
  if (g.stage) {
    // on its own Worker (一起跳): its card here, and the page leaves for the stage
    ok(same(play, { kind: "home", tab: "party", game: g.id }), `/g/${g.slug}/play shows its card while it leaves`);
    ok(stageOf(`/g/${g.slug}/play`) === g.stage.screen && stageOf(`/g/${g.slug}/play/`) === g.stage.screen, `/g/${g.slug}/play goes to ${g.stage.screen}`);
    ok(stageOf(`/g/${g.slug}`) === null, `/g/${g.slug} stays on its card`);
    ok(!ONLINE_GAMES.includes(g.id as never), `${g.id} has no table game`);
    continue;
  }
  ok(g.ready ? same(play, { kind: "game", id: g.id }) : play.kind === "home", `/g/${g.slug}/play ${g.ready ? "is the game" : "is its card (not playable yet)"}`);
}

// each page's address comes back as the same page
const pages: Route[] = [
  { kind: "home", tab: "party" },
  { kind: "home", tab: "tools" },
  { kind: "home", tab: "wish" },
  { kind: "home", tab: "party", game: "truth" },
  { kind: "game", id: "rogue" },
  { kind: "room", code: "ABCD" },
  { kind: "me" },
  { kind: "me", tab: "friends" },
  { kind: "figure" },
  { kind: "admin" },
  { kind: "user", id: "uabc12345" },
  { kind: "chat", id: "uabc12345" },
  { kind: "tv" },
  { kind: "tv", code: "WXYZ" },
  { kind: "tv", code: "WXYZ", game: "punchline" },
  { kind: "tv", game: "dj" },
  { kind: "djtest" },
  { kind: "split" },
  { kind: "split", id: "doVm5qAluIJHUA77i3DeVA" },
  { kind: "tool", id: "currency" },
  { kind: "tool", id: "clock" },
  { kind: "tool", id: "price" },
];
for (const r of pages) ok(same(at(pathOf(r)), r), `${pathOf(r)} round-trips`);
// a game's own link (猜歌名's challenges) keeps its ?c=, and only one that could be one
ok(same(at("/g/name-that-tune/play?c=MXx6aC1lbg_x"), { kind: "game", id: "tune", c: "MXx6aC1lbg_x" }) && pathOf({ kind: "game", id: "tune", c: "MXx6aC1lbg_x" }) === "/g/name-that-tune/play?c=MXx6aC1lbg_x", "a game's link of its own (?c=) stays on the address");
ok(same(at("/g/name-that-tune/play?c=%3Cscript%3E"), { kind: "game", id: "tune" }) && same(at("/g/name-that-tune?c=MXx6aC1lbg"), { kind: "home", tab: "party", game: "tune" }), "a ?c= that can't be one is dropped; a card has none");

// a tool on its page; a name that isn't a tool is no page (home), and /tools stays the tab
ok(same(at("/tools/currency/"), { kind: "tool", id: "currency" }), "/tools/currency/ is the currency page");
ok(same(at("/tools/nope"), { kind: "home", tab: "party" }) && same(at("/tools/constructor"), { kind: "home", tab: "party" }), "/tools/<not a tool> is no page");
ok(same(at("/tools"), { kind: "home", tab: "tools" }), "/tools is still the Tools tab");
ok(titleOf({ kind: "tool", id: "price" }, "zh") === "单价换算 · 开席 Lazy Susan" && titleOf({ kind: "tool", id: "clock" }, "en") === "World clock · 开席 Lazy Susan", "a tool's page is titled with its name");

// addresses written another way land on the site's own spelling
ok(pathOf(at("/g/truth")) === "/g/truth-or-dare", "/g/truth (an old id) becomes /g/truth-or-dare");
ok(pathOf(at("/g/truth-or-dare/")) === "/g/truth-or-dare", "a trailing slash goes");
ok(pathOf(at("/t/abcd")) === "/t/ABCD", "a table code is upper case");
ok(pathOf(at("/tv/wxyz?g=punchline")) === "/tv/WXYZ?g=punchline", "the big screen keeps its game");
ok(pathOf(at("/nowhere")) === "/", "an address that isn't a page is home");
ok(pathOf(at("/g/no-such-game")) === "/", "a game that doesn't exist is home");
ok(same(at("/settings"), { kind: "home", tab: "party", open: "settings" }) && pathOf(at("/settings")) === "/", "/settings opens settings over home, at /");
ok(same(at("/login"), { kind: "home", tab: "party", open: "login" }) && pathOf(at("/login")) === "/", "/login opens sign-in over home, at /");
ok(at("/dev/show").kind === "home", "the development-only page isn't there outside development");
ok(pathOf(at("/dj")) === "/dj" && same(at("/dj"), { kind: "tv", game: "dj" }), "/dj is the big screen with the DJ booth up, and keeps its short address");
ok(pathOf(at("/DJ/test/")) === "/dj/test", "/dj/test is the booth's sound check");
ok(pathOf(at("/tv?g=dj-booth")) === "/dj", "/tv?g=dj-booth is /dj");
// 两清: the list of ledgers, and one ledger by an id only its phone knows
ok(pathOf(at("/split/")) === "/split", "/split/ is /split");
ok(same(at("/split/a_b-C9"), { kind: "split", id: "a_b-C9" }), "a ledger's id is letters, digits, - and _, kept as written");
ok(at("/split/short").kind === "home" && at("/split/has.dot.in.it").kind === "home" && at(`/split/${"x".repeat(65)}`).kind === "home", "what couldn't be a ledger's id isn't a page");
ok(at("/split/abcdef/more").kind === "home", "nor is anything under a ledger");

// links from before the change
const legacy: [string, string | null][] = [
  ["#/", "/"],
  ["#/g/truth", "/g/truth-or-dare/play"],
  ["#/g/trip", "/g/been-there/play"],
  ["#/g/nothing", "/"],
  ["#/r/abcd", "/t/ABCD"],
  ["#/tv", "/tv"],
  ["#/tv/wxyz", "/tv/WXYZ"],
  ["#/tv?g=punchline", "/tv?g=punchline"],
  ["#/me", "/me"],
  ["#/me/friends", "/me/friends"],
  ["#/admin", "/admin"],
  ["#/u/uabc12345", "/u/uabc12345"],
  ["#/chat/uabc12345", "/chat/uabc12345"],
  ["#/tools", "/tools"],
  ["#/wish", "/wish"],
  ["#/dev/show?x=1", "/dev/show?x=1"],
  ["#/tv?g=dj", "/dj"],
  ["#/dj/test", "/dj/test"],
  ["#anchor", null],
  ["", null],
];
for (const [hash, want] of legacy) ok(fromLegacyHash(hash) === want, `${hash || "(no hash)"} → ${want}`);

// titles
ok(titleOf({ kind: "home", tab: "party" }, "zh") === "开席 Lazy Susan", "home's title");
ok(titleOf({ kind: "game", id: "truth" }, "en") === "真心话大冒险 Truth or Dare · 开席 Lazy Susan", "a game's title has both names");
ok(titleOf({ kind: "room", code: "ABCD" }, "zh").startsWith("桌号 ABCD"), "a table's title in Chinese");
ok(titleOf({ kind: "room", code: "ABCD" }, "en").startsWith("Table ABCD"), "a table's title in English");
ok(titleOf({ kind: "split" }, "zh").startsWith("两清") && titleOf({ kind: "split", id: "abcdef" }, "en").startsWith("All Square"), "两清's title, in each language");

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
