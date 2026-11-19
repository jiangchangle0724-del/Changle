// In Chinese a name (a team's, a city's) sits right against the Chinese around it, with no space;
// next to a number, a sum of money or a name in letters the space stays (client/i18n.ts t).
import assert from "node:assert/strict";
import { test } from "node:test";
import { getLang, t } from "../src/client/i18n";

test("a city or a team between Chinese: no space either side", () => {
  assert.equal(getLang(), "zh");
  assert.equal(t("jumpAsk", { space: "开普敦" }), "中轴线：跳到正对面的开普敦？");
  assert.equal(t("log_land", { team: "红队", space: "开罗" }), "红队到了开罗");
  assert.equal(t("log_build", { team: "红队", space: "开罗" }), "红队在开罗盖了一栋");
  assert.equal(t("waitingFor", { who: "红队" }), "等红队…");
  // (two names next to each other: the one after is a sentence of its own)
  assert.equal(t("rule_veniceGates", { owner: "蓝队", result: "升起挡潮闸" }), "蓝队升起挡潮闸");
});

test("next to a number, money, a name in letters or a separator, the space stays", () => {
  assert.equal(t("log_rent", { team: "红队", to: "蓝队", amount: "$50" }), "红队付给蓝队租金 $50");
  assert.equal(t("world_houses", { team: "红队", n: 2, amount: "$100" }), "红队在那里的 2 栋房子没了，保险赔了 $100");
  assert.equal(t("waitingFor", { who: "Steve" }), "等 Steve …");
  assert.equal(t("log_roll", { team: "Team A", dice: "4 + 3" }), "Team A 掷出 4 + 3");
  assert.equal(t("permitMore", { space: "开罗" }), "多走一格 → 开罗");
  assert.equal(t("dealBetween", { a: "红队", b: "蓝队" }), "红队 ⇄ 蓝队");
  // (only names: a weather word is a label's value, and keeps its space)
  assert.equal(t("wxNow", { wx: "雨 12°C" }), "此刻 雨 12°C");
});
