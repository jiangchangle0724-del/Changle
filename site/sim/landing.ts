import { BOARD } from "../src/shared/trip/data";
import { defaultConfig } from "../src/shared/trip/engine";
import { STYLES } from "../src/shared/trip/bots";
import { run, summarize } from "./trip_sim";
const s = summarize(run(defaultConfig(), 4, 2000, () => [0, 1, 2, 3].map(() => STYLES.balanced), 5), 4);
BOARD.forEach((sp, i) => console.log(String(i).padStart(2), (sp.k === "city" ? sp.id : sp.k).padEnd(12), (s.landing[i] * 100).toFixed(2) + "%"));
console.log("builds/game", s.builds.toFixed(1), "trades/game", s.trades.toFixed(2), "auctions/game", s.auctions.toFixed(1));
