// The songbook: each song's first beat in its video, as someone tapped along to it once on a speaker
// page (对拍), kept for every room from then on. One Durable Object for the whole site (named
// "songs"), a handful of numbers in its storage.
//   GET  /party/api/songs        { [songId]: { firstBeatMs, taps, spreadMs, at } }
//   POST /party/api/songs/ID     { firstBeatMs, taps, spreadMs } from the speaker page
import { DurableObject } from "cloudflare:workers";
import type { Tapped } from "./tapped";

export class SongBook extends DurableObject<Env> {
  async all(): Promise<Record<string, Tapped>> {
    const map = await this.ctx.storage.list<Tapped>();
    return Object.fromEntries(map);
  }

  async set(songId: string, t: Tapped): Promise<void> {
    await this.ctx.storage.put(songId, t);
  }
}
