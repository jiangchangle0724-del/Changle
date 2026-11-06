import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";
import { Sheet } from "./Sheet";

export function PlayersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { players, addPlayer, removePlayer, setQuickSeats, ui } = useStore();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(Math.max(4, players.length || 4));

  const submit = () => {
    if (!name.trim()) return;
    addPlayer(name);
    sfx.pop();
    setName("");
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${ui("players")} ${ui("playersCount", { n: players.length })}`}>
      <p className="hint" style={{ marginBottom: 14 }}>
        {ui("playersHelp")}
      </p>

      <div className="picker" style={{ marginBottom: 16, minHeight: 40 }}>
        {players.map((p) => (
          <span key={p.id} className="chip chip-porcelain chip-in">
            {p.name}
            <button type="button" className="chip-x" onClick={() => removePlayer(p.id)} aria-label={`${ui("close")} ${p.name}`}>
              <X size={14} />
            </button>
          </span>
        ))}
        {players.length === 0 && <span className="hint">{ui("noPlayers")}</span>}
      </div>

      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ui("playerNamePlaceholder")}
          maxLength={14}
          enterKeyHint="done"
          autoComplete="off"
          disabled={players.length >= 15}
          aria-label={ui("playerNamePlaceholder")}
        />
        <button type="submit" className="btn btn-moon btn-sm" disabled={!name.trim() || players.length >= 15}>
          <Plus size={16} /> {ui("addPlayer")}
        </button>
      </form>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 18, gap: 8, flexWrap: "wrap" }}>
        <span className="hint">{ui("quickSeats")}</span>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="icon-btn" onClick={() => setSeats((n) => Math.max(2, n - 1))} aria-label="-">
            <Minus size={18} />
          </button>
          <span className="tabular" style={{ minWidth: 28, textAlign: "center", fontWeight: 800, fontSize: "var(--text-lg)" }}>
            {seats}
          </span>
          <button type="button" className="icon-btn" onClick={() => setSeats((n) => Math.min(15, n + 1))} aria-label="+">
            <Plus size={18} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuickSeats(seats)}>
            {ui("seatN", { n: "1–" + seats })}
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={onClose}>
        {ui("done")}
      </button>
    </Sheet>
  );
}
