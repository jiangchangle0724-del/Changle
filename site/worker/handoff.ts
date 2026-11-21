/**
 * `Handoff`: the rooms server's door for apps on their own domain that sign people in with a
 * changle.ca account (MoneyLens first, docs/moneylens/accounts-requests.md). A named entrypoint,
 * so the only way in is a service binding: no address on rooms.changle.ca leads here. The app
 * binds it in its wrangler.jsonc:
 *
 *   "services": [{ "binding": "ACCOUNTS", "service": "changle-rooms", "entrypoint": "Handoff" }]
 *
 * `redeem` trades a handoff code the main site gave (handoffCodes.ts) for the account: its id,
 * whether it's the owner's, and the nonce the code was asked with; anything else is null. `exists`
 * says which of up to 100 accounts are still here, and throws rather than answer when it can't.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { Hub } from "./hub";

type HandoffEnv = { HUB: DurableObjectNamespace<Hub> };

export class Handoff extends WorkerEntrypoint<HandoffEnv> {
  private hub() {
    return this.env.HUB.get(this.env.HUB.idFromName("hub"));
  }

  async redeem(code: string, aud: string): Promise<{ id: string; master: boolean; nonce: string } | null> {
    try {
      return await this.hub().redeemHandoff(code, aud);
    } catch (e) {
      console.error("handoff", e);
      return null;
    }
  }

  /** (an error goes back to the caller as one: a sweep that heard "none" would delete everyone's data) */
  async exists(ids: string[]): Promise<string[]> {
    return await this.hub().accountsThere(ids);
  }
}
