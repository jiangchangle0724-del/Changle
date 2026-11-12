/**
 * 远景画的地址（Vite 才认 import.meta.glob，所以单独放这里）：`games/hang-on/art/<世界>-far.webp`。
 * 主机页和开发页把它交给 Stage.create；关卡审查页（esbuild 打包）自己给地址。
 */
import type { WorldId } from './art';

const files = import.meta.glob('../../art/*-far.{webp,jpg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const PLATES: Partial<Record<WorldId, string>> = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/(table|van)-far\.\w+$/.exec(path);
  if (m) PLATES[m[1] as WorldId] = url;
}
