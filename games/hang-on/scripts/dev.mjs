#!/usr/bin/env node
// 本地跑整套：先 vite build 出三个页面，再 wrangler dev 起房间服务并把页面一起端出来。
// 开在 0.0.0.0，手机连同一个 Wi-Fi 就能扫电脑上的二维码进来。
//   npm run dev   →   http://<这台电脑的 IP>:8787/hang-on/
import { spawnSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const build = spawnSync(npx, ['vite', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) process.exit(build.status ?? 1);

const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
console.log('\n主机页：' + (ips.length ? ips.map((ip) => `http://${ip}:8787/hang-on/`).join('  或  ') : 'http://127.0.0.1:8787/hang-on/'));
console.log('手机扫主机页上的二维码，或打开 http://<上面的 IP>:8787/hang-on/pad/\n');

const dev = spawn(npx, ['wrangler', 'dev', '--port', '8787', '--ip', '0.0.0.0'], { stdio: 'inherit', shell: process.platform === 'win32' });
dev.on('exit', (code) => process.exit(code ?? 0));
