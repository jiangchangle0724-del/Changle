import { CircleHelp, RadioTower } from "lucide-react";
import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { BiTitle, TopBar } from "../../components/TopBar";
import { GAME_BY_ID } from "../../games/registry";
import { OnlineSheet } from "../../online/OnlineSheet";
import { usePenaltyText, useStore } from "../../store";
import { Button } from "../../ui/Button";
import { Fan, LcRules } from "./Rules";
import "../../ui/base.css";
import "./lastcard.css";

/**
 * changle.ca/g/last-card/play. 最后一张 plays only with everyone on their own phone (each hand is
 * secret), so its own address opens a table for it: your name, then Open a table, and the table's
 * lobby has 最后一张 up, ready to start. Have a code? Sit down at that table instead.
 */
export function LastCardStart({ onBack }: { onBack: () => void }) {
  const { ui, lang, tr } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const g = GAME_BY_ID.lastcard;
  // the way to a table comes straight up: this page is how a table for the game is opened
  const [open, setOpen] = useState(true);
  const [rules, setRules] = useState(false);
  return (
    <div className="screen lcs">
      <TopBar title={g.name} onBack={onBack} onHelp={() => setRules(true)} />
      <div className="lcs-body">
        <Fan />
        <h1 className="lcs-title">
          <BiTitle name={g.name} size="lg" />
        </h1>
        <p className="lcs-how">{tr(custom && g.howCustom ? g.howCustom : g.how)}</p>
        <p className="lcs-meta">{zh ? `${g.minPlayers} 到 ${g.maxPlayers} 人，每人用自己的手机` : `${g.minPlayers} to ${g.maxPlayers} players, each on their own phone`}</p>
        <div className="lcs-actions">
          <Button tone="quiet" size="lg" icon={CircleHelp} onClick={() => setRules(true)}>
            {ui("rules")}
          </Button>
          <Button tone="primary" size="lg" icon={RadioTower} onClick={() => setOpen(true)}>
            {ui("openTable")}
          </Button>
        </div>
      </div>
      <OnlineSheet open={open} onClose={() => setOpen(false)} game="lastcard" />
      <Sheet open={rules} onClose={() => setRules(false)} title={ui("rules")} gel={g.gel}>
        <div className="rules-text">
          <LcRules stack={null} />
        </div>
      </Sheet>
    </div>
  );
}
