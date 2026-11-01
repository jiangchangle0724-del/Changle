// On top of the Env that `wrangler types` generates from wrangler.jsonc (worker-configuration.d.ts):
// the secret, set in the dashboard and never in the config, and the switch tests and `npm run dev` use.
interface Env {
  TICKETMASTER_KEY?: string;
  /** "1": the run goes at any hour (local runs, tests). */
  ALLOW_TEST?: string;
}
