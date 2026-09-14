#!/usr/bin/env node
/**
 * 把 Capacitor 模板里**丢了就会出问题**的那几处原生配置补回去。
 *
 * 为什么需要这一步：
 *   android/ 与 ios/ 都在 .gitignore 里，属于生成产物，每次 `cap add`
 *   都从头铺 Capacitor 模板。模板给的是 Capacitor 自己的默认值，
 *   而我们需要的几处定制每次都会被冲掉。目前有两处：
 *
 *   1. **App 图标**——模板铺的是 Capacitor 的 logo。不覆盖的话构建日志
 *      一切正常，只有装到手机上才会发现图标不对。
 *      （图标源：`npx tauri icon` 生成的 src-tauri/icons/，已提交进仓库）
 *
 *   2. **精确闹钟权限**——@capacitor/local-notifications 的清单里
 *      没有 SCHEDULE_EXACT_ALARM。缺了它，Android 12+ 上
 *      `canScheduleExactAlarms()` 返回 false，插件会打一条 warning 后
 *      退回 `setAndAllowWhileIdle`：**通知照样响，但时间不精确**，
 *      Doze 模式下可能晚几分钟。倒计时的全部意义就是「到点响」，
 *      所以这个权限要显式声明。
 *
 * 每次 `cap add` 之后都要跑，npm scripts（cap:add:*）与 CI 都已接上。
 * 幂等：目标不存在就跳过，已经补过的不重复写。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

const ANDROID_RES = join(root, 'android', 'app', 'src', 'main', 'res');
const ANDROID_MANIFEST = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

/** 需要补进 app manifest 的权限。键是权限名，值是「为什么要它」。 */
const ANDROID_PERMISSIONS = {
  'android.permission.SCHEDULE_EXACT_ALARM':
    '倒计时通知需要精确闹钟；缺了它 Android 12+ 会退回非精确闹钟，到点不准',
};

function syncAndroidIcons() {
  const src = join(root, 'src-tauri', 'icons', 'android');
  if (!existsSync(src)) return console.log('· 跳过 Android 图标：没有 src-tauri/icons/android');
  if (!existsSync(ANDROID_RES)) return console.log('· 跳过 Android 图标：没有 android/（先跑 cap add android）');

  let copied = 0;
  for (const mipmap of readdirSync(src)) {
    if (!mipmap.startsWith('mipmap-')) continue;
    const srcDir = join(src, mipmap);
    const dstDir = join(ANDROID_RES, mipmap);
    if (!statSync(srcDir).isDirectory() || !existsSync(dstDir)) continue;

    for (const name of ANDROID_ICON_NAMES) {
      const from = join(srcDir, name);
      if (!existsSync(from)) continue;
      copyFileSync(from, join(dstDir, name));
      copied++;
    }
  }
  console.log(`✓ Android 图标：覆盖 ${copied} 个 mipmap`);
}

function syncAndroidManifest() {
  if (!existsSync(ANDROID_MANIFEST)) return console.log('· 跳过 Android manifest：没有 android/（先跑 cap add android）');

  let xml = readFileSync(ANDROID_MANIFEST, 'utf8');
  const added = [];
  const emptyTag = /<uses-permission\b[^>]*\/>/g;

  for (const [permission, why] of Object.entries(ANDROID_PERMISSIONS)) {
    // 用正则而不是 XML 解析：这个文件是模板产物、结构固定，
    // 引第三方 XML 库只为改一行不值当。**判断的是「有没有这个权限名」**，
    // 不是「有没有这行字」，所以重复运行不会重复插。
    if (xml.includes(`"${permission}"`)) continue;

    const line = `    <uses-permission android:name="${permission}" />`;
    // 插在最后一个 <uses-permission/> 之后，保持权限块聚集在一起
    const matches = [...xml.matchAll(emptyTag)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const at = last.index + last[0].length;
      xml = `${xml.slice(0, at)}\n${line}${xml.slice(at)}`;
    } else {
      // 模板变了、一个 uses-permission 都没有时的兜底：插在 </manifest> 前
      xml = xml.replace('</manifest>', `${line}\n</manifest>`);
    }
    added.push({ permission, why });
  }

  if (added.length === 0) return console.log('✓ Android manifest：权限已齐，无需改动');

  writeFileSync(ANDROID_MANIFEST, xml);
  for (const { permission, why } of added) {
    console.log(`✓ Android manifest：补上 ${permission.split('.').pop()} —— ${why}`);
  }
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

syncAndroidIcons();
syncAndroidManifest();
syncIos();
