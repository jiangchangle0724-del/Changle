// On top of the Env that `wrangler types` generates from wrangler.jsonc (worker-configuration.d.ts):
// the secrets, set in the dashboard and never in the config, and the switch tests and `npm run dev` use.
interface Env {
  TICKETMASTER_KEY?: string;
  /** Optional: a key for handing the libraries' pages over from a run outside GitHub (src/handoff.ts). The GitHub job signs in with GitHub's own token (src/oidc.ts). */
  EVENTS_HANDOFF_KEY?: string;
  /** "1": the run goes at any hour (local runs, tests). */
  ALLOW_TEST?: string;
}
