// On top of the Env that `wrangler types` generates from wrangler.jsonc (worker-configuration.d.ts):
// the secrets, set in the dashboard and never in the config, and the switch tests and `npm run dev` use.
interface Env {
  TICKETMASTER_KEY?: string;
  /** The key the GitHub job hands the libraries' pages over with (src/handoff.ts); the same value as the repository secret. */
  EVENTS_HANDOFF_KEY?: string;
  /** "1": the run goes at any hour (local runs, tests). */
  ALLOW_TEST?: string;
}
