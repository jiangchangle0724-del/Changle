import { useEffect, useState } from "react";
import { TopBar } from "../../components/TopBar";
import { LIGHTS, setLight } from "../../lib/motion";
import { sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { Figure3D, type FigureIs, type FigureStats } from "./Figure3D";
import { MOVES, type MoveId } from "./moves";

const TITLE = { zh: "3D 小人", en: "3D figure" };
/** the moves written here (they carry over to another figure), and the stand-in's borrowed ones */
const GROUPS = [
  { key: "ours", zh: "我们编的", en: "Ours", moves: MOVES.filter((m) => "own" in m) },
  { key: "borrowed", zh: "借来的，以后换掉", en: "Borrowed, to be replaced", moves: MOVES.filter((m) => !("own" in m)) },
];

/**
 * /me/figure: the 3D figure's prototype (Steve on Nov 13: 先做小样). A stand-in model with its moves,
 * to see the look and how smoothly a phone draws it, before deciding how the real one is made. Not
 * linked from anywhere but the owner's /me page.
 */
export function FigurePage({ onBack }: { onBack: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [move, setMove] = useState<MoveId>("stand");
  const [is, setIs] = useState<FigureIs>("loading");
  const [stats, setStats] = useState<FigureStats | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => setLight(LIGHTS.me), []);

  const n = (x: number) => x.toLocaleString(zh ? "zh-CN" : "en-CA");
  return (
    <div className="screen me figure">
      <TopBar onBack={onBack} title={TITLE} />
      <p className="hint fig-intro">
        {zh
          ? "小样：一个临时的 3D 小人，左右拖动转圈。「我们编的」动作是这里写的，以后换成你自己的小人也能用；「借来的」以后换掉。"
          : "A prototype: a stand-in 3D figure; drag sideways to turn it. The moves under Ours were written here and will work on your own figure later; the borrowed ones will go."}
      </p>

      <div className={`fig-stage${is === "on" ? " is-on" : ""}`}>
        {is !== "none" && is !== "software" && is !== "failed" && <Figure3D key={tries} move={move} onIs={setIs} onStats={setStats} />}
        {is === "loading" && (
          <div className="fig-wait">
            <Skeleton lang={lang} shape="block" height="100%" slowText={zh ? "小人在路上，网有点慢" : "The figure is on its way. Slow connection"} />
          </div>
        )}
        {(is === "none" || is === "software") && <EmptyState title={zh ? "这台设备画不了 3D" : "This device can't draw 3D"} body={zh ? "没有能用的图形芯片，或者浏览器不让用。换台手机试试。" : "No usable graphics chip, or the browser won't use it. Try another phone."} />}
        {is === "failed" && (
          <EmptyState
            tone="error"
            title={zh ? "小人没加载出来" : "The figure didn't load"}
            body={zh ? "检查一下网络。" : "Check your connection."}
            action={{
              label: zh ? "再试一次" : "Try again",
              onClick: () => {
                setIs("loading");
                setTries((t) => t + 1);
              },
            }}
          />
        )}
      </div>

      {GROUPS.map((g) => (
        <section key={g.key} className="fig-group">
          <h3 className="list-title">{zh ? g.zh : g.en}</h3>
          <div className="fig-moves" role="group" aria-label={zh ? g.zh : g.en}>
            {g.moves.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                data-move={m.id}
                aria-pressed={move === m.id}
                disabled={is !== "on"}
                onClick={() => {
                  if (m.id === move) return;
                  setMove(m.id);
                  sfx.pop();
                }}
              >
                {zh ? m.zh : m.en}
              </button>
            ))}
          </div>
        </section>
      ))}

      {stats && (
        <p className="hint fig-stats tabular">
          {zh
            ? `模型 ${n(stats.kb)} KB · ${n(stats.tris)} 个面 · ${stats.fps ? `${stats.fps} 帧/秒` : "数帧率…"}${stats.engineKb ? ` · 引擎 ${n(stats.engineKb)} KB，只在这一页下载` : ""}`
            : `Model ${n(stats.kb)} KB · ${n(stats.tris)} triangles · ${stats.fps ? `${stats.fps} fps` : "counting…"}${stats.engineKb ? ` · engine ${n(stats.engineKb)} KB, downloaded on this page only` : ""}`}
        </p>
      )}
    </div>
  );
}
