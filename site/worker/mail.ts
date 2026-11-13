/**
 * `Mail`: the rooms server's door for mail other changle.ca Workers send (notice.ts says what goes
 * in and what comes back). It is a named entrypoint, so the only way in is a service binding: no
 * address on rooms.changle.ca leads here, and the Resend key stays on this Worker alone. A caller
 * binds it in its wrangler.jsonc and calls `env.MAIL.send(...)`:
 *
 *   "services": [{ "binding": "MAIL", "service": "changle-rooms", "entrypoint": "Mail" }]
 *
 * The hub does the work (hub.ts, `notice`): the recipient has to be an account here, each app has
 * a day's allowance (notice.ts, NOTICES_A_DAY), and the mail goes out through the same code as the
 * sign-in codes. A caller that gets "full" shouldn't try again today; "failed" says why in `why`.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { Hub } from "./hub";
import type { Notice, Sent } from "./notice";

type MailEnv = { HUB: DurableObjectNamespace<Hub> };

export class Mail extends WorkerEntrypoint<MailEnv> {
  async send(notice: Notice): Promise<Sent> {
    try {
      return await this.env.HUB.get(this.env.HUB.idFromName("hub")).notice(notice);
    } catch (e) {
      console.error("mail", e);
      return { status: "failed", why: "down" };
    }
  }
}
