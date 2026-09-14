#!/usr/bin/env node
/**
 * 从 public/icons/icon.svg 生成 PWA / Tauri / Capacitor 所需的全部光栅图标。
 *
 * 依赖：@vite-pwa/assets-generator（已列入 devDependencies）
 *   npm run icons
 *
 * 生成的产物（public/icons/，由 minimal-2023 预设决定，名字不能想当然）：
 *   pwa-64x64.png / pwa-192x192.png / pwa-512x512.png   —— manifest 常规图标
 *   maskable-icon-512x512.png                           —— manifest maskable 图标
 *   apple-touch-icon-180x180.png                        —— iOS 主屏图标
 *   favicon.ico                                         —— 浏览器标签页
 *
 * 这些文件名同时被 vite.config.ts 的 manifest.icons 与 index.html 的
 * <link rel="icon"> 引用——换预设时必须同步改那两处，否则只会静默 404。
 *
 * Tauri 图标另行生成（需要 32x32 / 128x128 / 128x128@2x / icon.ico / icon.icns
 * 以及 iOS / Android 全套）：
 *   npx tauri icon public/icons/icon.svg
 * 该命令会直接写入 src-tauri/icons/。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const source = join(iconsDir, 'icon.svg');

if (!existsSync(source)) {
  console.error(`✗ 找不到源文件：${source}`);
  process.exit(1);
}
mkdirSync(iconsDir, { recursive: true });

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`✗ 命令失败（退出码 ${r.status}）`);
    process.exit(r.status ?? 1);
  }
}

run('npx', ['--yes', 'pwa-assets-generator', '--preset', 'minimal-2023', source]);

console.log('\n✓ PWA 图标已生成到 public/icons/');
console.log('  如需 Tauri 图标，请额外执行： npx tauri icon public/icons/icon.svg');
