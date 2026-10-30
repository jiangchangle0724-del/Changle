import { motion } from "motion/react";
import type { Player } from "../store";

/** Tap a name. Used wherever a game says "pick someone". */
export function PlayerPicker({
  players,
  onPick,
  selected,
  exclude,
  tone = "lacquer",
}: {
  players: Player[];
  onPick: (p: Player) => void;
  selected?: string[];
  exclude?: string[];
  tone?: "lacquer" | "porcelain";
}) {
  return (
    <div className="picker" role="group">
      {players.map((p, i) => {
        const off = exclude?.includes(p.id);
        const on = selected?.includes(p.id);
        return (
          <motion.button
            key={p.id}
            type="button"
            className={`chip ${tone === "porcelain" ? "chip-porcelain" : ""} ${on ? "chip-selected" : ""}`}
            disabled={off}
            onClick={() => onPick(p)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: off ? 0.35 : 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.95 }}
          >
            {p.name}
          </motion.button>
        );
      })}
    </div>
  );
}
