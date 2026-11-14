/**
 * 手机上的操作：左半边按住拖动是浮动摇杆，右边两个大键按住就是抓，抓键上面一个道具键（A9，按一下用）。
 * 手柄页和手机局的房主页共用（房主那部手机也要能玩）。在 root 里找 .stickzone、.stick、.knob、
 * 两个 .grab（右手那个带 .r）和 .itembtn（可以没有），把 pointer 事件接上。
 *
 * 触摸的默认动作（双击放大、长按菜单、拖着拖着滚页面）只在摇杆区和两个抓键上掐：掐在整个 root 上的话，
 * root 里别的按钮（召唤、换样子）在真手机上就点不动了（touchend 被掐，浏览器不发 click）。
 *
 * 压在画面上的那种样子（手机局）在 touch.css：root 带 .touch 就是。
 */
import './touch.css';
export interface Controls {
  /** 摇杆方向，-1..1。 */
  readonly aim: { x: number; y: number };
  /** 两只手按没按着。 */
  readonly grab: { l: boolean; r: boolean };
  /** 道具键按过没有（读了就清掉）。手指一按下就算，不等抬起来。 */
  takeItem(): boolean;
}

const STICK_R = 54;

/** 手指移出去也还算这个键；手指已经抬起来了（或者是脚本点的）就算了。 */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture?.(id);
  } catch {
    // 没有这根手指
  }
}

export function bindControls(root: HTMLElement): Controls {
  const q = <T extends HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`${sel} missing`);
    return el;
  };
  const zone = q('.stickzone');
  const stick = q('.stick');
  const knob = q('.knob');
  const grabL = q('.grab:not(.r)');
  const grabR = q('.grab.r');
  const aim = { x: 0, y: 0 };
  const grab = { l: false, r: false };
  const itemBtn = root.querySelector<HTMLButtonElement>('.itembtn');
  let itemTapped = false;

  for (const el of [zone, grabL, grabR, ...(itemBtn ? [itemBtn] : [])]) {
    for (const type of ['touchstart', 'touchend', 'touchmove'] as const) {
      el.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
  }
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // 摇杆：按下的地方就是中心
  let stickId: number | null = null;
  let center = { x: 0, y: 0 };
  const move = (e: PointerEvent): void => {
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - center.x;
    let dy = e.clientY - r.top - center.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    aim.x = dx / STICK_R;
    aim.y = dy / STICK_R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    capture(zone, e.pointerId);
    const r = zone.getBoundingClientRect();
    center = { x: e.clientX - r.left, y: e.clientY - r.top };
    stick.style.left = `${center.x}px`;
    stick.style.top = `${center.y}px`;
    stick.hidden = false;
    move(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) move(e);
  });
  const endStick = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    aim.x = 0;
    aim.y = 0;
    stick.hidden = true;
    knob.style.transform = '';
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  // 抓键：按住就是抓
  const hold = (el: HTMLElement, key: 'l' | 'r'): void => {
    const on = (e: PointerEvent): void => {
      e.preventDefault();
      grab[key] = true;
      el.classList.add('down');
      capture(el, e.pointerId);
    };
    const off = (e: PointerEvent): void => {
      e.preventDefault();
      grab[key] = false;
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  hold(grabL, 'l');
  hold(grabR, 'r');

  // 道具键：手指按下去就用（掐了 touchend 浏览器不发 click，所以不靠 click；键盘、读屏点的 click 也算）
  if (itemBtn) {
    itemBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!itemBtn.disabled) itemTapped = true;
    });
    itemBtn.addEventListener('click', (e) => {
      if (e.detail === 0 && !itemBtn.disabled) itemTapped = true;
    });
  }

  return {
    aim,
    grab,
    takeItem() {
      const t = itemTapped;
      itemTapped = false;
      return t;
    },
  };
}
