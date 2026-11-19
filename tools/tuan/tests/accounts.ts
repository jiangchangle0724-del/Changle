// The changle.ca accounts the tests sign in with. The rooms server isn't part of this tool, so the
// tests run a stand-in for it (tests/rooms/worker.ts) that knows these sessions and nothing else.

/** A session, as the site keeps one on a phone: what a page sends as "Authorization: Bearer …". */
export const SESSION = {
  /** the site's owner */
  owner: "test-session-owner-0000000",
  /** runs the test shop */
  leader: "test-session-leader-000000",
  /** has an account, runs nothing */
  visitor: "test-session-visitor-00000",
  /** have accounts, run nothing: each asks to open a shop, once (an account asks for one shop; the tests share a database) */
  asker1: "test-session-asker1-000000",
  asker2: "test-session-asker2-000000",
  asker3: "test-session-asker3-000000",
  asker4: "test-session-asker4-000000",
  asker5: "test-session-asker5-000000",
  asker6: "test-session-asker6-000000",
  /** the phone-in-a-browser tests: one for each browser, which share a database too */
  askerChromium: "test-session-asker-chromium",
  askerWebkit: "test-session-asker-webkit00",
  /** a session the rooms server has never heard of */
  nobody: "test-session-nobody-000000",
  /** the rooms server can't answer for this one (503) */
  down: "test-session-down-00000000",
} as const;

export const ACCOUNTS: Record<string, { id: string; name: string; email: string; master: boolean } | "down"> = {
  [SESSION.owner]: { id: "uowner01", name: "Steve", email: "owner@example.com", master: true },
  [SESSION.leader]: { id: "uleader1", name: "团长", email: "leader@example.com", master: false },
  [SESSION.visitor]: { id: "uvisit01", name: "路人", email: "visitor@example.com", master: false },
  ...Object.fromEntries(
    (["asker1", "asker2", "asker3", "asker4", "asker5", "asker6", "askerChromium", "askerWebkit"] as const).map((name) => [SESSION[name], { id: `u${name}`, name: `店主 ${name.slice(5)}`, email: `${name.toLowerCase()}@example.com`, master: false }]),
  ),
  [SESSION.down]: "down",
};
