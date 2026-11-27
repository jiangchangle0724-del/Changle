/**
 * The server as a device reaches it (VAULT-4): `Remote` (vault/protocol.ts) over `fetch`, to this
 * origin's own /api, with the session's cookie, which the browser sends and this code never sees.
 *
 * A call that throws means the answer is not known, never that the answer was no (protocol.ts):
 * so everything that is not a readable answer from the store throws, and `sync` reports it as
 * "offline", to be tried again. One such case the screen has to tell from a lost connection: the
 * server saying there is no session (the 30 minutes, the 12 hours, signed out from another
 * device) or that the account is not let in. Then `signedOut` holds the status, until a call is
 * answered again, and the screen sends the person to sign in. And one more: the server saying
 * this session has not shown that it can open the vault (it locked, or never unlocked: sync is
 * for unlocked sessions only). Then `locked` is true, and the screen asks for the passphrase.
 */
import { packPush, unpackPulled, unpackPushed } from "../server/wire";
import type { Pulled, Pushed, Remote, Write } from "../vault/protocol";

/** The server has no session for this browser, or lets this account in no longer. */
export class SignedOut extends Error {
  constructor(readonly status: number) {
    super("signed out");
    this.name = "SignedOut";
  }
}

/** The server has a session for this browser, and the session has not unlocked the vault. */
export class Locked extends Error {
  constructor() {
    super("locked");
    this.name = "Locked";
  }
}

export class HttpRemote implements Remote {
  /** 401 or 403 when the server's last answer was that this browser has no session here, or that its account is not let in; null otherwise. */
  signedOut: number | null = null;
  /** True when the server's last answer was that this session has not unlocked the vault. */
  locked = false;

  /** `ask`: `fetch`, or what stands in for it in a test. `base`: where the server's /api is. */
  constructor(
    private readonly ask: typeof fetch = (input, init) => fetch(input, init),
    private readonly base = "/api",
  ) {}

  private async post(action: string, type: string, body: Uint8Array | string): Promise<Uint8Array> {
    const answer = await this.ask(`${this.base}/${action}`, { method: "POST", headers: { "Content-Type": type }, body: body as BodyInit, credentials: "same-origin", cache: "no-store", redirect: "error" });
    if (answer.status === 401 || answer.status === 403) {
      this.signedOut = answer.status;
      throw new SignedOut(answer.status);
    }
    if (answer.status === 423) {
      this.locked = true;
      throw new Locked();
    }
    if (answer.status !== 200) throw new Error(`sync: ${answer.status}`);
    this.signedOut = null;
    this.locked = false;
    return new Uint8Array(await answer.arrayBuffer());
  }

  async pull(vault: string, since: number): Promise<Pulled> {
    const pulled = unpackPulled(await this.post("sync/pull", "application/json", JSON.stringify({ vault, since })));
    if (!pulled) throw new Error("sync: not an answer");
    return pulled;
  }

  async push(vault: string, writes: readonly Write[]): Promise<Pushed> {
    const pushed = unpackPushed(await this.post("sync/push", "application/octet-stream", packPush(vault, writes)));
    if (!pushed) throw new Error("sync: not an answer");
    return pushed;
  }
}
