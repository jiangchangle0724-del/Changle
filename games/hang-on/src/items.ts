/**
 * 道具（A9）：开局前每人带一样，玩的时候按道具键用，用完过一会儿才能再用。只在闯关和大团队里有。
 * - 速冻：自己在原地冻成冰块几秒，不动、不掉，队友能抓着你、站在你身上。
 * - 拉面：一只手抓着墙或台子时用，从这只手往下垂一根长面条，队友能顺着爬上来，过几秒就断。
 * - 荷叶：撑开荷叶慢慢飘下去，摇杆管往哪边飘。
 * 手柄页选，经房间发给主机（和样子一样走可靠的那条路），主机交给物理（`Sim.setItem`）。
 * 这个文件手柄页、物理、房间协议都要用，什么都不 import（房间服务器那边没有 DOM）；玩家看到的名字和说明在 `item-text.ts`。
 */
export const ITEM_IDS = ['freeze', 'noodle', 'leaf'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** 手柄上、大厅里、头顶上用的小图。 */
export const ITEM_ICON: Record<ItemId, string> = { freeze: '🧊', noodle: '🍜', leaf: '🍃' };

export const DEFAULT_ITEM: ItemId = 'freeze';

export function cleanItem(v: unknown): ItemId {
  return ITEM_IDS.includes(v as ItemId) ? (v as ItemId) : DEFAULT_ITEM;
}

/** 道具在不在这个玩法里（闯关、大团队有；比谁先、坐不住没有）。 */
export const itemsIn = (mode: string | undefined): boolean => mode === undefined || mode === 'climb' || mode === 'team';
