// Who the host means to ask, who of them is still to answer, and when to answer by (A3, 2026-11-14).
import assert from "node:assert/strict";
import test from "node:test";
import { cleanInvited, crewOf, deadlineAt, deadlineDays, deadlineLabel, inviteText, missing, nudgeText, sameName, splitNames, vancouverMinutes, withNames } from "../src/engine";
import { EventRoom, MAX_PEOPLE, memoryStore, NAME_MAX } from "../src/room/event";

const NOW = Date.UTC(2026, 10, 13, 2, 0); // 12 November, 7 p.m. in Vancouver
const TODAY = "2026-11-12";
const SAT = "2026-11-21";
const SUN = "2026-11-22";

test("the names a host types: one a line, or between 、，,;； — never at a space", () => {
  assert.deepEqual(splitNames("阿May、小王，老李\nMary Ann, Bob;  Carl ；Dee\r\n\n、"), ["阿May", "小王", "老李", "Mary Ann", "Bob", "Carl", "Dee"]);
  assert.deepEqual(splitNames("   "), []);
  // the same name however it was typed: case, full-width letters, spaces around and between
  assert.ok(sameName("may", "May"));
  assert.ok(sameName("Ｍａｙ", "May"));
  assert.ok(sameName(" Mary  Ann ", "mary ann"));
  assert.ok(!sameName("小王", "王"));
});

test("the list as kept: cleaned like any name, each name once, 40 at most", () => {
  assert.deepEqual(cleanInvited([" 阿May ", "阿may", "小王", "", 3, "一个非常非常非常非常非常长的名字还在继续"], NAME_MAX, MAX_PEOPLE), ["阿May", "小王", "一个非常非常非常非常非常长的名字"]);
  assert.deepEqual(cleanInvited([], NAME_MAX, MAX_PEOPLE), []);
  assert.equal(cleanInvited("阿May、小王", NAME_MAX, MAX_PEOPLE), null, "a list, not text");
  assert.equal(
    cleanInvited(
      Array.from({ length: 41 }, (_, i) => `p${i}`),
      NAME_MAX,
      MAX_PEOPLE,
    ),
    null,
  );
  assert.equal(
    cleanInvited(
      Array.from({ length: 41 }, () => "same"),
      NAME_MAX,
      MAX_PEOPLE,
    )!.length,
    1,
    "repeats don't count",
  );
});

test("who is still to answer: on the list with no row, in the list's order", () => {
  const people = [{ name: "May" }, { name: "老李" }, { name: "没在名单上的" }];
  assert.deepEqual(missing(["小王", "阿May", "may", "老李", "阿强"], people), ["小王", "阿May", "阿强"]);
  assert.deepEqual(missing([], people), [], "no list: nobody is known to be missing");
  assert.deepEqual(missing(["May"], [{ name: "ｍａｙ" }]), []);
});

test("the deadline in words, and the days it can fall on, in Vancouver time", () => {
  const thu8pm = deadlineAt("2026-11-19", 20 * 60);
  assert.equal(thu8pm, Date.UTC(2026, 10, 20, 3, 0), "Vancouver is seven hours behind UTC all year");
  assert.equal(vancouverMinutes(thu8pm), 1200);
  assert.equal(deadlineLabel(thu8pm, "zh"), "11月19日 周四 20:00");
  assert.equal(deadlineLabel(thu8pm, "en"), "Thu, Nov 19, 20:00");
  assert.equal(deadlineLabel(deadlineAt("2026-11-19", 9 * 60 + 5), "zh"), "11月19日 周四 9:05");
  assert.deepEqual(deadlineDays("2026-11-19", ["2026-11-21", "2026-11-22"]), ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  assert.deepEqual(deadlineDays("2026-11-23", ["2026-11-21", "2026-11-22"]), ["2026-11-23"], "every day asked has gone: today");
  // in the group messages: the page's words as they are
  const words = { title: "周末火锅", url: "https://changle.ca/when/abcdefgh", deadline: deadlineLabel(thu8pm, "zh") };
  assert.match(nudgeText({ ...words, missing: ["小王"] }, "plain", "zh"), /^「周末火锅」\n小王，.*请在11月19日 周四 20:00前填好。\nhttps:\/\/changle\.ca\/when\/abcdefgh$/);
  assert.match(inviteText({ ...words, days: [SAT, SUN], deadline: deadlineLabel(thu8pm, "en") }, "plain", "en"), /Please reply by Thu, Nov 19, 20:00\.\nhttps:/);
});

test("the room keeps the host's list; only the host changes it", () => {
  const room = new EventRoom(memoryStore());
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "periods", hostHash: "host", adminHash: "a", adminSalt: "s", now: NOW, today: TODAY });
  assert.deepEqual(room.state()!.invited, []);
  assert.deepEqual(room.hostAct("host", { do: "edit", invited: ["阿May", " 小王 ", "阿may"] }, NOW), { ok: true });
  assert.deepEqual(room.state()!.invited, ["阿May", "小王"]);
  assert.deepEqual(room.hostAct("guest", { do: "edit", invited: [] }, NOW), { ok: false, error: "forbidden" });
  for (const bad of ["阿May", null, Array.from({ length: MAX_PEOPLE + 1 }, (_, i) => `p${i}`)]) {
    assert.deepEqual(room.hostAct("host", { do: "edit", invited: bad }, NOW), { ok: false, error: "bad" }, JSON.stringify(bad));
  }
  assert.deepEqual(room.state()!.invited, ["阿May", "小王"], "a bad list changes nothing");
  assert.deepEqual(room.hostAct("host", { do: "edit", invited: [] }, NOW), { ok: true });
  assert.deepEqual(room.state()!.invited, []);
});

test("a gathering kept before the list came in opens with none", () => {
  const store = memoryStore();
  const room = new EventRoom(store);
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "half", hostHash: "host", adminHash: "a", adminSalt: "s", now: NOW, today: TODAY });
  delete (store.meta as { invited?: string[] }).invited;
  assert.deepEqual(new EventRoom(store).state()!.invited, []);
});

test("the same people next time: the list first, then whoever else answered, each once, never the host", () => {
  const people = [{ name: "Steve" }, { name: "老李" }, { name: "阿may" }, { name: "妈妈" }];
  assert.deepEqual(crewOf(["阿May", "小王"], people, "Steve"), ["阿May", "小王", "老李", "妈妈"]);
  assert.deepEqual(crewOf([], people, null), ["Steve", "老李", "阿may", "妈妈"], "a host who didn't fill in has no name to leave out");
  assert.deepEqual(crewOf(["a", "b", "c"], [], null, 2), ["a", "b"]);
  assert.deepEqual(withNames(["Tom", "阿may"], ["阿May", "小王"]), ["Tom", "阿may", "小王"], "brought onto what's typed: the same name isn't added twice");
});
