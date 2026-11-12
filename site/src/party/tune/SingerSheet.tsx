import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SPECIALS } from "../../data/songPools";
import { GAME_BY_ID } from "../../games/registry";
import { LANGS } from "../../shared/songs";
import { useStore } from "../../store";
import { Pill } from "../../ui/Pill";
import { Sheet } from "../../ui/Sheet";
import "../../ui/base.css";
import { specialBy, specialName } from "./specials";

/** the languages the specials come in, in the order the setup lists them */
const ORDER = [0, 2, 1, 3, 4, 5].filter((l) => SPECIALS.some((s) => s[3] === l));

/**
 * Singer specials (歌手专场): every singer with enough songs, by language, or found by name. Picking one
 * plays a whole game of their songs.
 */
export function SingerSheet({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current: string; onPick: (singer: string) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [tab, setTab] = useState(() => specialBy(current)?.[3] ?? (zh ? 0 : 1));
  const [q, setQ] = useState("");
  const find = q.trim().toLowerCase();
  const list = useMemo(
    () => (find ? SPECIALS.filter((s) => s[0].includes(find) || s[1].toLowerCase().includes(find) || s[2].toLowerCase().includes(find)) : SPECIALS.filter((s) => s[3] === tab)),
    [find, tab],
  );
  return (
    <Sheet open={open} onClose={onClose} lang={lang} title={zh ? "歌手专场" : "One singer"} gel={GAME_BY_ID.tune.gel}>
      <div className="tn-singer-sheet">
        <p className="tn-pool-hint">{zh ? "选一位歌手，整局只放这位歌手的歌" : "Pick a singer: the whole game is their songs."}</p>
        <label className="field">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "找歌手" : "Find a singer"} aria-label={zh ? "找歌手" : "Find a singer"} autoComplete="off" enterKeyHint="search" />
        </label>
        {!find && (
          <div className="tn-singer-langs" role="group" aria-label={zh ? "语言" : "Language"}>
            {ORDER.map((l) => (
              <Pill key={l} kind="toggle" selected={tab === l} onToggle={() => setTab(l)}>
                {zh ? LANGS[l].zh : LANGS[l].en}
              </Pill>
            ))}
          </div>
        )}
        <div className="tn-singers" role="group" aria-label={zh ? "歌手" : "Singers"}>
          {list.map((s) => (
            <Pill
              key={s[0]}
              kind="toggle"
              selected={s[0] === current}
              onToggle={() => {
                onPick(s[0]);
                onClose();
              }}
            >
              {specialName(s, zh)}
              <small className="tabular">{zh ? `${s[4]} 首` : `${s[4]} songs`}</small>
            </Pill>
          ))}
        </div>
        {list.length === 0 && <p className="tn-pool-hint">{zh ? "没找到。歌单里歌够多的歌手才有专场。" : "Not found. Only singers with plenty of songs in the list have one."}</p>}
      </div>
    </Sheet>
  );
}
