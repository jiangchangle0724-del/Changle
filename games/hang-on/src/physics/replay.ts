/**
 * 回放：按录好的每帧输入无头跑一关，报告用时、摔死次数、有没有全员到终点。
 * 关卡 JSON 的 `replay` 字段指向这种文件；C1 的 `npm run levels` 和 C4 的回归都用它。
 */
import type { Level } from './level';
import { createSim, type PadInput, type Sim } from './world';

export interface Replay {
  /** 关卡 id，对不上就拒跑。 */
  level: string;
  /** 每帧多少秒（录制页用 1/60）。 */
  dt: number;
  players: number;
  /** frames[f][i] = 第 f 帧第 i 个玩家的输入。 */
  frames: PadInput[][];
}

export interface ReplayResult {
  won: boolean;
  /** 过关用时（没过关就是回放总长）。 */
  seconds: number;
  deaths: number[];
  /** 每个玩家最后的位置，排查没过关时用。 */
  final: { x: number; y: number }[];
}

export async function runReplay(level: Level, replay: Replay, sim?: Sim): Promise<ReplayResult> {
  if (replay.level !== level.id) throw new Error(`回放是 ${replay.level} 的，关卡是 ${level.id}`);
  const s = sim ?? (await createSim(level, replay.players));
  for (const frame of replay.frames) {
    frame.forEach((input, i) => s.setInput(i, input));
    s.step(replay.dt);
    if (s.won) break;
  }
  const result: ReplayResult = {
    won: s.won,
    seconds: s.time,
    deaths: s.players.map((p) => p.deaths),
    final: s.players.map((p) => ({ x: p.body.x, y: p.body.y })),
  };
  if (!sim) s.destroy();
  return result;
}
