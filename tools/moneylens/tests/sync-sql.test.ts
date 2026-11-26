/**
 * The store's tests once more, every one of them, against the server's own code for a vault's
 * chunks (src/server/chunks.ts) on SQLite, in place of the rule book in memory. The real server
 * has to pass the same tests as the rule book it was written from.
 *
 *   npx tsx --test tests/sync-sql.test.ts
 */
import "./onsql";
import "./sync.test";
