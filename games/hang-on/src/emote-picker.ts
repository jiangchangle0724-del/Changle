/**
 * 表情的一排键（11-25）：手柄页和手机局的房主手机共用。开关它的那个键（😀）在各自的页面里，这里只管那一排：
 * 挂在键的下面、屏幕横着放得下（两行四个），点一句就发、就收起来；点别处也收起来。
 * 同一部手机两句至少隔 EMOTE_GAP_MS，太快的那一下键抖一抖不发（主机那边还会再挡一次）。
 * 每个键带 data-zh / data-en，换语言时 applyStatic 一起换。样子在两个页面的样式表里（`.emotes`、`.emote`）。
 */
import { EMOTES, EMOTE_GAP_MS, type EmoteId } from './emotes';
import { tr } from './i18n';

export interface EmotePicker {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

export function emotePicker(trigger: HTMLButtonElement, send: (e: EmoteId) => void, now: () => number = () => performance.now()): EmotePicker {
  // 那一排第一次打开时才做出来：没人点 😀 的页面（电视局的大屏）一个键也不多
  let box: HTMLDivElement | null = null;
  let last = -Infinity;
  const build = (): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'emotes';
    el.hidden = true;
    el.setAttribute('role', 'menu');
    for (const e of EMOTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote';
      b.dataset.emote = e.id;
      b.dataset.zh = e.zh;
      b.dataset.en = e.en;
      b.textContent = tr(e.zh, e.en);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (now() - last < EMOTE_GAP_MS) {
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
          return;
        }
        last = now();
        send(e.id);
        picker.close();
      });
      el.append(b);
    }
    document.body.append(el);
    return el;
  };
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');

  const place = (): void => {
    if (!box) return;
    const r = trigger.getBoundingClientRect();
    box.style.top = `${Math.round(r.bottom + 6)}px`;
  };
  const outside = (ev: PointerEvent): void => {
    const t = ev.target as Node | null;
    if (t && (box?.contains(t) || trigger.contains(t))) return;
    picker.close();
  };
  const picker: EmotePicker = {
    get isOpen() {
      return !!box && !box.hidden;
    },
    open() {
      box ??= build();
      if (!box.hidden) return;
      place();
      box.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', place);
    },
    close() {
      if (!box || box.hidden) return;
      box.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', place);
    },
    toggle() {
      if (picker.isOpen) picker.close();
      else picker.open();
    },
  };
  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    picker.toggle();
  });
  return picker;
}
