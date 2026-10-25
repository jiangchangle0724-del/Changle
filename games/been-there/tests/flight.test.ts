// The big screen's plane flies from the last city a team landed on to the next one. The engine names
// that city on the landing itself, so the flight doesn't depend on how much of the log a view carries.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD, STYLES, act, configFor, decide, newBrain, newGame, whoMustAct } from "../src/engine";

test("every city landing names the team's previous city, from the second one on", () => {
  const n = 4;
  const s = newGame(configFor({ n, mode: "target" }), ["a", "b", "c", "d"], 11, { events: true });
  const brains = Array.from({ length: n }, (_, i) => newBrain(STYLES.balanced, i + 1));
  const last: (number | undefined)[] = Array(n).fill(undefined);
  let cityLandings = 0;
  for (let guard = 0; !s.over && guard < 20_000; guard++) {
    const before = s.events!.length;
    const p = whoMustAct(s)[0];
    act(s, p, decide(s, p, brains));
    for (const e of s.events!.slice(before)) {
      if (e.t !== "land" || BOARD[e.at].k !== "city") continue;
      assert.equal(e.from, last[e.p], `team ${e.p} landing on ${e.at}`);
      last[e.p] = e.at;
      cityLandings += 1;
    }
  }
  assert.ok(cityLandings > 40, `enough landings to mean something (${cityLandings})`);
});
