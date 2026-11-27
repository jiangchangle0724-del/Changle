import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// 页面是从哪个提交做出来的，闪退记录里用（src/report.ts）：Cloudflare 的构建会说，本机问 git，都没有就是 dev
const commit = (): string => {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const BUILD = (process.env.WORKERS_CI_COMMIT_SHA || commit() || 'dev').slice(0, 7);

// 六个页面：/（主机）、/pad/（手柄）、/watch/（观众，11-26）、/editor/（关卡编辑器，11-26）、/play.html（物理开发页）、/music.html（背景音乐试听）。
// build 出到 dist/hang-on，Worker 的静态资源根是 dist，所以线上就是 changle.ca/hang-on/、/hang-on/pad/、/hang-on/watch/、/hang-on/editor/。
export default defineConfig({
  base: '/hang-on/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: {
    outDir: 'dist/hang-on',
    rollupOptions: { input: { host: 'index.html', pad: 'pad/index.html', watch: 'watch/index.html', editor: 'editor/index.html', play: 'play.html', music: 'music.html' } },
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  server: {
    // 本地开发：vite 出页面，wrangler dev 出房间（npm run dev 两个一起起）
    proxy: { '/hang-on/api': { target: 'http://127.0.0.1:8787', ws: true }, '/hang-on/r': 'http://127.0.0.1:8787' },
  },
});
