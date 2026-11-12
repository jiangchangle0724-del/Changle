// 到此一游 rules engine: one copy of the rules shared by the simulator, the server and the browser.
export * from "./data";
export * from "./board";
export * from "./config";
export * from "./state";
export * from "./rules";
export * from "./news";
export * from "./world";
export { newGame, act, manage, whoMustAct, rollDie, settleLiveAuction, endAfterThisRound, bonus, fine, worldEvent } from "./play";
export type { Action, ManageKind } from "./play";
export { STYLES, newBrain, decide, auctionLimit, fallbackAction, runBots, botAcceptsTrade } from "./bots";
export type { Brain, Style, StyleId, TradeHooks } from "./bots";
