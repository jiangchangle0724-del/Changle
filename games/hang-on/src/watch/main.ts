/**
 * 观众页（11-26，`/hang-on/watch/`）：没在玩的人拿手机押谁先掉、投票帮一把或捣个乱、起哄。
 * 不走 WebRTC，也不画画面（眼睛在电视上）：只连房间的 WebSocket（role=watch，带 id 和名字），
 * 跟主机说 `{ k: 'crowd' }`，收主机发给所有观众的那份账（`{ k: 'crowdState' }`，见 src/crowd.ts）。
 */
import { CHEER_GAP_MS, CHEERS, FX, type CrowdIn, type CrowdState } from '../crowd';
import { applyStatic, langButton, onLang, pickLang, tr } from '../i18n';
import { seatId } from '../net/pad-link';
import { CODE_RE, type FatalKey, type RoomView, type ServerMsg } from '../net/protocol';
import { RoomSocket, wsUrl } from '../net/socket';

// 在哪儿连按两下都不放大（两根手指照样能放大）：iPhone 的 Safari 只在有人听点击的地方看 touch-action
document.documentElement.addEventListener('click', () => {});

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

applyStatic();
langButton($<HTMLButtonElement>('langBtn'));
langButton($<HTMLButtonElement>('langBtn2'));

// ---------- 加入 ----------
const params = new URLSearchParams(location.search);
const codeIn = $<HTMLInputElement>('code');
const nameIn = $<HTMLInputElement>('name');
codeIn.value = (params.get('code') ?? '').toUpperCase().slice(0, 4);
try {
  nameIn.value = localStorage.getItem('hang-on:name') ?? '';
} catch {
  // 没有存储
}
/** 「我要玩」「去当手柄」带上房间码。 */
function padHref(code: string): string {
  return CODE_RE.test(code) ? `../pad/?code=${code}` : '../pad/';
}
codeIn.addEventListener('input', () => {
  $<HTMLAnchorElement>('padLink').href = padHref(codeIn.value.trim().toUpperCase());
});
$<HTMLAnchorElement>('padLink').href = padHref(codeIn.value);

const REJOIN_KEY = 'hang-on:watching';
const REJOIN_MS = 20 * 60 * 1000;

let sock: RoomSocket | null = null;
let code = '';
let myName = '';
const me = seatId();
let room: RoomView | null = null;
let state: CrowdState | null = null;
/** 投票还剩几毫秒是收到那一刻算的：截止在本机的什么时候。 */
let voteEnds = 0;
let socketOpen = false;

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = codeIn.value.trim().toUpperCase();
  if (!CODE_RE.test(c)) {
    $('err').textContent = tr('房间码是电视上那 4 个字母', 'The room code is the 4 letters on the TV');
    return;
  }
  $('err').textContent = '';
  const n = nameIn.value.trim() || tr('观众', 'Fan');
  try {
    localStorage.setItem('hang-on:name', n);
  } catch {
    // 记不住就记不住
  }
  watch(c, n);
});

function watch(c: string, n: string): void {
  code = c;
  myName = n;
  try {
    sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ code: c, at: Date.now() }));
  } catch {
    // 记不住就算了
  }
  sock?.close();
  state = null;
  room = null;
  $('join').hidden = true;
  $('fatal').hidden = true;
  $('app').hidden = false;
  $<HTMLAnchorElement>('playLink').href = padHref(c);
  render();
  sock = new RoomSocket(
    () => wsUrl(c, { role: 'watch', id: me, name: n }),
    onMsg,
    (open) => {
      socketOpen = open;
      // 每次（重新）连上都打个招呼，主机回一份账
      if (open) say({ do: 'hello' });
      render();
    },
  );
}

function say(c: CrowdIn): boolean {
  return !!sock?.send({ t: 'relay', to: 'host', data: { k: 'crowd', c } });
}

function onMsg(m: ServerMsg): void {
  switch (m.t) {
    case 'room':
      room = m.room;
      render();
      return;
    case 'relay':
      if (m.from === 'host' && m.data.k === 'crowdState') {
        state = m.data.s;
        voteEnds = state.vote ? performance.now() + state.vote.left : 0;
        render();
      }
      return;
    case 'fatal':
      fatal(m.key);
      return;
    default:
      return;
  }
}

