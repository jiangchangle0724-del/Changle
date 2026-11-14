/**
 * The tools that open on a page of their own inside the site, at /tools/<id>: their addresses and
 * names, all the router needs (the tools themselves load with the Tools tab or their page).
 * 约时间 (/when) and 随便 (/eat) are other Workers, with their own cards on the tab.
 */
export const TOOLS = {
  currency: { zh: "汇率", en: "Currency" },
  clock: { zh: "世界时间", en: "World clock" },
  price: { zh: "单价换算", en: "Unit price" },
} as const;

export type ToolId = keyof typeof TOOLS;

export const isToolId = (s: string): s is ToolId => Object.prototype.hasOwnProperty.call(TOOLS, s);
