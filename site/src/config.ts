/** Site-wide settings Steve may change. */

/** Interac e-Transfer address shown in the tip jar. Empty shows "being set up". */
export const TIP_EMAIL = "jiangchangle0724@hotmail.com";

/** The API and table server (Cloudflare Worker). Set VITE_ROOMS_URL for a local server. */
const ENV = ((import.meta.env.VITE_ROOMS_URL as string | undefined) ?? "").trim();
export const SERVER = (ENV || "wss://rooms.changle.ca").replace(/\/$/, "");
export const API = `${SERVER.replace(/^ws/, "http")}/api`;
