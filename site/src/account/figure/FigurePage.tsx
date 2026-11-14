import { RotateCcw, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { TopBar } from "../../components/TopBar";
import { LIGHTS, setLight } from "../../lib/motion";
import { sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { Tabs } from "../../ui/Tabs";
import { Figure3D, type FigureIs, type FigureStats } from "./Figure3D";
import type { View } from "./FigureStage";
import { HAIR_COLOR_NAMES, HAIR_COLORS, HAIRS, SHAPES, SKIN_NAMES, SKINS, defaultLook, randomLook, readLook, saveLook, type Look, type ShapeGroup, type Sex } from "./look";
import { MOVES, type MoveId } from "./moves";

const TITLE = { zh: "3D 小人", en: "3D figure" };
type Tab = "moves" | "face";
type Part = ShapeGroup | "skin" | "hair";
const PARTS: { key: Part; zh: string; en: string }[] = [
  { key: "face", zh: "脸型", en: "Face" },
  { key: "eyes", zh: "眼睛", en: "Eyes" },
  { key: "nose", zh: "鼻子", en: "Nose" },
  { key: "mouth", zh: "嘴", en: "Mouth" },
  { key: "skin", zh: "肤色", en: "Skin" },
  { key: "hair", zh: "发型", en: "Hair" },
];

/**
 * /me/figure: the 3D figure (Steve on Nov 13: 先做小样; Nov 14: 捏脸 on MakeHuman's free human).
 * The moves written here, and the sculpting: the body, the face's sliders, skin and hair, kept on
 * this phone. Not linked from anywhere but the owner's /me page.
 */
export function FigurePage({ onBack }: { onBack: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [tab, setTab] = useState<Tab>("moves");
  const [part, setPart] = useState<Part>("face");
  const [move, setMove] = useState<MoveId>("stand");
  const [look, setLook] = useState<Look>(() => readLook());
  const [is, setIs] = useState<FigureIs>("loading");
  const [stats, setStats] = useState<FigureStats | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => setLight(LIGHTS.me), []);
  // kept on this phone, a moment after the last change
  useEffect(() => {
    const t = window.setTimeout(() => saveLook(look), 250);
    return () => window.clearTimeout(t);
  }, [look]);

  // sculpting: it stands still and the camera comes up to the face (the head and shoulders for hair)
  const view: View = tab === "face" ? (part === "hair" ? "bust" : "face") : "body";
  const shown: MoveId = tab === "face" ? "stand" : move;
  const n = (x: number) => x.toLocaleString(zh ? "zh-CN" : "en-CA");
  const pct = (x: number | undefined) => Math.round((x ?? 0) * 100);
  const sex = (s: Sex) => setLook((l) => (l.sex === s ? l : { ...defaultLook(s), shape: l.shape, skin: l.skin, hairColor: l.hairColor }));
  const on = is === "on";

  return (
    <div className={`screen me figure${tab === "face" ? " is-sculpt" : ""}`}>
      <TopBar onBack={onBack} title={TITLE} />
      <p className="hint fig-intro">
        {zh
          ? "小样：一个写实的 3D 小人，左右拖动转圈。动作是这里编的；「捏脸」里调脸型、五官、肤色和发型，存在这台手机上。"
          : "A prototype: a lifelike 3D figure; drag sideways to turn it. The moves were written here; under Face you can shape the face, skin and hair, kept on this phone."}
      </p>

      <div className={`fig-stage${on ? " is-on" : ""}`}>
        {is !== "none" && is !== "software" && is !== "failed" && <Figure3D key={tries} move={shown} look={look} view={view} onIs={setIs} onStats={setStats} />}
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

      <div className="fig-tabs">
        <Tabs<Tab>
          label={zh ? "动作和捏脸" : "Moves and face"}
          value={tab}
          onChange={setTab}
          items={[
            { key: "moves", label: zh ? "动作" : "Moves", panelId: "fig-moves" },
            { key: "face", label: zh ? "捏脸" : "Face", panelId: "fig-face" },
          ]}
        />
      </div>

      {tab === "moves" && (
        <section id="fig-moves" role="tabpanel" aria-labelledby="fig-moves-tab" className="fig-moves">
          {MOVES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="chip"
              data-move={m.id}
              aria-pressed={move === m.id}
              disabled={!on}
              onClick={() => {
                if (m.id === move) return;
                setMove(m.id);
                sfx.pop();
              }}
            >
              {zh ? m.zh : m.en}
            </button>
          ))}
        </section>
      )}

      {tab === "face" && (
        <section id="fig-face" role="tabpanel" aria-labelledby="fig-face-tab" className="fig-sculpt">
          <div className="fig-row">
            <span className="fig-label">{zh ? "身体" : "Body"}</span>
            <Tabs<Sex>
              variant="segmented"
              label={zh ? "身体" : "Body"}
              value={look.sex}
              onChange={sex}
              items={[
                { key: "male", label: zh ? "男" : "Male" },
                { key: "female", label: zh ? "女" : "Female" },
              ]}
            />
          </div>
          <Tabs<Part> variant="segmented" label={zh ? "捏哪里" : "What to shape"} value={part} onChange={setPart} items={PARTS.map((p) => ({ key: p.key, label: zh ? p.zh : p.en }))} />

          <div className="fig-part" data-part={part}>
            {(part === "face" || part === "eyes" || part === "nose" || part === "mouth") &&
              SHAPES.filter((s) => s.group === part).map((s) => (
                <label key={s.id} className="fig-slider">
                  <span>{zh ? s.zh : s.en}</span>
                  <input
                    type="range"
                    data-shape={s.id}
                    min={"one" in s ? 0 : -100}
                    max={100}
                    step={1}
                    value={pct(look.shape[s.id])}
                    disabled={!on}
                    onChange={(e) => {
                      const v = Number(e.currentTarget.value) / 100;
                      setLook((l) => {
                        const shape = { ...l.shape };
                        if (v) shape[s.id] = v;
                        else delete shape[s.id];
                        return { ...l, shape };
                      });
                    }}
                  />
                </label>
              ))}

            {part === "skin" && (
              <div className="fig-swatches" role="radiogroup" aria-label={zh ? "肤色" : "Skin"}>
                {SKINS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    className="fig-swatch"
                    data-skin={i}
                    aria-checked={look.skin === i}
                    aria-label={zh ? SKIN_NAMES.zh[i] : SKIN_NAMES.en[i]}
                    disabled={!on}
                    style={{ background: c }}
                    onClick={() => setLook((l) => ({ ...l, skin: i }))}
                  />
                ))}
              </div>
            )}

            {part === "hair" && (
              <>
                <div className="fig-chips" role="radiogroup" aria-label={zh ? "发型" : "Hairstyle"}>
                  {HAIRS.map((hh) => (
                    <button
                      key={hh.id}
                      type="button"
                      role="radio"
                      className="chip"
                      data-hair={hh.id}
                      aria-checked={look.hair === hh.id}
                      disabled={!on}
                      onClick={() => {
                        setLook((l) => ({ ...l, hair: hh.id }));
                        sfx.pop();
                      }}
                    >
                      {zh ? hh.zh : hh.en}
                    </button>
                  ))}
                </div>
                <div className="fig-swatches" role="radiogroup" aria-label={zh ? "发色" : "Hair colour"}>
                  {HAIR_COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      className="fig-swatch"
                      data-hair-color={i}
                      aria-checked={look.hairColor === i}
                      aria-label={zh ? HAIR_COLOR_NAMES.zh[i] : HAIR_COLOR_NAMES.en[i]}
                      disabled={!on}
                      style={{ background: c }}
                      onClick={() => setLook((l) => ({ ...l, hairColor: i }))}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="fig-actions">
            <Button tone="quiet" icon={Shuffle} disabled={!on} onClick={() => setLook((l) => randomLook(l.sex))}>
              {zh ? "随机" : "Random"}
            </Button>
            <Button tone="quiet" icon={RotateCcw} disabled={!on} onClick={() => setLook((l) => defaultLook(l.sex))}>
              {zh ? "还原" : "Reset"}
            </Button>
          </div>
        </section>
      )}

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