function fatal(key: FatalKey): void {
  try {
    sessionStorage.removeItem(REJOIN_KEY);
  } catch {
    // 没有存储
  }
  const t: Partial<Record<FatalKey, [string, string, string, string]>> = {
    noRoom: ['没有这个房间', 'No such room', '看看电视上的房间码，再输一遍。', 'Check the room code on the TV and try again.'],
    ended: ['这局结束了', 'This game is over', '主机结束了这局。要接着看，输新的房间码。', 'The host ended the game. Type the new room code to keep watching.'],
    full: ['观众满了', 'Too many watchers', '一个房间最多 30 个观众。', 'A room takes up to 30 watchers.'],
  };
  const [zt, et, zx, ex] = t[key] ?? ['连不上', 'Can’t connect', '刷新一下再试。', 'Refresh and try again.'];
  $('fatalTitle').textContent = tr(zt, et);
  $('fatalText').textContent = tr(zx, ex);
  $('app').hidden = true;
  $('fatal').hidden = false;
}
$('fatalBtn').addEventListener('click', () => {
  $('fatal').hidden = true;
  $('join').hidden = false;
  codeIn.focus();
});

// ---------- 押谁先掉 ----------
function renderBets(): void {
  const s = state;
  const box = $('players');
  const mine = s?.bets[me];
  if (!s || !s.players.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = tr('还没有人在玩，等他们进来', 'Nobody is playing yet. Waiting for players');
    box.replaceChildren(p);
    $('betHint').textContent = '';
    $('betResult').textContent = '';
    return;
  }
  const counts = new Map<string, number>();
  for (const k of Object.values(s.bets)) counts.set(k, (counts.get(k) ?? 0) + 1);
  box.replaceChildren(
    ...s.players.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pl${s.first === p.key ? ' first' : ''}`;
      b.setAttribute('aria-pressed', String(mine === p.key));
      b.disabled = !s.open;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.name;
      const n = document.createElement('span');
      n.className = 'n';
      const c = counts.get(p.key) ?? 0;
      n.textContent = c ? tr(`${c} 人押`, `${c} in`) : '';
      b.append(dot, nm, n);
      b.addEventListener('click', () => {
        if (!state?.open || state.bets[me] === p.key) return;
        if (say({ do: 'bet', on: p.key })) {
          // 先在自己手机上亮起来，主机的账回来再对一遍
          state = { ...state, bets: { ...state.bets, [me]: p.key } };
          renderBets();
        }
      });
      return b;
    }),
  );
  $('betHint').textContent = s.open
    ? mine
      ? tr('押好了，开局前还能改；押中的记一次', 'You’re in. You can change it before the round starts')
      : tr('开局前点一个人：你猜这一局谁第一个掉下去', 'Before the round starts, tap who you think falls first')
    : mine
      ? tr('开局了，押的锁上了，等着看', 'The round is on. Your bet is locked in')
      : tr('这局开始了，下一局开局前再押', 'This round has started. Bet before the next one');
  const hits = s.hits[me] ?? 0;
  const firstName = s.players.find((p) => p.key === s.first)?.name;
  const lines: string[] = [];
  const res = $('betResult');
  res.className = 'result';
  if (firstName) {
    if (mine === s.first) {
      lines.push(tr(`${firstName} 先掉了，你押中了！🎉`, `${firstName} fell first. You called it! 🎉`));
      res.className = 'result win';
    } else lines.push(tr(`${firstName} 先掉了`, `${firstName} fell first`) + (mine ? tr('，这次没押中', '. Not this time') : ''));
  }
  if (hits) lines.push(tr(`你一共押中 ${hits} 次`, `You’ve called it ${hits} time${hits > 1 ? 's' : ''}`));
  res.textContent = lines.join(' · ');
}

// ---------- 投票 ----------
function renderVote(): void {
  const v = state?.vote;
  $('voteCard').hidden = !v;
  if (!v) return;
  const left = Math.max(0, Math.ceil((voteEnds - performance.now()) / 1000));
  $('voteTitle').textContent = tr(`观众投票 · 还剩 ${left} 秒`, `Crowd vote · ${left}s left`);
  const mine = v.mine[me];
  const fill = (id: 'voteA' | 'voteB', fx: keyof typeof FX, side: 0 | 1): void => {
    const b = $<HTMLButtonElement>(id);
    const f = FX[fx];
    const strong = document.createElement('span');
    strong.textContent = `${f.emoji} ${tr(f.zh, f.en)}`;
    const small = document.createElement('small');
    small.textContent = `${side === 0 ? tr('帮一把', 'Help them') : tr('捣个乱', 'Mess with them')} · ${tr(`${v.n[side]} 票`, `${v.n[side]} vote${v.n[side] === 1 ? '' : 's'}`)}`;
    b.replaceChildren(strong, small);
    b.setAttribute('aria-pressed', String(mine === side));
    b.classList.toggle('picked-other', mine !== undefined && mine !== side);
  };
  fill('voteA', v.a, 0);
  fill('voteB', v.b, 1);
  const all = v.n[0] + v.n[1];
  $('vbarA').style.width = `${all ? (v.n[0] / all) * 100 : 50}%`;
  $('vbarB').style.width = `${all ? (v.n[1] / all) * 100 : 50}%`;
}
for (const [id, side] of [['voteA', 0], ['voteB', 1]] as const) {
  $(id).addEventListener('click', () => {
    const v = state?.vote;
    if (!v || v.mine[me] === side || voteEnds <= performance.now()) return;
    if (!say({ do: 'vote', v: side })) return;
    const n: [number, number] = [...v.n];
    const was = v.mine[me];
    if (was !== undefined) n[was] = Math.max(0, n[was] - 1);
    n[side]++;
    state = { ...state!, vote: { ...v, n, mine: { ...v.mine, [me]: side } } };
    renderVote();
  });
}
// 投票的秒数每秒走一下
setInterval(() => {
  if (state?.vote) renderVote();
}, 250);

// ---------- 起哄 ----------
let cheerAt = 0;
$('cheerGrid').replaceChildren(
  ...CHEERS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ch';
    const em = document.createElement('span');
    em.className = 'em';
    em.textContent = c.emoji;
    const t = document.createElement('span');
    t.className = 'tx';
    t.dataset.zh = c.zh;
    t.dataset.en = c.en;
    t.textContent = tr(c.zh, c.en);
    b.append(em, t);
    b.addEventListener('click', () => {
      const now = performance.now();
      if (now - cheerAt < CHEER_GAP_MS || !say({ do: 'cheer', e: c.id })) {
        b.classList.remove('nope');
        void b.offsetWidth;
        b.classList.add('nope');
        return;
      }
      cheerAt = now;
      b.classList.add('sent');
      setTimeout(() => b.classList.remove('sent'), 300);
    });
    return b;
  }),
);

// ---------- 上面那一行 ----------
function renderStatus(): void {
  $('roomLine').textContent = code ? tr(`房间 ${code} · ${myName}`, `Room ${code} · ${myName}`) : '';
  $('conn').hidden = socketOpen;
  const s = state;
  let text: string;
  if (!socketOpen && !room) text = tr('连接中…', 'Connecting…');
  else if (room && !room.hostConnected) text = tr('主机掉线了，等它回来', 'The host dropped out. Waiting for it to come back');
  else if (!s) text = tr('连上了，等主机回话…', 'Connected. Waiting for the host…');
  else {
    const lv = pickLang(s.level);
    const fx = s.fx ? `${FX[s.fx].emoji} ${tr(`${FX[s.fx].zh}中`, `${FX[s.fx].en} on`)} · ` : '';
    text =
      s.phase === 'lobby'
        ? tr(`在大厅里等开局 · ${lv}`, `In the lobby · ${lv}`)
        : s.phase === 'countdown'
          ? tr(`要开始了 · ${lv}`, `Starting · ${lv}`)
          : s.phase === 'playing'
            ? fx + tr(`正在玩 · ${lv}`, `Playing · ${lv}`)
            : tr(`这局完了 · ${lv}`, `Round over · ${lv}`);
  }
  $('status').textContent = text;
}

function render(): void {
  renderStatus();
  renderBets();
  renderVote();
}
onLang(() => {
  for (const t of document.querySelectorAll<HTMLElement>('.ch .tx')) t.textContent = tr(t.dataset.zh ?? '', t.dataset.en ?? '');
  render();
});

// 页面被系统重新打开、刷新：二十分钟内刚在看这个房间，就自己接着看；联机桌带 ?code=&auto=1 进来直接看
function recent(): string | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(REJOIN_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (j && typeof j.code === 'string' && CODE_RE.test(j.code) && typeof j.at === 'number' && Date.now() - j.at < REJOIN_MS) return j.code;
  } catch {
    // 坏了就当没有
  }
  return null;
}
const again = recent();
const auto = params.get('auto') === '1' && CODE_RE.test(codeIn.value) ? codeIn.value : null;
if (again || auto) watch((auto ?? again) as string, nameIn.value.trim() || tr('观众', 'Fan'));

// 调试口：联机检查脚本用
(window as unknown as { hangOnWatch: unknown }).hangOnWatch = {
  get state() {
    return state;
  },
  get room() {
    return room;
  },
  id: me,
};
