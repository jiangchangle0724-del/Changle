/**
 * `Member`: the rooms server's door for the tools' Workers to ask about membership
 * (docs/membership.md). A named entrypoint, so the only way in is a service binding: no address
 * on rooms.changle.ca leads here. A tool binds it in its wrangler.jsonc:
 *
 *   "services": [{ "binding": "MEMBER", "service": "changle-rooms", "entrypoint": "Member" }]
 *
 * and, once it knows who is asking (the account id its own sign-in check gave it), calls:
 *
 *   await env.MEMBER.use(uid, "split")   // before the counted step: { ok, member, left }
 *   await env.MEMBER.status(uid)         // to show 还剩 N 次: { member, master, left }
 *
 * `use` counts the use when it says ok (members and the owner are never counted); when it says
 * not ok, the tool doesn't do the step and points the person to changle.ca/member. The tools
 * counted are in src/shared/member.ts (COUNTED); any other name, an unknown account or a banned
 * one gets `{ ok: false }`. If the hub can't be reached, `use` throws: the tool decides (a
 * friendly "try again" is better than letting it through or blocking for good).
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { Standing, UseResult } from "../src/shared/member";
import type { Hub } from "./hub";

type MemberEnv = { HUB: DurableObjectNamespace<Hub> };

export class Member extends WorkerEntrypoint<MemberEnv> {
  private hub() {
    return this.env.HUB.get(this.env.HUB.idFromName("hub"));
  }

  async use(uid: string, tool: string): Promise<UseResult> {
    return this.hub().memberUse(String(uid), String(tool));
  }

  async status(uid: string): Promise<Standing | null> {
    return this.hub().memberStatus(String(uid));
  }
}
