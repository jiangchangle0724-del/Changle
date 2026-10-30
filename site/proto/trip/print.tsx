/**
 * 到此一游 · Been There, Bought That: the paper prototype (step 2). Prints the board (one
 * overview page and four Letter tiles to tape together), the deeds, the two card decks, the
 * rules in Chinese and in English, passports and play money, as PDFs for a home printer.
 *
 *   npx tsx proto/trip/print.tsx [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React, { type ReactNode } from "react";
void React; // the script runs without the app's JSX settings
import { renderToStaticMarkup } from "react-dom/server";
import { Ban, Car, Compass, Earth, Luggage, Mail, Plane, PlaneTakeoff, ShieldCheck, ShieldX, Smartphone, Sofa, Stamp, Coins, Receipt, Tag, Wind, type LucideIcon } from "lucide-react";
import { createRequire } from "node:module";
import {
  BOARD,
  CITIES,
  GROUPS,
  IMMIGRATION_FEE,
  JOURNEY,
  POSTCARDS,
  ROUTE_PRICE,
  ROUTE_RENT,
  ROUTES,
  SALARY,
  SERVICE_PRICE,
  SERVICE_TIMES,
  SERVICES,
  SORT_QUIZ,
  START_CASH,
  cityById,
  groupOf,
  RENTS,
  SEAT_BONUS,
  TARGET,
  type Card,
  type City,
  type Group,
  type Shape,
  type Space,
} from "../../src/shared/trip/data";

// Playwright is installed for the whole machine, so it comes in through require (NODE_PATH)
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const OUT = process.argv[2] ?? "/mnt/user-data/outputs/trip-proto";
const NM = "/home/claude/party-games/node_modules";

/* ------------------------------------------------------------------ shared bits */

const INK = "#17142b";
const SOFT = "#5d5a73";
const PAPER = "#fffdf8";
const LINE = "#d8d4c8";
const ACCENT = "#e765f0";

const css = `
@font-face { font-family: "Unbounded"; src: url("file://${NM}/@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2") format("woff2"); font-weight: 200 900; }
@font-face { font-family: "Figtree"; src: url("file://${NM}/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2") format("woff2"); font-weight: 300 900; }
@page { size: 8.5in 11in; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: ${INK}; font-family: "Figtree", "Noto Sans CJK SC", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.zh { font-family: "Noto Sans CJK SC", "Figtree", sans-serif; }
.num { font-family: "Unbounded", "Figtree", sans-serif; font-variant-numeric: tabular-nums; }
html, body { width: 8.5in; }
.page { position: relative; width: 8.5in; height: 11in; overflow: hidden; contain: strict; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
`;

function shapePath(shape: Shape, color = "#fff") {
  switch (shape) {
    case "triangle":
      return <path d="M12 3 L22 20.5 H2 Z" fill={color} />;
    case "circle":
      return <circle cx="12" cy="12" r="9" fill={color} />;
    case "diamond":
      return <path d="M12 2 L22 12 L12 22 L2 12 Z" fill={color} />;
    case "square":
      return <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill={color} />;
    case "star":
      return <path d="M12 2.2 L14.9 8.6 L21.8 9.3 L16.6 14 L18.1 20.8 L12 17.3 L5.9 20.8 L7.4 14 L2.2 9.3 L9.1 8.6 Z" fill={color} />;
    case "hexagon":
      return <path d="M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z" fill={color} />;
    case "plus":
      return <path d="M8.5 2.5 H15.5 V8.5 H21.5 V15.5 H15.5 V21.5 H8.5 V15.5 H2.5 V8.5 H8.5 Z" fill={color} />;
    case "wave":
      return (
        <g fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round">
          <path d="M2.5 9 C5.5 5, 8.5 5, 12 9 S18.5 13, 21.5 9" />
          <path d="M2.5 16 C5.5 12, 8.5 12, 12 16 S18.5 20, 21.5 16" />
        </g>
      );
  }
}

