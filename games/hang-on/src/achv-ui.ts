/**
 * 成就（11-25）在页面上的样子：手机上存的单子、冒出来的「🏆 阿一 解锁「救命恩人」」、成就单子的对话框。
 * 主机页（这台设备上玩的人）、手柄页、手机局的画面共用。样子在各自页面的样式表里（`.trophies`、`.trophy`、`.achv-list`）。
 */
import { ACHIEVEMENTS, ACHV_KEY, achvInfo, cleanAchvList, type AchvId } from './achievements';
import { tr } from './i18n';

/** 这部手机（这台设备）上记着的成就。 */
export function loadAchvs(): AchvId[] {
  try {
    return cleanAchvList(JSON.parse(localStorage.getItem(ACHV_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** 记下来（记不住就算了）。 */
export function saveAchvs(ids: Iterable<AchvId>): void {
  try {
    localStorage.setItem(ACHV_KEY, JSON.stringify(cleanAchvList([...ids])));
  } catch {
    // 浏览器不让存
  }
}

/** 「3/19」。 */
export function achvCount(have: ReadonlySet<AchvId> | readonly AchvId[]): string {
  const n = Array.isArray(have) ? have.length : (have as ReadonlySet<AchvId>).size;
  return `${n}/${ACHIEVEMENTS.length}`;
}

/** 大屏和手机局每部手机上冒的那一条（几个人一起拿到的写在一条里）。 */
export function unlockText(names: string | readonly string[], id: AchvId): string {
  const list = typeof names === 'string' ? [names] : names;
  const a = achvInfo(id);
  const en = list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
  return tr(`${a.icon} ${list.join('、')} 解锁「${a.zh}」`, `${a.icon} ${en} unlocked ${a.en}`);
}

/** 同一下拿到的按成就并成一条一条（到顶时大家一起拿到好几个）：顺序照第一次出现的。 */
export function unlockLines(list: readonly { name: string; id: AchvId }[]): string[] {
  const by = new Map<AchvId, string[]>();
  for (const a of list) {
    const names = by.get(a.id) ?? [];
    if (!names.includes(a.name)) names.push(a.name);
    by.set(a.id, names);
  }
  return [...by].map(([id, names]) => unlockText(names, id));
}

/** 拿到的人自己手机上的提示。 */
export function gotText(id: AchvId): string {
  const a = achvInfo(id);
  return tr(`🏆 解锁「${a.zh}」`, `🏆 Unlocked: ${a.en}`);
}

/** 屏幕上同时最多几条，一条挂几毫秒。 */
const MAX_TOASTS = 3;
const TOAST_MS = 3600;
/** 放不下的排着队，前面的没了再冒（一下子拿到好几个时一个都不丢）。 */
const waiting = new WeakMap<HTMLElement, string[]>();

/** 冒一条，挂一会儿自己没了；已经有 3 条就排队。 */
export function trophyToast(box: HTMLElement, text: string): void {
  const queue = waiting.get(box) ?? [];
  waiting.set(box, queue);
  queue.push(text);
  pump(box);
}

function pump(box: HTMLElement): void {
  const queue = waiting.get(box);
  while (queue?.length && box.children.length < MAX_TOASTS) {
    const el = document.createElement('div');
    el.className = 'trophy';
    el.textContent = queue.shift() ?? '';
    box.append(el);
    setTimeout(() => {
      el.remove();
      pump(box);
    }, TOAST_MS);
  }
}

/** 成就单子：拿到的亮着、带 ✓，没拿到的暗着；每个都写怎么拿。 */
export function renderAchvList(list: HTMLElement, have: ReadonlySet<AchvId>): void {
  list.replaceChildren(
    ...ACHIEVEMENTS.map((a) => {
      const got = have.has(a.id);
      const li = document.createElement('li');
      li.className = `achv${got ? ' got' : ''}`;
      const ic = document.createElement('span');
      ic.className = 'ic';
      ic.setAttribute('aria-hidden', 'true');
      ic.textContent = a.icon;
      const tx = document.createElement('span');
      tx.className = 'tx';
      const nm = document.createElement('b');
      nm.textContent = tr(a.zh, a.en);
      const how = document.createElement('small');
      how.textContent = tr(a.howZh, a.howEn);
      tx.append(nm, how);
      const ok = document.createElement('span');
      ok.className = 'ok';
      ok.textContent = got ? '✓' : '';
      ok.setAttribute('aria-label', got ? tr('拿到了', 'Unlocked') : tr('还没拿到', 'Locked'));
      li.append(ic, tx, ok);
      return li;
    }),
  );
}
