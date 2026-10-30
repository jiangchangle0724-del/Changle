import { Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../components/Sheet";
import { gsap, reduced } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";
import { CITIES, CITY_BY_ID, dayDiff, DEFAULT_CITIES, offsetMin, partsIn, zonedToUtc, type City } from "./tz";

const KEY = "changle.clock.cities";
const LOCAL_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver";
  } catch {
    return "America/Vancouver";
  }
})();

const ZH_WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Every city's clock, live by default. Set any city's time (or drag the ruler) and all the
 * others move with it; "Now" puts them back on the live clock.
 */
export function WorldClock() {
  const { lang } = useStore();
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as string[]).filter((id) => CITY_BY_ID[id]) : null;
      if (list && list.length) return list;
    } catch {
      /* fine */
    }
    return DEFAULT_CITIES;
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* fine */
    }
  }, [ids]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /** a chosen instant, or null for the live clock */
  const [pinned, setPinned] = useState<number | null>(null);
  const [editing, setEditing] = useState<City | null>(null);
  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const at = pinned ?? now;
  const list = useRef<HTMLDivElement>(null);
  const lastPinned = useRef<number | null>(null);

  // when the shown time jumps (a city was set, or back to now), the clocks roll into place
  useLayoutEffect(() => {
    const jumped = lastPinned.current !== pinned && !dragging.current;
    lastPinned.current = pinned;
    if (!jumped || reduced() || !list.current) return;
    gsap.fromTo(list.current.querySelectorAll(".clock-time"), { yPercent: -35, opacity: 0.2 }, { yPercent: 0, opacity: 1, stagger: 0.03, duration: 0.45 });
  }, [pinned]);

  const dragging = useRef(false);
  const localParts = partsIn(LOCAL_TZ, at);

  return (
    <section className="tool" id="tool-clock" aria-labelledby="clock-title">
      <header className="tool-head">
        <h2 id="clock-title" className="tool-title">
          <span>{lang === "zh" ? "世界时间" : "World clock"}</span>
          <small>{lang === "zh" ? "World clock" : "世界时间"}</small>
        </h2>
        {pinned !== null ? (
          <button
            type="button"
            className="chip chip-sm chip-selected"
            onClick={() => {
              setPinned(null);
              sfx.tap();
            }}
          >
            <RotateCcw size={14} />
            {lang === "zh" ? "回到现在" : "Back to now"}
          </button>
        ) : (
          <span className="tool-live">
            <span className="live-dot" aria-hidden="true" />
            {lang === "zh" ? "现在" : "Live"}
          </span>
        )}
      </header>

      <div className="clock-list" ref={list}>
        {ids.map((id) => {
          const c = CITY_BY_ID[id];
          const p = partsIn(c.tz, at);
          const diffMin = offsetMin(c.tz, at) - offsetMin(LOCAL_TZ, at);
          const dd = dayDiff(p, localParts);
          return (
            <div key={id} className="clock-row">
              <div className="clock-city">
                <span className="clock-name">{lang === "zh" ? c.zh : c.en}</span>
                <span className="clock-sub">
                  {dateText(p, lang)}
                  {dd !== 0 && <em>{dd > 0 ? (lang === "zh" ? " 明天" : " tomorrow") : lang === "zh" ? " 昨天" : " yesterday"}</em>}
                </span>
              </div>
              <span className="clock-diff tabular">{c.tz === LOCAL_TZ || diffMin === 0 ? (lang === "zh" ? "本地" : "Local") : signed(diffMin)}</span>
              {editMode ? (
                <button type="button" className="icon-btn clock-remove" onClick={() => setIds((l) => l.filter((x) => x !== id))} aria-label={lang === "zh" ? `移除${c.zh}` : `Remove ${c.en}`} disabled={ids.length <= 1}>
                  <X size={18} />
                </button>
              ) : (
                <button type="button" className="clock-time tabular" onClick={() => setEditing(c)} aria-label={lang === "zh" ? `设置${c.zh}的时间` : `Set the time in ${c.en}`}>
                  {timeText(p, lang)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Scrubber
        offsetMin={pinned === null ? 0 : Math.round((pinned - snapNow(now)) / 60000)}
        lang={lang}
        onDrag={(d) => (dragging.current = d)}
        onChange={(mins) => setPinned(mins === 0 ? null : snapNow(now) + mins * 60000)}
      />

      <div className="tool-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
          <Plus size={16} />
          {lang === "zh" ? "加城市" : "Add a city"}
        </button>
        <button type="button" className="link-btn" onClick={() => setEditMode((e) => !e)}>
          {editMode ? (lang === "zh" ? "完成" : "Done") : lang === "zh" ? "移除城市" : "Remove cities"}
        </button>
      </div>

      <TimeSheet
        city={editing}
        at={at}
        lang={lang}
        onClose={() => setEditing(null)}
        onSet={(ms) => {
          setPinned(ms);
          setEditing(null);
          sfx.settle();
        }}
      />
      <Sheet open={adding} onClose={() => setAdding(false)} title={lang === "zh" ? "加城市" : "Add a city"}>
        <div className="picker">
          {CITIES.filter((c) => !ids.includes(c.id)).map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              onClick={() => {
                setIds((l) => [...l, c.id]);
                sfx.pop();
              }}
            >
              {lang === "zh" ? c.zh : c.en}
              <span className="muted">{lang === "zh" ? c.en : c.zh}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}

/** Drag left or right to move every clock; snaps to quarter hours. */
function Scrubber({ offsetMin: off, lang, onChange, onDrag }: { offsetMin: number; lang: "zh" | "en"; onChange: (mins: number) => void; onDrag: (d: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const PX_PER_HOUR = 26;
  const shown = off;
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = drag.current.x - e.clientX;
    const mins = Math.round((drag.current.start + (dx / PX_PER_HOUR) * 60) / 15) * 15;
    const clamped = Math.max(-48 * 60, Math.min(48 * 60, mins));
    if (clamped !== off) {
      if (clamped % 60 === 0) sfx.tick(0.7);
      onChange(clamped);
    }
  };
  const ticks = useMemo(() => Array.from({ length: 121 }, (_, i) => i - 60), []);
  return (
    <div className="scrubber">
      <div
        ref={ref}
        className="scrub-track"
        role="slider"
        tabIndex={0}
        aria-label={lang === "zh" ? "拖动调整时间" : "Drag to shift the time"}
        aria-valuemin={-2880}
        aria-valuemax={2880}
        aria-valuenow={off}
        aria-valuetext={signed(off)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onChange(off + 15);
          if (e.key === "ArrowLeft") onChange(off - 15);
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, start: off };
          onDrag(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
          onDrag(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          onDrag(false);
        }}
      >
        <div className="scrub-ruler" style={{ transform: `translateX(${(-shown / 60) * PX_PER_HOUR}px)` }}>
          {ticks.map((h) => (
            <span key={h} className={`scrub-tick ${h % 3 === 0 ? "is-major" : ""}`} style={{ left: `calc(50% + ${h * PX_PER_HOUR}px)` }}>
              {h % 3 === 0 && <span className="scrub-label">{h === 0 ? (lang === "zh" ? "现在" : "now") : signed(h * 60)}</span>}
            </span>
          ))}
        </div>
        <span className="scrub-needle" aria-hidden="true" />
      </div>
      <p className="scrub-caption">{off === 0 ? (lang === "zh" ? "左右拖动，所有城市一起变" : "Drag to move every city at once") : signed(off)}</p>
    </div>
  );
}

function TimeSheet({ city, at, lang, onClose, onSet }: { city: City | null; at: number; lang: "zh" | "en"; onClose: () => void; onSet: (ms: number) => void }) {
  const [time, setTime] = useState("20:00");
  const [day, setDay] = useState(0);
  useEffect(() => {
    if (!city) return;
    const p = partsIn(city.tz, at);
    setTime(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
    setDay(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);
  if (!city) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const p = partsIn(city.tz, at);
  const apply = () => {
    const [h, m] = time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const base = Date.UTC(p.year, p.month - 1, p.day) + day * 86400000;
    const d = new Date(base);
    onSet(zonedToUtc(city.tz, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m));
  };
  const name = lang === "zh" ? city.zh : city.en;
  return (
    <Sheet open={!!city} onClose={onClose} title={lang === "zh" ? `${name}的时间` : `Time in ${name}`}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="field time-field">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={lang === "zh" ? "时间" : "Time"} />
        </div>
        <div className="seg">
          {[-1, 0, 1].map((d) => (
            <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)}>
              {d === -1 ? (lang === "zh" ? "前一天" : "Day before") : d === 0 ? (lang === "zh" ? `${p.month}月${p.day}日` : `${EN_MON[p.month - 1]} ${p.day}`) : lang === "zh" ? "后一天" : "Day after"}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={apply}>
          {lang === "zh" ? "看看各地是几点" : "Show every city"}
        </button>
      </div>
    </Sheet>
  );
}

function snapNow(now: number) {
  return Math.floor(now / 60000) * 60000;
}

function signed(mins: number) {
  const s = mins < 0 ? "−" : "+";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (!h) return `${s}${m}m`;
  return m ? `${s}${h}h ${m}m` : `${s}${h}h`;
}

function timeText(p: { hour: number; minute: number }, lang: "zh" | "en") {
  const mm = String(p.minute).padStart(2, "0");
  if (lang === "zh") return `${String(p.hour).padStart(2, "0")}:${mm}`;
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return (
    <>
      {h12}:{mm}
      <small>{p.hour < 12 ? "am" : "pm"}</small>
    </>
  );
}

function dateText(p: { month: number; day: number; weekday: number }, lang: "zh" | "en") {
  return lang === "zh" ? `${p.month}月${p.day}日 ${ZH_WEEK[p.weekday]}` : `${EN_WEEK[p.weekday]}, ${EN_MON[p.month - 1]} ${p.day}`;
}
