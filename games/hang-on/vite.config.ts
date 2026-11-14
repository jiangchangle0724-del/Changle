import { defineConfig } from 'vite';

// 四个页面：/（主机）、/pad/（手柄）、/play.html（物理开发页）、/music.html（背景音乐试听）。build 出到 dist/hang-on，Worker 的静态
// 资源根是 dist，所以线上就是 changle.ca/hang-on/、/hang-on/pad/。
export default defineConfig({
  base: '/hang-on/',
  build: {
    outDir: 'dist/hang-on',
    rollupOptions: { input: { host: 'index.html', pad: 'pad/index.html', play: 'play.html', music: 'music.html' } },
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  server: {
    // 本地开发：vite 出页面，wrangler dev 出房间（npm run dev 两个一起起）
    proxy: { '/hang-on/api': { target: 'http://127.0.0.1:8787', ws: true }, '/hang-on/r': 'http://127.0.0.1:8787' },
  },
});
