// Step 5 style sheet: three art directions drawn with the same things (arriving in Venice, the board,
// a token character, a passport stamp, a decision card) so they can be compared side by side.
// Direction A uses the real game components; B and C are drawn just for this page.
import { render, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { GROUPS } from "../engine";
import { Character, CHARACTERS, type Mood } from "../client/art/characters";
import { LandingCard } from "../client/art/LandingCard";
import { CityPoster } from "../client/art/posters";
import { RoundBoard, type SpaceMark, type TokenMark } from "../client/art/RoundBoard";
import { Stamp } from "../client/art/stamps";
import { installTextures } from "../client/art/texture";
import { setLang } from "../client/i18n";
import { IsoBoard, IsoSuitcase, IsoVenice } from "./iso";
import { PolyGlobe, PolySuitcase, PolyVenice } from "./poly";

const TEAM = CHARACTERS.map((c) => c.color);
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const marks: (SpaceMark | null)[] = Array(40).fill(null);
const own = (at: number, team: number, houses = 0) => (marks[at] = { owner: { color: TEAM[team], letter: "ABCDEF"[team] }, houses });
own(1, 4, 2);
own(3, 4, 1);
own(6, 0);
own(9, 1, 3);
own(14, 2);
own(18, 3, 5);
own(23, 0);
own(31, 5, 4);
own(32, 5, 4);
own(34, 5, 4);
own(5, 2);
own(37, 1);

const TOKENS: TokenMark[] = [
  { seat: 0, at: 31, kind: 5 },
  { seat: 1, at: 24, kind: 4 },
  { seat: 2, at: 9, kind: 2 },
  { seat: 3, at: 14, kind: 3 },
];
const HOPS = [
  { from: "shanghai", to: "venice" },
  { from: "venice", to: "shanghai" },
  { from: "shanghai", to: "rio" },
  { from: "rio", to: "dubai" },
];

function BoardDemo() {
  const [turn, setTurn] = useState(0);
  const [flight, setFlight] = useState(0);
  const reduced = reducedMotion();
  const tk = TOKENS[turn % TOKENS.length];
  const hop = HOPS[turn % HOPS.length];
  return (
    <div class="board-demo">
      <RoundBoard
        marks={marks}
        tokens={TOKENS.map((t, i) => ({ ...t, mood: i === turn % TOKENS.length ? ("happy" as Mood) : "idle" }))}
        focus={tk.at}
        active={tk.at}
        flight={{ ...hop, key: `${turn}-${flight}` }}
        reduced={reduced}
      />
      <div class="demo-actions">
        <button type="button" class="tbtn primary" onClick={() => setTurn((n) => n + 1)}>
          轮到下一位
        </button>
        <button type="button" class="tbtn" onClick={() => setFlight((n) => n + 1)}>
          再飞一趟
        </button>
      </div>
    </div>
  );
}

const MOODS: { mood: Mood; label: string }[] = [
  { mood: "idle", label: "平常" },
  { mood: "happy", label: "收租" },
  { mood: "shock", label: "交大租" },
  { mood: "curious", label: "抽卡" },
  { mood: "smug", label: "集齐一组" },
  { mood: "sad", label: "破产" },
];

function Cast() {
  const [mood, setMood] = useState(0);
  return (
    <div class="cast">
      <div class="mood-tabs" role="tablist" aria-label="表情">
        {MOODS.map((m, i) => (
          <button key={m.mood} type="button" role="tab" aria-selected={i === mood} class={i === mood ? "on" : ""} onClick={() => setMood(i)}>
            {m.label}
          </button>
        ))}
      </div>
      <ul class="cast-grid">
        {CHARACTERS.map((c, k) => (
          <li key={c.key}>
            <Character kind={k} mood={MOODS[mood].mood} size={112} />
            <b>{c.name.zh}</b>
            <span>{c.name.en}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Landing() {
  const [lang, setL] = useState<"zh" | "en">("zh");
  const [n, setN] = useState(0);
  setLang(lang);
  return (
    <div class="landing-demo">
      <div class="seg" role="group" aria-label="语言">
        <button type="button" class={lang === "zh" ? "on" : ""} onClick={() => setL("zh")}>
          中文
        </button>
        <button type="button" class={lang === "en" ? "on" : ""} onClick={() => setL("en")}>
          English
        </button>
        <button type="button" onClick={() => setN((x) => x + 1)}>
          再落地一次
        </button>
      </div>
      <LandingCard key={`${lang}${n}`} id="venice" stamp fresh />
    </div>
  );
}

function Passport() {
  const placed: [string, number, number, number][] = [
    ["capetown", 8, 10, -9],
    ["rio", 132, 36, 7],
    ["tokyo", 40, 136, 4],
    ["venice", 14, 18, 8],
    ["dubai", 150, 8, -6],
    ["hongkong", 112, 130, -12],
  ];
  return (
    <div class="passport">
      <div class="passport-page">
        {placed.slice(0, 3).map(([id, x, y, r]) => (
          <div key={id} style={{ position: "absolute", left: `${x}px`, top: `${y}px` }}>
            <Stamp id={id} size={104} turn={r} />
          </div>
        ))}
        <span class="pageno">7</span>
      </div>
      <div class="passport-page">
        {placed.slice(3).map(([id, x, y, r]) => (
          <div key={id} style={{ position: "absolute", left: `${x}px`, top: `${y}px` }}>
            <Stamp id={id} size={104} turn={r} />
          </div>
        ))}
        <span class="pageno">8</span>
      </div>
    </div>
  );
}

function Pass() {
  return (
    <div class="pass">
      <div class="pass-head">
        <span>登机牌 · Boarding pass</span>
        <span>第 7 回合</span>
      </div>
      <div class="pass-route">
        <div>
          <small>FROM</small>
          <b>SHA</b>
        </div>
        <svg width="64" height="18" viewBox="0 0 64 18" aria-hidden="true">
          <path d="M2 9h44" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" />
          <path d="M62 9l-9-6v4l-7 1v2l7 1v4z" fill="currentColor" />
        </svg>
        <div class="to">
          <small>TO</small>
          <b>VCE</b>
        </div>
      </div>
      <p class="pass-q">威尼斯还没人买。买下它，还是交给大家拍卖？</p>
      <div class="pass-cut" />
      <div class="pass-actions">
        <button type="button" class="tbtn primary">
          买下 <span class="num">$350</span>
        </button>
        <button type="button" class="tbtn">不买，拍卖</button>
      </div>
    </div>
  );
}

function Swatches({ colors }: { colors: [string, string][] }) {
  return (
    <ul class="swatches">
      {colors.map(([c, name]) => (
        <li key={c}>
          <i style={{ background: c }} />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

function Item({ title, note, children, wide }: { title: string; note: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <figure class={`item${wide ? " wide" : ""}`}>
      <div class="item-art">{children}</div>
      <figcaption>
        <b>{title}</b>
        {note}
      </figcaption>
    </figure>
  );
}

function DirectionA() {
  return (
    <section id="a" class="dir dir-a" aria-labelledby="a-title">
      <header class="dir-head">
        <p class="dir-tag">
          方向 A <em>我推荐</em>
        </p>
        <h2 id="a-title">黄金时代旅行</h2>
        <p class="dir-en">Golden Age of Travel</p>
        <p class="dir-lede">1930 年代的旅行海报、行李贴纸、护照章和登机牌。纸张、油墨、平涂色块，每座城一张海报，海报里画的就是这座城的规则。</p>
      </header>
      <div class="items">
        <Item title="落地那一刻" note="海报、两种语言的城名、本地话问候、当地货币，城市规则写在票根上，新的护照章「咔」地盖上。">
          <Landing />
        </Item>
        <Item title="手机上的选择" note="每个要你做决定的时刻都是一张登机牌：从哪儿来、到哪儿去、选什么。">
          <Pass />
        </Item>
        <Item title="圆桌转盘棋盘" note="开席的「转盘」：轮到谁，桌子就转到谁面前。中间是从北极上空看的航线图，跨区域时小飞机沿真实航线飞过去。" wide>
          <BoardDemo />
        </Item>
        <Item title="六个棋子角色" note="相机、颈枕、导游旗、背包、行李箱、雪花球，用 1930 年代老动画的画法（橡皮管手臂、白手套）。点上面的按钮看表情。" wide>
          <Cast />
        </Item>
        <Item title="护照" note="每座城一个章。章的形状跟颜色组一致：三角是非洲，圆是拉美，菱形是中东南亚……不看颜色也分得出。" wide>
          <Passport />
        </Item>
        <Item title="海报画的是规则" note="东京的满员电车、开普敦最后一滴水、香港的八号风球。玩过一次就记得这座城有什么事。" wide>
          <div class="poster-row">
            {["tokyo", "capetown", "hongkong"].map((id) => (
              <div key={id} class="poster mini">
                <CityPoster id={id} />
              </div>
            ))}
          </div>
        </Item>
        <Item title="颜色和字体" note="站酷庆科黄油体（中文标题）、Big Shoulders Display（英文标题）、Space Mono（票面上的数字），都是开放字体许可，可以商用。" wide>
          <Swatches
            colors={[
              ["#f4ead5", "纸"],
              ["#1d2340", "墨"],
              ["#c8432b", "朱红"],
              ["#2f7d6d", "铜绿"],
              ["#e3a72f", "芥黄"],
              ...GROUPS.map((g) => [g.color, g.name.zh] as [string, string]),
            ]}
          />
          <p class="type-a">
            <span class="t1">到此一游</span>
            <span class="t2">Been There, Bought That</span>
            <span class="t3">SHA → VCE · $350</span>
          </p>
        </Item>
      </div>
    </section>
  );
}

function DirectionB() {
  return (
    <section id="b" class="dir dir-b" aria-labelledby="b-title">
      <header class="dir-head">
        <p class="dir-tag">方向 B</p>
        <h2 id="b-title">纪念品小模型</h2>
        <p class="dir-en">Souvenir Diorama</p>
        <p class="dir-lede">每座城是一个等距视角的小模型，像冰箱贴，也像雪花球的底座。颜色粉嫩，边角圆润，像玩具。</p>
      </header>
      <div class="items">
        <Item title="落地那一刻" note="威尼斯是一块被水淹了的小广场，钟楼、总督府、贡多拉船都在上面。">
          <div class="b-card">
            <IsoVenice />
            <h3>威尼斯</h3>
            <p class="b-en">VENICE</p>
            <p class="b-chips">
              <span>Ciao!</span>
              <span>欧元</span>
            </p>
            <p class="b-rule">
              <b>涨潮</b> 掷一颗骰子，1 或 2 就涨潮，租金减半。
            </p>
          </div>
        </Item>
        <Item title="棋盘" note="一格一块小积木，买下的格子上长出小房子。">
          <div class="b-panel wide-art">
            <IsoBoard />
          </div>
        </Item>
        <Item title="棋子角色" note="同一个行李箱角色，做成胖乎乎的搪胶玩具。">
          <div class="b-panel">
            <IsoSuitcase />
          </div>
        </Item>
        <Item title="护照章" note="贴纸风格：白边、阴影、亮面。">
          <div class="b-panel b-center">
            <div class="b-sticker">
              <span>威尼斯</span>
              <small>VENICE · 到此一游</small>
            </div>
          </div>
        </Item>
        <Item title="手机上的选择" note="圆角、胖按钮、渐变色。">
          <div class="b-pass">
            <p>威尼斯还没人买。买下它，还是交给大家拍卖？</p>
            <button type="button">买下 $350</button>
            <button type="button" class="ghost">
              不买，拍卖
            </button>
          </div>
        </Item>
        <Item title="颜色和字体" note="站酷快乐体、Baloo 2。">
          <Swatches
            colors={[
              ["#d7f3ee", "薄荷"],
              ["#ffe9d6", "蜜桃"],
              ["#ffb547", "橙"],
              ["#ff7a6b", "珊瑚"],
              ["#5a6bd8", "蓝紫"],
              ["#2c2a4a", "深紫"],
            ]}
          />
        </Item>
      </div>
    </section>
  );
}

function DirectionC() {
  return (
    <section id="c" class="dir dir-c" aria-labelledby="c-title">
      <header class="dir-head">
        <p class="dir-tag">方向 C</p>
        <h2 id="c-title">低多边形地球</h2>
        <p class="dir-en">Low-poly Globe</p>
        <p class="dir-lede">大屏幕中间是一个会转的多边形 3D 地球，飞机沿航线飞过去；手机上是切面风格的画，深色、带霓虹光。</p>
      </header>
      <div class="items">
        <Item title="大屏幕" note="地球一直在转，三条航线上的小飞机来回飞。真做的话用 Three.js。" wide>
          <div class="c-panel c-center">
            <PolyGlobe size={340} />
          </div>
        </Item>
        <Item title="落地那一刻" note="切面风格的威尼斯黄昏。">
          <div class="c-card">
            <PolyVenice />
            <h3>威尼斯</h3>
            <p class="c-en">VENICE · Ciao · 欧元</p>
            <p class="c-rule">
              <b>涨潮</b> 掷一颗骰子，1 或 2 就涨潮，租金减半。
            </p>
          </div>
        </Item>
        <Item title="棋子角色" note="同一个行李箱，做成多边形。">
          <div class="c-panel c-center">
            <PolySuitcase />
          </div>
        </Item>
        <Item title="护照章" note="金属感的六边形徽章。">
          <div class="c-panel c-center">
            <div class="c-badge">
              <span>威尼斯</span>
              <small>VCE</small>
            </div>
          </div>
        </Item>
        <Item title="手机上的选择" note="深色毛玻璃、霓虹按钮。">
          <div class="c-pass">
            <p>威尼斯还没人买。买下它，还是交给大家拍卖？</p>
            <button type="button">买下 $350</button>
            <button type="button" class="ghost">
              不买，拍卖
            </button>
          </div>
        </Item>
        <Item title="颜色和字体" note="Outfit、思源黑体。">
          <Swatches
            colors={[
              ["#0e1024", "夜空"],
              ["#2c2870", "靛蓝"],
              ["#ff8660", "晚霞"],
              ["#5ef0c8", "霓虹绿"],
              ["#ff7ac8", "霓虹粉"],
              ["#f2f2f2", "白"],
            ]}
          />
        </Item>
      </div>
    </section>
  );
}

const COMPARE: [string, string, string, string][] = [
  ["像在环游世界", "最像：护照章、行李贴纸、登机牌都是旅行里真有的东西", "像收集纪念品", "大屏幕上最有「飞」的感觉"],
  ["手机上看得清", "清楚：平涂色块，字和图分得开", "小格子里的模型容易糊", "深色加霓虹，字小了难看清"],
  ["便宜安卓、微信里流畅", "最轻：全是矢量图，几乎不占流量", "还行", "最重：3D 地球在老手机上会卡"],
  ["22 座城画风一致", "能保证：同一套形状规则画出来", "要画 22 个小模型，工作量大", "22 个 3D 模型，工作量最大"],
  ["和开席「转盘」接得上", "圆形棋盘就是转盘", "可以做成转盘", "地球本身在转，但不像餐桌"],
  ["不像大富翁", "最远：圆棋盘、海报风", "远", "远"],
];

function App() {
  return (
    <main class="sheet">
      <header class="intro">
        <p class="kicker">到此一游 · 第 5 步</p>
        <h1>美术方向：三套样张</h1>
        <p class="lede">三套风格画的是同一样东西：落地威尼斯的那一刻、棋盘、棋子角色、护照章、手机上的选择卡。往下翻，看哪套最像你想要的「环游世界」。</p>
        <nav class="jump" aria-label="三个方向">
          <a href="#a">A 黄金时代旅行</a>
          <a href="#b">B 纪念品小模型</a>
          <a href="#c">C 低多边形地球</a>
        </nav>
        <div class="pick">
          <p class="pick-title">我选 A，已经按它开始画 22 座城。</p>
          <ul>
            <li>护照章、行李贴纸、登机牌、机场翻牌屏，都是旅行里真有的东西，一看就懂。</li>
            <li>圆形棋盘就是开席的「转盘」：轮到谁就转向谁。</li>
            <li>平面矢量图在便宜安卓和微信里也流畅，字清楚。</li>
            <li>每张海报用同一套画法，22 座城能保证画风一致，全部原创。</li>
            <li>想换 B 或 C，跟我说一声就行，规则和联机部分都不用改。</li>
          </ul>
        </div>
      </header>
      <DirectionA />
      <DirectionB />
      <DirectionC />
      <section class="compare" aria-labelledby="cmp-title">
        <h2 id="cmp-title">放在一起比</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">A 黄金时代旅行</th>
                <th scope="col">B 纪念品小模型</th>
                <th scope="col">C 低多边形地球</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([q, a, b, c]) => (
                <tr key={q}>
                  <th scope="row">{q}</th>
                  <td class="win">{a}</td>
                  <td>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer class="notes">
        <p>素材来源：海报、角色、护照章都是用代码画的原创图形；地图是 Natural Earth 的公有领域数据；字体都是 SIL 开放字体许可（OFL），可以免费商用。每一样都会登记进素材授权表。</p>
        <p>海报里只画老建筑和自然景观。还受版权保护的新建筑（比如哈利法塔）和注册商标（比如新加坡鱼尾狮）不画。</p>
      </footer>
    </main>
  );
}

installTextures();
render(<App />, document.getElementById("app")!);
