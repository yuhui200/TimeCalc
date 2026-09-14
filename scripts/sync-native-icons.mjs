#!/usr/bin/env node
/**
 * 把 src-tauri/icons 里的原生图标同步进 Capacitor 工程。
 *
 * 为什么需要这一步：
 *   `npx tauri icon public/icons/icon.svg` 早就生成了一整套原生图标
 *   （src-tauri/icons/android/ 与 src-tauri/icons/ios/，已提交进仓库），
 *   但 Capacitor 的 `cap add` 只会铺**模板自带的默认 Capacitor logo**。
 *   不同步的话，装出来的 APK / ipa 顶着的是 Capacitor 的图标，
 *   而且这个错误在构建日志里完全看不出来——只有装上手机才会发现。
 *
 * 为什么必须在每次 cap add 之后跑：
 *   android/ 与 ios/ 都在 .gitignore 里，属于**生成产物**，
 *   每次 `cap add` 都是从头铺模板。所以 npm scripts 与 CI 都接了这个脚本。
 *
 * 幂等：目标目录不存在就跳过该平台，不报错。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- Android */
/**
 * Capacitor 与 Tauri 的 mipmap 目录结构一致，但**用途不同**：
 *   ic_launcher.png            —— 传统（Android 8 之前）图标
 *   ic_launcher_round.png      —— 圆形图标
 *   ic_launcher_foreground.png —— 自适应图标的前景层
 * 三者都要拷。只拷 ic_launcher 的话，Android 8+ 走 adaptive-icon 分支，
 * 实际显示的会是没被替换的模板前景层。
 */
const ANDROID_ICON_NAMES = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

function syncAndroid() {
  const src = join(root, 'src-tauri', 'icons', 'android');
  const dst = join(root, 'android', 'app', 'src', 'main', 'res');

  if (!existsSync(src)) return console.log('· 跳过 Android：没有 src-tauri/icons/android');
  if (!existsSync(dst)) return console.log('· 跳过 Android：没有 android/（先跑 cap add android）');

  let copied = 0;
  for (const mipmap of readdirSync(src)) {
    if (!mipmap.startsWith('mipmap-')) continue;
    const srcDir = join(src, mipmap);
    const dstDir = join(dst, mipmap);
    if (!statSync(srcDir).isDirectory() || !existsSync(dstDir)) continue;

    for (const name of ANDROID_ICON_NAMES) {
      const from = join(srcDir, name);
      if (!existsSync(from)) continue;
      copyFileSync(from, join(dstDir, name));
      copied++;
    }
  }
  console.log(`✓ Android：覆盖 ${copied} 个 mipmap 图标`);
}

/* -------------------------------------------------------------------- iOS */
/**
 * Capacitor 的 AppIcon.appiconset/Contents.json 只声明了**一个**条目：
 *   AppIcon-512@2x.png，idiom=universal，platform=ios，1024x1024。
 * Xcode 14+ 的单尺寸图标机制，系统自己缩放出其余尺寸——
 * 所以这里只需要换掉这一个文件，不用去动 Contents.json，
 * 也不用把 Tauri 那套 AppIcon-20x20@1x 之类全搬过来。
 */
function syncIos() {
  const from = join(root, 'src-tauri', 'icons', 'ios', 'AppIcon-512@2x.png');
  const dstDir = join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

  if (!existsSync(from)) return console.log('· 跳过 iOS：没有 src-tauri/icons/ios/AppIcon-512@2x.png');
  if (!existsSync(dstDir)) return console.log('· 跳过 iOS：没有 ios/（先跑 cap add ios）');

  mkdirSync(dstDir, { recursive: true });
  copyFileSync(from, join(dstDir, 'AppIcon-512@2x.png'));
  console.log('✓ iOS：覆盖 AppIcon-512@2x.png（1024x1024）');
}

syncAndroid();
syncIos();
