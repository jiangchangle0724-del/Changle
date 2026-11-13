// The songbook: each song's first beat as a room once tapped along to it (对拍, 找拍子), from before
// every song's beat was measured in its video (2026-11-12). Nothing reads or writes it any more. The
// class stays because its Durable Object (wrangler.jsonc's SONGBOOK) stays until a migration deletes
// it, and that deletes what it holds too: Steve's to decide (docs/briefs/dance.md).
import { DurableObject } from "cloudflare:workers";

export class SongBook extends DurableObject<Env> {}
