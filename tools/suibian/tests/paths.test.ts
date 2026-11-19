// Round 1's two ways into the menu: by cuisine, or by what you feel like eating.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENU } from "../src/engine";
import { PATHS, groupState, leafText, setAll } from "../src/client/paths";

test("by cuisine, every menu item is in exactly one group", () => {
  const ids = PATHS.cuisine.flatMap((g) => g.leaves.map((l) => l.id));
  assert.deepEqual([...ids].sort(), [...MENU].sort());
});

test("both ways only lead to menu items, each group once, each item once per group, in both languages", () => {
  for (const groups of Object.values(PATHS)) {
    assert.equal(new Set(groups.map((g) => g.id)).size, groups.length);
    for (const g of groups) {
      assert.ok(g.leaves.length > 0, g.id);
      assert.equal(new Set(g.leaves.map((l) => l.id)).size, g.leaves.length, g.id);
      assert.ok(g.text.zh && g.text.en && g.emoji, g.id);
      for (const l of g.leaves) {
        assert.ok(MENU.includes(l.id), `${g.id}: ${l.id}`);
        assert.ok(leafText(l).zh && leafText(l).en, `${g.id}: ${l.id}`);
      }
    }
  }
});

test("by dish, Steve's examples are there: seafood, stir-fry, noodles, BBQ, hot pot, steak", () => {
  const kinds = PATHS.dish.map((g) => g.id);
  for (const k of ["seafood", "stirfry", "noodles", "bbq", "hotpot", "steak"]) assert.ok(kinds.includes(k), k);
});

test("a group is all yes, all no, nothing, or some of each; setting it sets every item in it", () => {
  const korean = PATHS.cuisine.find((g) => g.id === "korean")!;
  assert.equal(groupState(korean, {}).state, "none");
  const yes = setAll({ ramen: "ban" }, ["korean", "kbbq"], "like");
  assert.deepEqual(yes, { ramen: "ban", korean: "like", kbbq: "like" });
  assert.equal(groupState(korean, yes).state, "like");
  assert.deepEqual(groupState(korean, { kbbq: "like", korean: "ban" }), { state: "some", likes: 1, bans: 1 });
  assert.equal(groupState(korean, setAll(yes, ["korean", "kbbq"], "ban")).state, "ban");
  assert.deepEqual(setAll(yes, ["korean", "kbbq"], "none"), { ramen: "ban" });
});
