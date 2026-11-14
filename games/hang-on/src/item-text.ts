/**
 * 道具（A9）的名字和一句话说明，中英两套（玩家看到的字）。手柄页、主机页用；物理和房间协议只用 `items.ts`。
 */
import { tr } from './i18n';
import type { ItemId } from './items';

export function itemName(id: ItemId): string {
  if (id === 'noodle') return tr('拉面', 'Noodle');
  if (id === 'leaf') return tr('荷叶', 'Lotus leaf');
  return tr('速冻', 'Deep freeze');
}

/** 一句话说清楚怎么用。 */
export function itemHint(id: ItemId): string {
  if (id === 'noodle')
    return tr('抓着墙或台子时用：垂下一根长面条，队友顺着爬上来，10 秒后断', 'Use while holding a wall or ledge: a long noodle drops down for friends to climb. It snaps after 10 s');
  if (id === 'leaf') return tr('撑开荷叶慢慢飘下去，摇杆管往哪边飘，撑 5 秒', 'Open a lotus leaf and float down slowly. Steer with the stick. Lasts 5 s');
  return tr('原地冻成冰块 4 秒：不动不掉，队友能抓着你、站在你身上', 'Freeze in place for 4 s. You stay put, and friends can grab you or stand on you');
}
