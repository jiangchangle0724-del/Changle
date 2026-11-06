/**
 * 中文 / English：玩家看到的字两种都有（AGENTS.md）。
 * 先看网址的 ?lang=，再看自己记的，再跟主站（changle.ca 的设置），最后看手机的语言。
 * 页面里写死的字用 data-en 标英文（中文就是元素原来的字），切语言时 applyStatic() 换一遍；
 * 代码里的字用 tr('中文', 'English')。手柄页也用，不能 import 别的大东西。
 */
export type Lang = 'zh' | 'en';

const KEY = 'hang-on:lang';
/** 主站存设置的地方（site/src/store.tsx），同一个域名下读得到。 */
const SITE_KEY = 'lazysusan.settings.v1';

function pick(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;
    const saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'en') return saved;
    const site = JSON.parse(localStorage.getItem(SITE_KEY) ?? 'null') as { lang?: unknown } | null;
    if (site && (site.lang === 'zh' || site.lang === 'en')) return site.lang;
  } catch {
    // 没有存储就看手机的语言
  }
  const first = (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language)) || 'zh';
  return /^zh/i.test(first) ? 'zh' : 'en';
}

let lang: Lang = typeof location !== 'undefined' ? pick() : 'zh';
const listeners = new Set<(l: Lang) => void>();

export const getLang = (): Lang => lang;

/** 这句话在当前语言下的样子。 */
export const tr = (zh: string, en: string): string => (lang === 'zh' ? zh : en);

/** { zh, en } 这种（关卡名、换装名）取当前语言。 */
export const pickLang = (s: { zh: string; en: string } | undefined, fallback = ''): string => (s ? (lang === 'zh' ? s.zh : s.en) : fallback);

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // 记不住就记不住
  }
  applyStatic();
  for (const fn of listeners) fn(l);
}

export function onLang(fn: (l: Lang) => void): void {
  listeners.add(fn);
}

/**
 * 页面里写死的字：`data-en` 是英文，中文是元素第一次见到时的字（存进 data-zh）。
 * `data-en-label` / `data-en-ph` / `data-en-title` 分别管 aria-label、placeholder、title。
 */
export function applyStatic(root: ParentNode = document): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of root.querySelectorAll<HTMLElement>('[data-en]')) {
    if (el.dataset.zh === undefined) el.dataset.zh = el.textContent ?? '';
    el.textContent = lang === 'zh' ? el.dataset.zh : (el.dataset.en ?? '');
  }
  const attr = (sel: string, name: string, key: 'enLabel' | 'enPh' | 'enTitle', zhKey: 'zhLabel' | 'zhPh' | 'zhTitle'): void => {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) {
      if (el.dataset[zhKey] === undefined) el.dataset[zhKey] = el.getAttribute(name) ?? '';
      el.setAttribute(name, lang === 'zh' ? (el.dataset[zhKey] ?? '') : (el.dataset[key] ?? ''));
    }
  };
  attr('[data-en-label]', 'aria-label', 'enLabel', 'zhLabel');
  attr('[data-en-ph]', 'placeholder', 'enPh', 'zhPh');
  attr('[data-en-title]', 'title', 'enTitle', 'zhTitle');
}

/** 一个「中 / EN」切换键。 */
export function langButton(btn: HTMLButtonElement): void {
  const render = (): void => {
    btn.textContent = lang === 'zh' ? 'EN' : '中文';
    btn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  };
  render();
  btn.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));
  onLang(render);
}
