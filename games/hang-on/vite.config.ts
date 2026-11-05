import { defineConfig } from 'vite';

// 开发页只有 play.html；build 出来的 dist/ 是一页可直接打开的静态文件（相对路径，放哪都能开）。
export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: 'play.html' },
    target: 'es2022',
  },
});