function GroupMark({ g, size, color = "#fff" }: { g: Group; size: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: "block", flex: "none" }} aria-hidden="true">
      {shapePath(g.shape, color)}
    </svg>
  );
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const html = (title: string, body: ReactNode, extra = "") =>
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${css}${extra}</style></head><body>${renderToStaticMarkup(<>{body}</>)}</body></html>`;

/* ------------------------------------------------------------------ the board */

const S = 16; // board side, inches
const C = 2; // corner
const W = (S - 2 * C) / 9; // edge space width

const boardCss = `
.board { position: absolute; width: ${S}in; height: ${S}in; background: ${PAPER}; }
.cell { position: absolute; }
.space { position: absolute; width: ${W}in; height: ${C}in; border: 0.6pt solid ${INK}; background: ${PAPER}; display: flex; flex-direction: column; align-items: center; text-align: center; overflow: hidden; }
.band { width: 100%; height: 0.42in; display: flex; align-items: center; justify-content: center; border-bottom: 0.6pt solid ${INK}; }
.s-name { margin-top: 0.08in; font-size: 11.5pt; font-weight: 800; line-height: 1.1; padding: 0 0.04in; }
.s-name.long { font-size: 9.5pt; }
.s-en { font-size: 6.6pt; font-weight: 600; color: ${SOFT}; margin-top: 1pt; padding: 0 0.04in; line-height: 1.15; }
.s-rule { margin-top: 0.07in; padding: 1.5pt 4pt; border-radius: 6pt; background: #f1ede2; font-size: 6.2pt; font-weight: 700; line-height: 1.25; max-width: 92%; }
.s-rule .zh { font-weight: 800; }
.s-price { position: absolute; bottom: 0.08in; left: 0; right: 0; font-size: 9pt; font-weight: 700; }
.s-icon { margin-top: 0.16in; }
.s-note { margin-top: 0.05in; font-size: 6.4pt; color: ${SOFT}; line-height: 1.25; padding: 0 0.06in; }
.corner { position: absolute; width: ${C}in; height: ${C}in; border: 0.6pt solid ${INK}; background: ${PAPER}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2pt; padding: 0.1in; }
.c-name { font-size: 13pt; font-weight: 900; line-height: 1.1; }
.c-en { font-size: 7.5pt; font-weight: 700; color: ${SOFT}; }
.c-note { font-size: 6.6pt; line-height: 1.3; color: ${SOFT}; margin-top: 2pt; }
.center { position: absolute; left: ${C}in; top: ${C}in; width: ${S - 2 * C}in; height: ${S - 2 * C}in; }
.title { position: absolute; left: 0; right: 0; top: 4.15in; text-align: center; }
.title-zh { font-size: 66pt; font-weight: 900; letter-spacing: 0.08em; line-height: 1; }
.title-en { font-family: "Unbounded"; font-size: 20pt; font-weight: 800; letter-spacing: -0.01em; margin-top: 0.12in; }
.title-dot { color: ${ACCENT}; }
.deck { position: absolute; width: 3.5in; height: 2.5in; border: 1.2pt dashed ${SOFT}; border-radius: 10pt; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4pt; color: ${SOFT}; }
.deck b { font-size: 15pt; color: ${INK}; }
.deck span { font-size: 9pt; font-weight: 700; }
.legend { position: absolute; left: 0.55in; right: 0.55in; bottom: 0.55in; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt 10pt; }
.legend div { display: flex; align-items: center; gap: 5pt; font-size: 8pt; font-weight: 700; }
.legend i { width: 0.26in; height: 0.26in; border-radius: 4pt; display: grid; place-items: center; flex: none; border: 0.6pt solid ${INK}; }
.turn { position: absolute; left: 0.55in; right: 0.55in; top: 0.55in; display: flex; justify-content: space-between; gap: 8pt; font-size: 8.4pt; font-weight: 700; }
.turn div { flex: 1; border-radius: 8pt; background: #f1ede2; padding: 5pt 7pt; line-height: 1.3; }
.turn b { font-family: "Unbounded"; color: ${ACCENT}; margin-right: 3pt; }
`;

const ICON = { color: INK, strokeWidth: 1.8 };

function SpaceFace({ sp, i }: { sp: Space; i: number }) {
  if (sp.k === "city") {
    const city = cityById(sp.id);
    const g = groupOf(city.group);
    const long = city.name.zh.length > 4;
    return (
      <div className="space" data-i={i}>
        <div className="band" style={{ background: g.color }}>
          <GroupMark g={g} size="0.26in" color={g.id === 6 ? INK : "#fff"} />
        </div>
        <div className={`s-name zh ${long ? "long" : ""}`}>{city.name.zh}</div>
        <div className="s-en">{city.name.en}</div>
        <div className="s-rule">
          <span className="zh">{city.rule.title.zh}</span>
          <br />
          {city.rule.title.en}
        </div>
        <div className="s-price num">{money(city.price)}</div>
      </div>
    );
  }
  if (sp.k === "route") {
    const r = ROUTES.find((x) => x.id === sp.id)!;
    return (
      <div className="space">
        <div className="s-icon">
          <Plane size="0.42in" {...ICON} />
        </div>
        <div className="s-name zh long">{r.name.zh}</div>
        <div className="s-en">{r.name.en}</div>
        <div className="s-price num">{money(ROUTE_PRICE)}</div>
      </div>
    );
  }
  if (sp.k === "service") {
    const s = SERVICES.find((x) => x.id === sp.id)!;
    const Icon = sp.id === "exchange" ? Coins : Smartphone;
    return (
      <div className="space">
        <div className="s-icon">
          <Icon size="0.42in" {...ICON} />
        </div>
        <div className="s-name zh long">{s.name.zh}</div>
        <div className="s-en">{s.name.en}</div>
        <div className="s-price num">{money(SERVICE_PRICE)}</div>
      </div>
    );
  }
  if (sp.k === "journey" || sp.k === "postcard") {
    const j = sp.k === "journey";
    const Icon = j ? Compass : Mail;
    return (
      <div className="space" style={{ background: j ? "#eef6fb" : "#fbf0f8" }}>
        <div className="s-icon" style={{ marginTop: "0.3in" }}>
          <Icon size="0.5in" {...ICON} />
        </div>
        <div className="s-name zh">{j ? "旅途卡" : "明信片"}</div>
        <div className="s-en">{j ? "Journey" : "Postcard"}</div>
        <div className="s-note">{j ? "抽一张 · Draw one" : "抽一张 · Draw one"}</div>
      </div>
    );
  }
  if (sp.k === "tax") {
    const dep = sp.id === "departure";
    const Icon = dep ? Receipt : Luggage;
    return (
      <div className="space">
        <div className="s-icon">
          <Icon size="0.42in" {...ICON} />
        </div>
        <div className="s-name zh">{dep ? "离境税" : "超重行李"}</div>
        <div className="s-en">{dep ? "Departure Tax" : "Excess Baggage"}</div>
        <div className="s-note">付给银行 · Pay the bank</div>
        <div className="s-price num">{money(sp.amount)}</div>
      </div>
    );
  }
  return null;
}

function CornerFace({ sp }: { sp: Space }) {
  if (sp.k === "go")
    return (
      <div className="corner" style={{ background: "#fdeefe" }}>
        <PlaneTakeoff size="0.55in" color={INK} strokeWidth={1.8} />
        <div className="c-name zh">起飞</div>
        <div className="c-en">Departure</div>
        <div className="c-note">
          经过或停在这里领 <b className="num">{money(SALARY)}</b>
          <br />
          Collect {money(SALARY)} as you pass
        </div>
      </div>
    );
  if (sp.k === "immigration")
    return (
      <div className="corner">
        <Stamp size="0.5in" color={INK} strokeWidth={1.8} />
        <div className="c-name zh">入境审查</div>
        <div className="c-en">Immigration</div>
        <div className="c-note">
          停在这里只是过境
          <br />
          Just passing through
        </div>
      </div>
    );
  if (sp.k === "lounge")
    return (
      <div className="corner">
        <Sofa size="0.55in" color={INK} strokeWidth={1.8} />
        <div className="c-name zh">转机休息室</div>
        <div className="c-en">Transit Lounge</div>
        <div className="c-note">
          歇一会儿
          <br />
          Take a breather
        </div>
      </div>
    );
  if (sp.k === "expired")
    return (
      <div className="corner" style={{ background: "#fff0ee" }}>
        <ShieldX size="0.55in" color={INK} strokeWidth={1.8} />
        <div className="c-name zh">护照过期</div>
        <div className="c-en">Passport Expired</div>
        <div className="c-note">
          直接去入境审查
          <br />
          Go straight to Immigration
        </div>
      </div>
    );
  return null;
}

/** Where space i sits, and how far it turns so its text faces the edge of the board. */
function place(i: number): { x: number; y: number; w: number; h: number; rot: number } {
  if (i === 0) return { x: S - C, y: S - C, w: C, h: C, rot: 0 };
  if (i === 10) return { x: 0, y: S - C, w: C, h: C, rot: 0 };
  if (i === 20) return { x: 0, y: 0, w: C, h: C, rot: 0 };
  if (i === 30) return { x: S - C, y: 0, w: C, h: C, rot: 0 };
  if (i < 10) return { x: S - C - i * W, y: S - C, w: W, h: C, rot: 0 };
  if (i < 20) return { x: 0, y: S - C - (i - 10) * W, w: C, h: W, rot: 90 };
  if (i < 30) return { x: C + (i - 21) * W, y: 0, w: W, h: C, rot: 180 };
  return { x: S - C, y: C + (i - 31) * W, w: C, h: W, rot: 270 };
}

function Globe() {
  // a plain wireframe globe for the middle of the board: drawn here, nobody else's art
  const lines: ReactNode[] = [];
  for (let k = 1; k < 6; k++) {
    const rx = 140 * Math.cos((k * Math.PI) / 12);
    lines.push(<ellipse key={`m${k}`} cx="150" cy="150" rx={rx.toFixed(1)} ry="140" />);
  }
  for (let k = -2; k <= 2; k++) {
    const y = 150 + k * 46;
    const half = Math.sqrt(140 * 140 - (k * 46) ** 2);
    lines.push(<line key={`p${k}`} x1={150 - half} x2={150 + half} y1={y} y2={y} />);
  }
  return (
    <svg viewBox="0 0 300 300" style={{ position: "absolute", left: "2.6in", top: "1.35in", width: "6.8in", height: "6.8in", opacity: 0.16 }} aria-hidden="true">
      <g fill="none" stroke={INK} strokeWidth="1.4">
        <circle cx="150" cy="150" r="140" />
        <line x1="150" x2="150" y1="10" y2="290" />
        {lines}
      </g>
      <path d="M40 210 C 90 120, 200 110, 262 70" fill="none" stroke={ACCENT} strokeWidth="2.4" strokeDasharray="6 7" />
      <g transform="translate(262 70) rotate(-28)">
        <path d="M-9 -3 L9 0 L-9 3 L-5 0 Z" fill={ACCENT} />
      </g>
    </svg>
  );
}

function Board({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <div className="board" style={{ left: `${x}in`, top: `${y}in` }}>
      {BOARD.map((sp, i) => {
        const p = place(i);
        if (i % 10 === 0)
          return (
            <div key={i} className="cell" style={{ left: `${p.x}in`, top: `${p.y}in`, width: `${p.w}in`, height: `${p.h}in` }}>
              <CornerFace sp={sp} />
            </div>
          );
        // the face is drawn upright (W x C), then turned into its slot
        const ox = (p.w - W) / 2;
        const oy = (p.h - C) / 2;
        return (
          <div key={i} className="cell" style={{ left: `${p.x}in`, top: `${p.y}in`, width: `${p.w}in`, height: `${p.h}in` }}>
            <div style={{ position: "absolute", left: `${ox}in`, top: `${oy}in`, width: `${W}in`, height: `${C}in`, transform: `rotate(${p.rot}deg)` }}>
              <SpaceFace sp={sp} i={i} />
            </div>
          </div>
        );
      })}
      <div className="center">
        <Globe />
        <div className="turn">
          <div className="zh">
            <b>1</b>掷骰，顺时针走 · Roll and move
          </div>
          <div className="zh">
            <b>2</b>先做城市规则 · City rule first
          </div>
          <div className="zh">
            <b>3</b>买、拍卖或付租 · Buy, auction or pay
          </div>
          <div className="zh">
            <b>4</b>盖房、交易 · Build, trade
          </div>
        </div>
        <div className="deck" style={{ left: "0.9in", top: "1.55in", transform: "rotate(-45deg)" }}>
          <Compass size="0.5in" color={SOFT} strokeWidth={1.6} />
          <b className="zh">旅途卡</b>
          <span>Journey</span>
        </div>
        <div className="deck" style={{ right: "0.9in", bottom: "1.75in", transform: "rotate(-45deg)" }}>
          <Mail size="0.5in" color={SOFT} strokeWidth={1.6} />
          <b className="zh">明信片</b>
          <span>Postcards</span>
        </div>
        <div className="title">
          <div className="title-zh zh">到此一游</div>
          <div className="title-en">
            Been There, Bought That<span className="title-dot">.</span>
          </div>
        </div>
        <div className="legend">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <i style={{ background: g.color }}>
                <GroupMark g={g} size="0.17in" color={g.id === 6 ? INK : "#fff"} />
              </i>
              <span>
                <span className="zh">{g.name.zh}</span> {g.name.en}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const tileCss = `
.tile-view { position: absolute; left: 0.25in; top: 0.3in; width: 8in; height: 8in; overflow: hidden; outline: 0.5pt dashed #9a96a8; }
.tile-foot { position: absolute; left: 0.25in; right: 0.25in; top: 8.55in; display: flex; gap: 0.3in; align-items: flex-start; }
.tile-map { display: grid; grid-template-columns: repeat(2, 0.55in); grid-template-rows: repeat(2, 0.55in); gap: 3pt; flex: none; }
.tile-map span { border: 1pt solid ${INK}; display: grid; place-items: center; font-family: "Unbounded"; font-weight: 800; font-size: 10pt; color: ${SOFT}; }
.tile-map span.on { background: ${INK}; color: #fff; }
.tile-text { font-size: 10pt; line-height: 1.5; }
.tile-text h2 { font-size: 15pt; margin-bottom: 4pt; }
.overview { position: absolute; left: 0.5in; top: 0.5in; width: 7.5in; height: 7.5in; overflow: hidden; }
.overview .board { transform: scale(${7.5 / S}); transform-origin: 0 0; }
.ov-foot { position: absolute; left: 0.5in; right: 0.5in; top: 8.3in; font-size: 10.5pt; line-height: 1.55; }
.ov-foot h1 { font-size: 20pt; margin-bottom: 6pt; }
`;

function BoardDoc() {
  const names = [
    { zh: "左上", en: "top left" },
    { zh: "右上", en: "top right" },
    { zh: "左下", en: "bottom left" },
    { zh: "右下", en: "bottom right" },
  ];
  return (
    <>
      <div className="page">
        <div className="overview">
          <Board />
        </div>
        <div className="ov-foot">
          <h1 className="zh">到此一游 · 棋盘</h1>
          <p className="zh">这一页是整张棋盘的缩小预览。后面 4 页是真正要用的：每页是棋盘的四分之一，按左上角的编号拼起来，大约 40 × 40 厘米。</p>
          <p>This page is a small preview. The next four pages are the real board: one quarter each. Trim along the dashed lines, line them up by number and tape the backs, for a board about 16 inches across.</p>
        </div>
      </div>
      {[0, 1, 2, 3].map((q) => {
        const qx = q % 2;
        const qy = Math.floor(q / 2);
        return (
          <div className="page" key={q}>
            <div className="tile-view">
              <Board x={-qx * 8} y={-qy * 8} />
            </div>
            <div className="tile-foot">
              <div className="tile-map">
                {[0, 1, 2, 3].map((k) => (
                  <span key={k} className={k === q ? "on" : ""}>
                    {k + 1}
                  </span>
                ))}
              </div>
              <div className="tile-text">
                <h2 className="zh">
                  第 {q + 1} 张，共 4 张：{names[q].zh}
                </h2>
                <p className="zh">沿虚线剪掉白边，按编号拼好，背面用胶带贴牢。打印时选“实际大小”或 100%，不要选“适合页面”。</p>
                <p>
                  Sheet {q + 1} of 4, {names[q].en}. Trim along the dashed line, tape the four together from the back. Print at actual size (100%), not "fit to page".
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ deeds */

const deedCss = `
.sheet { position: absolute; left: 0.5in; top: 0.25in; display: grid; grid-template-columns: repeat(3, 2.5in); grid-template-rows: repeat(3, 3.5in); }
.deed { position: relative; width: 2.5in; height: 3.5in; border: 0.5pt dashed #a8a4b4; padding: 0.1in; display: flex; flex-direction: column; background: #fff; }
.deed-head { flex: none; border: 0.8pt solid ${INK}; border-radius: 5pt; overflow: hidden; }
.deed-band { display: flex; align-items: center; gap: 4pt; padding: 3pt 6pt; color: #fff; font-size: 6.8pt; font-weight: 800; }
.deed-band.dark { color: ${INK}; }
.deed-name { padding: 4pt 6pt 5pt; text-align: center; }
.deed-name .zh { display: block; font-size: 15pt; font-weight: 900; line-height: 1.1; }
.deed-name .en { display: block; font-size: 7.5pt; font-weight: 700; color: ${SOFT}; margin-top: 1pt; }
.rows { margin-top: 4pt; font-size: 7pt; line-height: 1.32; }
.rows div { display: flex; justify-content: space-between; gap: 4pt; }
.rows div span:last-child { font-family: "Unbounded"; font-weight: 600; font-size: 6.6pt; }
.rows .hr { border-top: 0.5pt solid ${LINE}; margin: 2pt 0; }
.rule { margin-top: auto; border-radius: 5pt; background: #f4f1e8; padding: 4pt 6pt 5pt; }
.rule-title { font-size: 7.6pt; font-weight: 900; margin-bottom: 2pt; }
.rule-title small { font-size: 6.4pt; font-weight: 700; color: ${SOFT}; margin-left: 3pt; }
.rule-zh { font-size: 6.5pt; line-height: 1.4; font-weight: 600; }
.rule-en { font-size: 5.9pt; line-height: 1.3; color: #3a3650; margin-top: 2pt; }
.always { display: inline-block; font-size: 5.6pt; font-weight: 800; color: #fff; background: ${INK}; border-radius: 3pt; padding: 0 3pt; margin-left: 3pt; vertical-align: 1pt; }
.deed-foot { margin-top: 4pt; font-size: 5.8pt; color: ${SOFT}; display: flex; justify-content: space-between; gap: 4pt; }
.deed-foot span:first-child { font-weight: 700; color: ${INK}; }
.deed-big-icon { display: grid; place-items: center; padding: 8pt 0 2pt; }
.mk-icon { display: grid; place-items: center; padding: 6pt 0 0; }
.mk-name { padding-top: 2pt; }
.mk-text { margin-top: 8pt; }
.mk-zh { font-size: 8.4pt; line-height: 1.5; font-weight: 600; }
.mk-en { font-size: 7.2pt; line-height: 1.35; color: #3a3650; margin-top: 4pt; }
.mk-pairs { margin-top: auto; display: flex; justify-content: center; gap: 7pt; }
.mk-pairs span { display: flex; gap: 6pt; border: 0.9pt solid ${INK}; border-radius: 5pt; padding: 3pt 8pt; font-weight: 700; font-size: 10pt; }
.mk-pairs i { font-style: normal; }
.mk-ticks { margin-top: auto; display: flex; justify-content: center; gap: 10pt; }
.mk-ticks b { width: 16pt; height: 16pt; border: 0.9pt solid ${INK}; border-radius: 3pt; }
.quiz-how { margin-top: 5pt; font-size: 6.2pt; line-height: 1.35; color: #3a3650; }
.quiz-how .zh { color: ${INK}; font-weight: 700; font-size: 6.6pt; }
.quiz { margin-top: 4pt; display: grid; gap: 3pt; }
.quiz-bin { background: #f4f1e8; border-radius: 4pt; padding: 3pt 5pt; }
.quiz-bin b { display: block; font-size: 7pt; font-weight: 900; }
.quiz-bin p { font-size: 6pt; line-height: 1.35; color: #3a3650; }
.quiz-bin p .zh { color: ${INK}; font-weight: 700; font-size: 6.6pt; }
`;

function DeedRows({ city }: { city: City }) {
  const row = RENTS[city.id];
  const r = { base: row[0], set: row[1], houses: row.slice(2, 6), hotel: row[6] };
  const g = groupOf(city.group);
  return (
    <div className="rows">
      <div>
        <span>
          <b className="zh">价格</b> Price
        </span>
        <span>{money(city.price)}</span>
      </div>
      <div className="hr" />
      <div>
        <span>
          <span className="zh">租金</span> Rent
        </span>
        <span>{money(r.base)}</span>
      </div>
      <div>
        <span>
          <span className="zh">集齐一组</span> Full set
        </span>
        <span>{money(r.set)}</span>
      </div>
      {r.houses.map((h, k) => (
        <div key={k}>
          <span>
            <span className="zh">{k + 1} 栋民宿</span> {k + 1} {k ? "houses" : "house"}
          </span>
          <span>{money(h)}</span>
        </div>
      ))}
      <div>
        <span>
          <span className="zh">酒店</span> Hotel
        </span>
        <span>{money(r.hotel)}</span>
      </div>
      <div className="hr" />
      <div>
        <span>
          <span className="zh">每栋民宿</span> Each house
        </span>
        <span>{money(g.house)}</span>
      </div>
    </div>
  );
}

function Deed({ city }: { city: City }) {
  const g = groupOf(city.group);
  const dark = g.id === 6;
  return (
    <div className="deed">
      <div className="deed-head">
        <div className={`deed-band ${dark ? "dark" : ""}`} style={{ background: g.color }}>
          <GroupMark g={g} size="9pt" color={dark ? INK : "#fff"} />
          <span className="zh">{g.name.zh}</span>
          <span>{g.name.en}</span>
        </div>
        <div className="deed-name">
          <span className="zh">{city.name.zh}</span>
          <span className="en">{city.name.en}</span>
        </div>
      </div>
      <DeedRows city={city} />
      <div className="rule">
        <div className="rule-title">
          <span className="zh">{city.rule.title.zh}</span>
          <small>{city.rule.title.en}</small>
          {city.rule.always && <span className="always zh">一直有效 Always on</span>}
        </div>
        <div className="rule-zh zh">{city.rule.text.zh}</div>
        <div className="rule-en">{city.rule.text.en}</div>
      </div>
      <div className="deed-foot">
        <span>{city.greeting.text}</span>
        <span>
          <span className="zh">{city.currency.zh}</span> · {city.currency.en}
        </span>
      </div>
    </div>
  );
}

function RouteDeed({ i }: { i: number }) {
  const r = ROUTES[i];
  return (
    <div className="deed">
      <div className="deed-head">
        <div className="deed-big-icon">
          <Plane size="0.5in" color={INK} strokeWidth={1.6} />
        </div>
        <div className="deed-name">
          <span className="zh">{r.name.zh}</span>
          <span className="en">{r.name.en}</span>
        </div>
      </div>
      <div className="rows" style={{ fontSize: "7.6pt", lineHeight: 1.6 }}>
        <div>
          <span>
            <b className="zh">价格</b> Price
          </span>
          <span>{money(ROUTE_PRICE)}</span>
        </div>
        <div className="hr" />
        {ROUTE_RENT.map((x, k) => (
          <div key={k}>
            <span>
              <span className="zh">有 {k + 1} 条航线</span> Own {k + 1}
            </span>
            <span>{money(x)}</span>
          </div>
        ))}
      </div>
      <div className="rule">
        <div className="rule-zh zh">停在这里的人按你有几条航线付票价。</div>
        <div className="rule-en">Whoever stops here pays a fare by how many routes you own.</div>
      </div>
    </div>
  );
}

function ServiceDeed({ i }: { i: number }) {
  const s = SERVICES[i];
  const Icon = s.id === "exchange" ? Coins : Smartphone;
  return (
    <div className="deed">
      <div className="deed-head">
        <div className="deed-big-icon">
          <Icon size="0.5in" color={INK} strokeWidth={1.6} />
        </div>
        <div className="deed-name">
          <span className="zh">{s.name.zh}</span>
          <span className="en">{s.name.en}</span>
        </div>
      </div>
      <div className="rows" style={{ fontSize: "7.6pt", lineHeight: 1.6 }}>
        <div>
          <span>
            <b className="zh">价格</b> Price
          </span>
          <span>{money(SERVICE_PRICE)}</span>
        </div>
        <div className="hr" />
      </div>
      <div className="rule" style={{ marginTop: 6 }}>
        <div className="rule-zh zh">
          有一项服务：租金是骰子点数 × {SERVICE_TIMES[0]}。两项都有：× {SERVICE_TIMES[1]}。
        </div>
        <div className="rule-en">
          Own one service: rent is the dice total × {SERVICE_TIMES[0]}. Own both: × {SERVICE_TIMES[1]}.
        </div>
      </div>
    </div>
  );
}

/* the few things a city rule hands out, so nobody has to improvise a token */

type MarkerDef = { key: string; city: string; Icon: LucideIcon; title: { zh: string; en: string }; zh: string; en: string; extra?: ReactNode };

const MARKERS: MarkerDef[] = [
  ...[1, 2].map(
    (n): MarkerDef => ({
      key: `policy${n}`,
      city: "london",
      Icon: ShieldCheck,
      title: { zh: "保单", en: "Lloyd's policy" },
      zh: "下次付租金只付一半，用完交回银行。",
      en: "Your next rent is halved. Then hand this back to the bank.",
    }),
  ),
  ...[1, 2].map(
    (n): MarkerDef => ({
      key: `permit${n}`,
      city: "singapore",
      Icon: Car,
      title: { zh: "拥车证", en: "Car permit" },
      zh: "移动时用一次：多走或少走一格。用完交回银行。",
      en: "Use it once when you move: one space more or less. Then hand it back to the bank.",
    }),
  ),
  {
    key: "ban",
    city: "mexicocity",
    Icon: Ban,
    title: { zh: "今日限行", en: "No driving today" },
    zh: "在挑中的一组号码上放个硬币。到挑号的人下回合之前，掷出这两个数的骰子不算步数。",
    en: "Put a coin on the chosen pair. Until the picker's next turn, a die showing either number doesn't count.",
    extra: (
      <div className="mk-pairs num">
        {[
          [1, 2],
          [3, 4],
          [5, 6],
        ].map(([a, b]) => (
          <span key={a}>
            <i>{a}</i>
            <i>{b}</i>
          </span>
        ))}
      </div>
    ),
  },
  {
    key: "signal",
    city: "hongkong",
    Icon: Wind,
    title: { zh: "八号风球", en: "Signal No. 8" },
    zh: "挂起来的时候全场免租，到挂球的人下回合开始为止。",
    en: "While this is up, nobody pays rent, until the next turn of whoever raised it.",
  },
  {
    key: "sales",
    city: "paris",
    Icon: Tag,
    title: { zh: "打折季", en: "Les soldes" },
    zh: "拿出来的时候所有人盖房半价，到宣布的人下回合开始为止。每局最多两次，用一次划一格。",
    en: "While this is out, everyone builds at half price, until the next turn of whoever called it. Twice a game: tick a box each time.",
    extra: (
      <div className="mk-ticks">
        <b />
        <b />
      </div>
    ),
  },
];

function MarkerHead({ city, Icon, title }: { city: string; Icon?: LucideIcon; title: { zh: string; en: string } }) {
  const c = cityById(city);
  const g = groupOf(c.group);
  const dark = g.id === 6;
  return (
    <div className="deed-head">
      <div className={`deed-band ${dark ? "dark" : ""}`} style={{ background: g.color }}>
        <GroupMark g={g} size="9pt" color={dark ? INK : "#fff"} />
        <span className="zh">{c.name.zh}</span>
        <span>{c.name.en}</span>
      </div>
      {Icon && (
        <div className="mk-icon">
          <Icon size="0.42in" color={INK} strokeWidth={1.6} />
        </div>
      )}
      <div className="deed-name mk-name">
        <span className="zh">{title.zh}</span>
        <span className="en">{title.en}</span>
      </div>
    </div>
  );
}

function Marker({ m }: { m: MarkerDef }) {
  return (
    <div className="deed">
      <MarkerHead city={m.city} Icon={m.Icon} title={m.title} />
      <div className="mk-text">
        <div className="mk-zh zh">{m.zh}</div>
        <div className="mk-en">{m.en}</div>
      </div>
      {m.extra}
    </div>
  );
}

function QuizCard() {
  return (
    <div className="deed">
      <MarkerHead city="shanghai" title={{ zh: "垃圾分类出题卡", en: "Sorting quiz" }} />
      <div className="quiz-how">
        <span className="zh">业主拿着这张，念一样东西；对方 3 秒内说出是哪一类。</span> The owner reads one item; the visitor has 3 seconds to name its bin.
      </div>
      <div className="quiz">
        {SORT_QUIZ.map((q) => (
          <div className="quiz-bin" key={q.bin.en}>
            <b>
              <span className="zh">{q.bin.zh}</span> {q.bin.en}
            </b>
            <p>
              {q.items.map((it, k) => (
                <span key={it.en}>
                  <span className="zh">{it.zh}</span> {it.en}
                  {k < q.items.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeedsDoc() {
  const items: ReactNode[] = [
    ...CITIES.map((c) => <Deed key={c.id} city={c} />),
    ...ROUTES.map((_, i) => <RouteDeed key={`r${i}`} i={i} />),
    ...SERVICES.map((_, i) => <ServiceDeed key={`s${i}`} i={i} />),
    ...MARKERS.map((m) => <Marker key={m.key} m={m} />),
    <QuizCard key="quiz" />,
  ];
  const pages: ReactNode[][] = [];
  for (let k = 0; k < items.length; k += 9) pages.push(items.slice(k, k + 9));
  return (
    <>
      {pages.map((p, k) => (
        <div className="page" key={k}>
          <div className="sheet">{p}</div>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ the two decks */

const cardCss = `
.cards { position: absolute; left: 0.75in; top: 0.5in; display: grid; grid-template-columns: repeat(2, 3.5in); grid-template-rows: repeat(4, 2.5in); }
.card { position: relative; width: 3.5in; height: 2.5in; border: 0.5pt dashed #a8a4b4; padding: 0.14in 0.18in; display: flex; flex-direction: column; background: #fff; }
.card-top { display: flex; align-items: center; gap: 6pt; font-size: 7.5pt; font-weight: 800; color: ${SOFT}; }
.card-top .zh { color: ${INK}; }
.card-title { margin-top: 8pt; font-size: 15pt; font-weight: 900; line-height: 1.15; }
.card-title small { display: block; font-size: 8.5pt; font-weight: 700; color: ${SOFT}; margin-top: 1pt; }
.card-zh { margin-top: 8pt; font-size: 10pt; font-weight: 600; line-height: 1.45; }
.card-en { margin-top: 4pt; font-size: 8.4pt; line-height: 1.35; color: #3a3650; }
.keep { position: absolute; right: 0.18in; top: 0.14in; font-size: 7pt; font-weight: 800; padding: 1pt 6pt; border-radius: 99pt; background: ${INK}; color: #fff; }
.stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 0.08in; }
.card-mark { position: absolute; right: -0.12in; bottom: -0.14in; opacity: 0.08; }
`;

function DeckCard({ card, deck }: { card: Card; deck: "journey" | "postcard" }) {
  const j = deck === "journey";
  const Icon = j ? Compass : Mail;
  return (
    <div className="card">
      <span className="stripe" style={{ background: j ? "#56b4e9" : ACCENT }} />
      <div className="card-top">
        <Icon size="13pt" color={INK} strokeWidth={2} />
        <span className="zh">{j ? "旅途卡" : "明信片"}</span>
        <span>{j ? "Journey" : "Postcard"}</span>
      </div>
      {card.keep && <span className="keep zh">留着用 Keep</span>}
      <div className="card-title">
        <span className="zh">{card.title.zh}</span>
        <small>{card.title.en}</small>
      </div>
      <div className="card-zh zh">{card.text.zh}</div>
      <div className="card-en">{card.text.en}</div>
      <span className="card-mark">
        <Icon size="1.25in" color={INK} strokeWidth={1.4} />
      </span>
    </div>
  );
}

function CardsDoc() {
  const items = [...JOURNEY.map((c) => ({ c, d: "journey" as const })), ...POSTCARDS.map((c) => ({ c, d: "postcard" as const }))];
  const pages: (typeof items)[] = [];
  for (let k = 0; k < items.length; k += 8) pages.push(items.slice(k, k + 8));
  return (
    <>
      {pages.map((p, k) => (
        <div className="page" key={k}>
          <div className="cards">
            {p.map(({ c, d }) => (
              <DeckCard key={`${d}-${c.id}`} card={c} deck={d} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ rules */

const rulesCss = `
.rules { position: absolute; left: 0.6in; right: 0.6in; top: 0.55in; bottom: 0.5in; column-count: 2; column-gap: 0.35in; font-size: 8.6pt; line-height: 1.5; }
.rules-head { column-span: all; margin-bottom: 10pt; padding-bottom: 8pt; border-bottom: 1.2pt solid ${INK}; display: flex; align-items: baseline; justify-content: space-between; gap: 10pt; }
.rules-head h1 { font-size: 22pt; font-weight: 900; line-height: 1.1; }
.rules-head span { font-size: 9pt; color: ${SOFT}; font-weight: 700; }
.rules h2 { break-after: avoid; font-size: 10.5pt; font-weight: 900; margin: 9pt 0 3pt; display: flex; align-items: center; gap: 5pt; }
.rules h2::before { content: ""; width: 7pt; height: 7pt; border-radius: 2pt; background: ${ACCENT}; flex: none; }
.rules p, .rules li { break-inside: avoid; }
.rules ul, .rules ol { padding-left: 13pt; }
.rules li { margin: 1.5pt 0; }
.rules .box { break-inside: avoid; background: #f4f1e8; border-radius: 6pt; padding: 6pt 8pt; margin: 5pt 0; }
.rules b { font-weight: 800; }
.rules-en { font-size: 8pt; line-height: 1.4; }
`;

function RulesZh() {
  return (
    <div className="page">
      <div className="rules zh">
        <div className="rules-head">
          <h1>到此一游 · 试玩规则</h1>
          <span>纸面原型 · 第 3 步定的数</span>
        </div>
        <h2>准备</h2>
        <ul>
          <li>2 到 6 个棋子。人多就组队，2 到 3 人共用一个棋子，一起商量，轮流掷骰。</li>
          <li>地契、卡和规则里的“你”和“玩家”都指一队（一个人玩也算一队），钱按队算。全桌举手、指人、保持安静的时候，每个人都算。</li>
          <li>
            每队 <b>{money(START_CASH)}</b>，后出发的队每晚一位多拿 {money(SEAT_BONUS)}（第二位 {money(START_CASH + SEAT_BONUS)}，第三位 {money(START_CASH + 2 * SEAT_BONUS)}）。找一个人当银行，地契按格子顺序交给他。旅途卡、明信片各自洗好，扣着放中间。
          </li>
          <li>选一种时长：15 分钟、1 小时，或不限时（见“怎么结束”）。15 分钟局开局时每队再随机发两张城市地契。</li>
        </ul>
        <h2>轮到你</h2>
        <ol>
          <li>
            掷两颗骰子，顺时针走。经过或停在“起飞”领 <b>{money(SALARY)}</b>。
          </li>
          <li>掷出一对：做完这一格再掷一次。连着第三次掷出一对，直接去入境审查。</li>
          <li>
            按停的格子做事：
            <ul>
              <li>
                <b>城市</b>：先做这座城的规则（写在地契上，棋盘上有规则名），再买、拍卖或付租金。
              </li>
              <li>
                <b>航线、服务</b>：没人有就可以买，有主就付租金。
              </li>
              <li>
                <b>旅途卡、明信片</b>：抽一张照做。写着“留着用”的卡放在自己面前。
              </li>
              <li>
                <b>离境税、超重行李</b>：付给银行。
              </li>
              <li>
                <b>护照过期</b>：去入境审查。<b>转机休息室</b>：歇一会儿，什么也不做。
              </li>
            </ul>
          </li>
        </ol>
        <h2>买地和拍卖</h2>
        <ul>
          <li>停在没人的城市、航线或服务上，可以按价买下。</li>
          <li>不买就马上拍卖，所有人都能出价，包括你。每次至少加 $10，数到 5 没人加价就成交，价钱可以低于原价。</li>
        </ul>
        <h2>租金和盖房</h2>
        <ul>
          <li>租金看地契。集齐一组（同颜色、同形状），没盖房的城租金翻倍。</li>
          <li>集齐一组后可以盖民宿，每栋价钱写在地契上。一组里要平均盖：每座都有一栋，才能盖第二栋。4 栋民宿之后可以换成 1 座酒店。</li>
          <li>没盖房的城可以按半价抵押给银行，抵押时不收租。赎回付押金再加一成。</li>
          <li>航线：有 1、2、3、4 条，票价是 {ROUTE_RENT.map(money).join("、")}。</li>
          <li>
            服务：有一项，租金是骰子点数 × {SERVICE_TIMES[0]}；两项都有，× {SERVICE_TIMES[1]}。
          </li>
        </ul>
        <h2>城市规则</h2>
        <div className="box">每座城市都有一条和它真实特点挂钩的规则。写着“一直有效”的规则（开罗、伊斯坦布尔、温哥华）不用停在上面也一直算数。规则和租金冲突时，按规则来。保单、拥车证、限行、风球、打折季和上海的出题卡在地契最后一页。</div>
        <h2>入境审查</h2>
        <ul>
          <li>被送去入境审查：直接过去，不经过起飞，不领钱。</li>
          <li>
            下回合开始时三选一：付 <b>{money(IMMIGRATION_FEE)}</b>，交一张免签卡，或者掷骰。掷出一对就出来并按点数走；没掷出就付 $50 出来，照常走。<b>最多只停一回合。</b>
          </li>
          <li>停在入境审查只是过境，什么事也没有。在里面照样收租、交易、盖房。</li>
        </ul>
        <h2>交易</h2>
        <ul>
          <li>随时可以交易：钱、城市、航线、服务、留着用的卡都能换。有房子的城要先把房子半价卖回银行才能交易。</li>
        </ul>
        <h2>破产和观众</h2>
        <ul>
          <li>钱不够时先半价卖房、抵押，还不够就破产。欠玩家的钱，你的东西全归他；欠银行的，城市回到银行马上拍卖。</li>
          <li>不能把东西白送给别人，帮谁赢。</li>
          <li>破产的队当观众：每队 5 个筹码，每回合开始前押“这回合他会不会付租金”。猜对拿回筹码再加 1 个，猜错筹码归银行。</li>
        </ul>
        <h2>怎么结束</h2>
        <ul>
          <li>
            <b>15 分钟局、1 小时局</b>：时间一到，打完这一圈。总资产最多的队赢：现金，加城市、航线、服务的原价，加房子的造价（开罗的房子算两倍）。抵押的按半价算。
          </li>
          <li>
            <b>不限时局</b>：哪队总资产先到 <b>{money(TARGET.more)}</b> 就赢（只有两队就到 {money(TARGET.two)}），或者只剩一队。大约 40 分钟。
          </li>
        </ul>
        <h2>派对规则（默认关）</h2>
        <div className="box">开局前大家都同意才开：一次付租金超过 $300 喝一口；进入境审查喝一口；在拉斯维加斯押输喝一口；破产喝一杯。</div>
        <h2>护照盖章</h2>
        <div className="box">每队一页护照。每停在一座城市，就在护照上把它划掉。8 个区域都至少有一座划掉了，从银行领 $300。结束时每座划掉的城算 $10 资产。</div>
        <h2>试玩时请留意</h2>
        <ul>
          <li>哪几条城市规则大家记住了，哪几条拖慢了游戏。</li>
          <li>一局实际玩了多久，最慢的是哪一步。</li>
          <li>等别人的时候，你有没有事做。</li>
        </ul>
      </div>
    </div>
  );
}

function RulesEn() {
  return (
    <div className="page">
      <div className="rules rules-en">
        <div className="rules-head">
          <h1>Play-test rules</h1>
          <span>Been There, Bought That · paper prototype, step 3 numbers</span>
        </div>
        <h2>Setup</h2>
        <ul>
          <li>Two to six tokens. A big group plays in teams: two or three people share a token, decide together and take turns rolling.</li>
          <li>"You" or "player" on a deed or card means a team (alone, you're a team of one), and the team shares its money. Votes and other whole-table moments include everyone.</li>
          <li>
            Each team starts with <b>{money(START_CASH)}</b>, and each later seat gets {money(SEAT_BONUS)} more ({money(START_CASH + SEAT_BONUS)} for the second, {money(START_CASH + 2 * SEAT_BONUS)} for the third). Someone plays the bank and keeps the deeds in board order. Shuffle the Journey cards and the Postcards and stack them face down.
          </li>
          <li>Pick a length: 15 minutes, 1 hour, or no limit (see "Ending"). In the 15-minute game, deal each team two random city deeds at the start.</li>
        </ul>
        <h2>Your turn</h2>
        <ol>
          <li>
            Roll two dice and move clockwise. Pass or land on Departure and collect <b>{money(SALARY)}</b>.
          </li>
          <li>Doubles: finish the space, then roll again. Third doubles in a row: straight to Immigration.</li>
          <li>
            Do what your space says:
            <ul>
              <li>
                <b>City</b>: do the city's rule first (on its deed; the board shows its name), then buy, auction or pay rent.
              </li>
              <li>
                <b>Route or service</b>: buy it if nobody owns it, pay rent if someone does.
              </li>
              <li>
                <b>Journey or Postcard</b>: draw one and do it. Cards marked Keep stay in front of you.
              </li>
              <li>
                <b>Departure Tax, Excess Baggage</b>: pay the bank.
              </li>
              <li>
                <b>Passport Expired</b>: go to Immigration. <b>Transit Lounge</b>: take a breather.
              </li>
            </ul>
          </li>
        </ol>
        <h2>Buying and auctions</h2>
        <ul>
          <li>Land on an unowned city, route or service and you may buy it at its price.</li>
          <li>If you pass, it goes up for auction straight away and everyone may bid, you included. Raise by at least $10; count to five with no new bid and it's sold, even below the price.</li>
        </ul>
        <h2>Rent and building</h2>
        <ul>
          <li>Rent is on the deed. Own a full group (same color and shape) and the rent on its unbuilt cities doubles.</li>
          <li>With a full group you can build houses at the cost on the deed. Build evenly: every city gets one before any gets two. After four houses, swap them for a hotel.</li>
          <li>Mortgage an unbuilt city to the bank for half its price; it earns no rent until you pay that back plus 10%.</li>
          <li>Routes: own one, two, three or four and the fare is {ROUTE_RENT.slice(0, 3).map(money).join(", ")} or {money(ROUTE_RENT[3])}.</li>
          <li>
            Services: own one and rent is the dice total × {SERVICE_TIMES[0]}; own both, × {SERVICE_TIMES[1]}.
          </li>
        </ul>
        <h2>City rules</h2>
        <div className="box">Every city has a rule taken from something real about it. Rules marked Always on (Cairo, Istanbul, Vancouver) count whether or not anyone is standing there. When a rule and the rent disagree, the rule wins. The tokens six cities hand out are on the last page of the deeds.</div>
        <h2>Immigration</h2>
        <ul>
          <li>Sent to Immigration: go straight there. Don't pass Departure, don't collect.</li>
          <li>
            At the start of your next turn, pick one: pay <b>{money(IMMIGRATION_FEE)}</b>, hand in a Visa Waiver, or roll. Doubles get you out and you move by them; otherwise pay $50, get out and move as usual. <b>Never more than one turn.</b>
          </li>
          <li>Landing on Immigration is just passing through. Inside, you still collect rent, trade and build.</li>
        </ul>
        <h2>Trading</h2>
        <ul>
          <li>Trade any time: cash, cities, routes, services and Keep cards. Sell a city's houses back to the bank at half price before trading it.</li>
        </ul>
        <h2>Going broke, and the audience</h2>
        <ul>
          <li>Short of cash? Sell houses at half price and mortgage first. Still short: you're out. Owe a player and they get everything; owe the bank and your cities go straight to auction.</li>
          <li>No giving things away to help someone else win.</li>
          <li>Teams that are out become the audience: five chips each, and before every turn they bet on whether that team will pay rent. Right: get the chip back plus one. Wrong: the bank keeps it.</li>
        </ul>
        <h2>Ending</h2>
        <ul>
          <li>
            <b>15-minute and 1-hour games</b>: when time's up, finish the round. The richest team wins: cash, plus the price of every city, route and service, plus what the buildings cost (Cairo's count double). Mortgaged ones count half.
          </li>
          <li>
            <b>No limit</b>: the first team to <b>{money(TARGET.more)}</b> in total wins ({money(TARGET.two)} with two teams), or the last team standing. About 40 minutes.
          </li>
        </ul>
        <h2>Party rules (off by default)</h2>
        <div className="box">Only if everyone agrees before you start: a sip for paying more than $300 rent at once, a sip for going to Immigration, a sip for losing a bet in Las Vegas, a full drink for going broke.</div>
        <h2>Passport stamps</h2>
        <div className="box">Each team gets a passport page. Every time you stop on a city, cross it off. Cross off at least one city in all eight regions and collect $300 from the bank. At the end, each crossed-off city is worth $10.</div>
        <h2>While you play, notice</h2>
        <ul>
          <li>Which city rules people remember, and which slow the game down.</li>
          <li>How long the game really took, and the slowest step.</li>
          <li>Whether you had something to do while waiting.</li>
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ passports and money */

const extraCss = `
.passport { position: absolute; left: 0.5in; right: 0.5in; height: 3.3in; border: 1pt solid ${INK}; border-radius: 12pt; padding: 0.16in 0.24in; }
.pp-head { display: flex; align-items: center; gap: 8pt; border-bottom: 1pt solid ${INK}; padding-bottom: 6pt; }
.pp-head h2 { font-size: 15pt; font-weight: 900; }
.pp-head span { font-size: 8.5pt; color: ${SOFT}; font-weight: 700; }
.pp-team { margin-left: auto; font-size: 9pt; font-weight: 700; }
.pp-team i { display: inline-block; width: 1.6in; border-bottom: 0.8pt solid ${INK}; margin-left: 4pt; }
.pp-grid { margin-top: 7pt; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5pt 8pt; }
.pp-region { border: 0.6pt solid ${LINE}; border-radius: 7pt; padding: 4pt 6pt; }
.pp-region-name { display: flex; align-items: center; gap: 4pt; font-size: 7.6pt; font-weight: 800; margin-bottom: 3pt; }
.pp-region-name i { width: 12pt; height: 12pt; border-radius: 3pt; display: grid; place-items: center; }
.pp-city { display: grid; grid-template-columns: 10pt 1fr; column-gap: 5pt; align-items: center; margin: 2pt 0; }
.pp-city b { width: 10pt; height: 10pt; border: 0.9pt solid ${INK}; border-radius: 2pt; grid-row: span 2; }
.pp-city .zh { font-size: 8.2pt; font-weight: 700; line-height: 1.1; }
.pp-city small { font-size: 6pt; color: ${SOFT}; line-height: 1.1; }
.pp-foot { margin-top: 6pt; font-size: 7pt; color: ${SOFT}; line-height: 1.35; }
.bills { position: absolute; left: 0.5in; top: 0.35in; display: grid; grid-template-columns: repeat(3, 2.5in); grid-template-rows: repeat(8, 1.28in); }
.bill { position: relative; border: 0.5pt dashed #a8a4b4; padding: 0.1in 0.14in; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.bill-n { font-family: "Unbounded"; font-weight: 900; font-size: 24pt; line-height: 1; }
.bill-name { font-size: 7pt; font-weight: 800; display: flex; justify-content: space-between; }
.bill-mark { position: absolute; right: -0.16in; bottom: -0.2in; opacity: 0.18; }
`;

function Passport({ top }: { top: string }) {
  return (
    <div className="passport" style={{ top }}>
      <div className="pp-head">
        <Stamp size="18pt" color={INK} strokeWidth={1.8} />
        <h2 className="zh">护照</h2>
        <span>Passport</span>
        <span className="pp-team zh">
          队名 Team<i />
        </span>
      </div>
      <div className="pp-grid">
        {GROUPS.map((g) => (
          <div className="pp-region" key={g.id}>
            <div className="pp-region-name">
              <i style={{ background: g.color }}>
                <GroupMark g={g} size="8pt" color={g.id === 6 ? INK : "#fff"} />
              </i>
              <span className="zh">{g.name.zh}</span>
            </div>
            {CITIES.filter((c) => c.group === g.id).map((c) => (
              <div className="pp-city" key={c.id}>
                <b />
                <span className="zh">{c.name.zh}</span>
                <small>{c.name.en}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="pp-foot zh">每停在一座城就划掉它。8 个区域都划到了，领 $300。结束时每座划掉的城算 $10。 · Cross off every city you stop on. One in each of the eight regions: collect $300. Each one counts $10 at the end.</p>
    </div>
  );
}

const BILLS: { n: number; color: string }[] = [
  { n: 5, color: "#f3e7c9" },
  { n: 10, color: "#d9eef7" },
  { n: 20, color: "#e3f2dc" },
  { n: 50, color: "#f7dfe9" },
  { n: 100, color: "#fde3c8" },
  { n: 500, color: "#e2dcf5" },
];
/** One page of play money: how many of each note. */
const BILL_MIX = [4, 4, 4, 4, 5, 3];

function MoneyPage() {
  const notes = BILLS.flatMap((b, k) => Array.from({ length: BILL_MIX[k] }, () => b));
  return (
    <div className="page">
      <div className="bills">
        {notes.map((b, k) => (
          <div className="bill" key={k} style={{ background: b.color }}>
            <div className="bill-name">
              <span className="zh">到此一游</span>
              <span>Been There, Bought That</span>
            </div>
            <div className="bill-n">{money(b.n)}</div>
            <span className="bill-mark">
              <Earth size="0.9in" color={INK} strokeWidth={1.2} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtrasDoc() {
  return (
    <>
      {[0, 1].map((k) => (
        <div className="page" key={`p${k}`}>
          <Passport top="0.3in" />
          <Passport top="3.85in" />
          <Passport top="7.4in" />
        </div>
      ))}
      {[0, 1, 2].map((k) => (
        <MoneyPage key={`m${k}`} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ print */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const docs: { file: string; title: string; body: ReactNode; css: string }[] = [
    { file: "到此一游-1-棋盘-board.pdf", title: "棋盘 Board", body: <BoardDoc />, css: boardCss + tileCss },
    { file: "到此一游-2-地契-deeds.pdf", title: "地契 Deeds", body: <DeedsDoc />, css: deedCss },
    { file: "到此一游-3-卡牌-cards.pdf", title: "卡牌 Cards", body: <CardsDoc />, css: cardCss },
    {
      file: "到此一游-4-规则-rules.pdf",
      title: "规则 Rules",
      body: (
        <>
          <RulesZh />
          <RulesEn />
        </>
      ),
      css: rulesCss,
    },
    { file: "到此一游-5-护照和钱-passports-money.pdf", title: "护照和钱 Passports and money", body: <ExtrasDoc />, css: extraCss },
  ];
  const browser = await chromium.launch();
  // lay out at the paper's own width (8.5in at 96 dpi), or Chromium shrinks the print to fit its window
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  for (const d of docs) {
    const file = join(OUT, d.file.replace(/\.pdf$/, ".html"));
    writeFileSync(file, html(d.title, d.body, d.css));
    await page.goto(`file://${file}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: join(OUT, d.file), preferCSSPageSize: true, printBackground: true });
    console.log("wrote", d.file);
  }
  await browser.close();
}

void main();
