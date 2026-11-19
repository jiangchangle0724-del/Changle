-- A merchant asking to open a shop (docs/tuan.md: 申请入驻, 站长审核). The shop is made at once,
-- still 'pending' (no page of its own, its group buys hidden, no orders), run by the account that
-- asked; this row is the asking: what they told the site's owner, which wording of the declaration
-- they ticked and when (each time they send it), and the owner's answer.
CREATE TABLE applications (
  shop_id TEXT PRIMARY KEY REFERENCES shops (id) ON DELETE CASCADE,
  email TEXT NOT NULL,                  -- the account that asked, lower case
  note TEXT NOT NULL DEFAULT '',        -- for the site's owner alone: how they sell now, where, how to reach them
  declared TEXT NOT NULL,               -- the wording of the declaration they ticked (src/engine/apply.ts, DECLARATION)
  state TEXT NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'returned', 'accepted', 'declined')),
  reply TEXT NOT NULL DEFAULT '',       -- the owner's word on sending it back, or on saying no
  sent_at INTEGER NOT NULL,             -- when it was last sent, the declaration ticked with it
  decided_at INTEGER                    -- when the owner last answered
);
CREATE INDEX applications_by_state ON applications (state, sent_at);
CREATE INDEX applications_by_email ON applications (email);

-- The site's owner as seen here, for the mail about a new application. The rooms server says who
-- the owner is (src/server/who.ts); the email is kept when the owner opens their home here.
CREATE TABLE owners (
  email TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);
