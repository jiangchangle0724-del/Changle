import { API } from "../../config";
import { api, sessionToken } from "../../lib/api";
import type { SelfUser } from "../AccountContext";
import { blobToB64, cutFigure } from "./pics";

/**
 * A figure saved before figures were cut out for the games' stages: this phone fetches it, cuts
 * it out and sends that back, once. (Nothing is drawn again; nothing counts against the month.)
 */
export async function cutSavedFigure(): Promise<SelfUser | null> {
  const tok = sessionToken();
  if (!tok) return null;
  const r = await fetch(`${API}/me/figure/full`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
  if (!r.ok) return null;
  const cut = await cutFigure(await r.blob());
  if (!cut) return null;
  const d = await api<{ user: SelfUser }>("/me/figure/cut", { method: "PUT", body: { cut: await blobToB64(cut), cutMime: cut.type } });
  return d.user;
}
