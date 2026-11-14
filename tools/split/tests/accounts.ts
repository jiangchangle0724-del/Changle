// The changle.ca accounts the tests sign in with. The rooms server (site/worker) isn't part of this
// tool, so the tests, and local runs, use a stand-in for it (tests/rooms/worker.ts) that knows these
// sessions and nothing else.

/** A session, as the site keeps one on a phone: what a page sends as "Authorization: Bearer …". */
export const SESSION = {
  steve: "test-session-steve-00000000",
  wang: "test-session-wang-000000000",
  /** a session the rooms server has never heard of */
  nobody: "test-session-nobody-0000000",
  /** the rooms server can't answer for this one (503) */
  down: "test-session-down-000000000",
} as const;

export const ACCOUNTS: Record<string, { id: string; name: string; email: string } | "down"> = {
  [SESSION.steve]: { id: "usteve0000001", name: "Steve", email: "steve@example.com" },
  [SESSION.wang]: { id: "uwang00000001", name: "小王", email: "wang@example.com" },
  [SESSION.down]: "down",
};

/**
 * Besides those, any session that is "test-account-" and then a name (twenty characters or more in
 * all) is the account of that name: the page's checks in a browser (site/scripts/split_check.ts)
 * give every phone one of its own, so no account runs out of its day's ledgers.
 */
export const ANYONE = /^test-account-([A-Za-z0-9_-]{7,60})$/;
