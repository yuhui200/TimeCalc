#!/usr/bin/env node
/**
 * 生成移动端启动图（splash）与 Android 通知栏小图标。
 *
 * **为什么需要这个脚本**：Capacitor 模板铺的启动图上印的是 Capacitor 自己的
 * logo。app 图标我们早就换成 TimeCalc 的了（见 scripts/sync-native.mjs），
 * 但启动图是**另一批文件**，一直没覆盖——装到手机上，启动的一瞬间会先闪一下
 * Capacitor 的蓝叉，然后才进到我们的界面。同一批"静默出错"里最显眼的一个。
 *
 * 产物落在 `src-tauri/icons/splash/` 与 `src-tauri/icons/android/drawable/`，
 * 随仓库提交；之后由 scripts/sync-native.mjs 在每次 `cap add` 后拷进
 * android/ 与 ios/。跟 app 图标同一套路——**生成一次、提交、同步只做拷贝**，
 * 于是 CI 侧不需要 sharp 也能同步。
 *
 * 尺寸完全沿用 Capacitor 模板原本的画布与 logo 边长，**只换内容不换比例**，
 * 所以启动页的视觉分量跟以前一模一样，见下面的两张表。
 *
 * 依赖 sharp；它由 @vite-pwa/assets-generator 带进来（deduped 0.32.6），
 * 没有单独列进 devDependencies。缺了会明确报错，不会静默跳过。
 *
 *   npm run icons        （已包含本脚本）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'icons', 'icon.svg');
const outAndroid = join(root, 'src-tauri', 'icons', 'splash', 'android');
const outIos = join(root, 'src-tauri', 'icons', 'splash', 'ios');

/**
 * Capacitor 模板的 11 张 Android 启动图。
 * 每项为 [相对 res/ 的路径, 画布宽, 画布高, 中心 logo 边长(px)]。
 *
 * 后三个数字是从 @capacitor/android 模板里逐张量出来的，**不是**推导出来的
 * 公式——Capacitor 直接打包了这几张静态图，各密度的 logo 大小并不成固定比例
 * （mdpi 64、hdpi/xhdpi 96、xxhdpi/xxxhdpi 128）。原样保留是为了换图之后
 * 启动页观感不变。Capacitor 若在后续版本改了这批资源，sync-native.mjs 会
 * 报出"有启动图没被覆盖"，不会悄悄漏掉。
 */
const ANDROID_SPLASHES = [
  ['drawable/splash.png', 480, 320, 64],
  ['drawable-land-mdpi/splash.png', 480, 320, 64],
  ['drawable-land-hdpi/splash.png', 800, 480, 96],
  ['drawable-land-xhdpi/splash.png', 1280, 720, 96],
  ['drawable-land-xxhdpi/splash.png', 1600, 960, 128],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280, 128],
  ['drawable-port-mdpi/splash.png', 320, 480, 64],
  ['drawable-port-hdpi/splash.png', 480, 800, 96],
  ['drawable-port-xhdpi/splash.png', 720, 1280, 96],
  ['drawable-port-xxhdpi/splash.png', 960, 1600, 128],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920, 128],
];

/**
 * iOS 的 Splash.imageset 三个文件是同一张图的 1x/2x/3x——模板里它们逐字节
 * 相同（都是 2732×2732）。所以这里也生成三份相同内容，保持原样。
 */
const IOS_SPLASHES = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
const IOS_CANVAS = 2732;
const IOS_LOGO = 160;

/**
 * 启动图底色。**必须**与 capacitor.config.ts 里 SplashScreen.backgroundColor
 * 一致，否则启动图交接到 WebView 的瞬间会闪一下另一种颜色。直接从配置里读，
 * 省得两处各写一份漂移。
 */
function splashBackground() {
  const fallback = '#ffffff';
  const configPath = join(root, 'capacitor.config.ts');
  if (!existsSync(configPath)) return fallback;
  const m = /SplashScreen:\s*\{[^}]*?backgroundColor:\s*'([^']+)'/s.exec(readFileSync(configPath, 'utf8'));
  return m ? m[1] : fallback;
}

if (!existsSync(source)) {
  console.error(`✗ 找不到图标源文件：${source}`);
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('✗ 找不到 sharp。它是 @vite-pwa/assets-generator 的依赖，请先 npm install。');
  process.exit(1);
}

const background = splashBackground();

// 同一个 logo 尺寸会被多张启动图复用，渲染一次就够
const logoCache = new Map();

async function logo(size) {
  if (!logoCache.has(size)) {
    const buf = await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    logoCache.set(size, buf);
  }
  return logoCache.get(size);
}

/** 纯色画布正中放一枚 logo。 */
async function splash(width, height, size) {
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([
      {
        input: await logo(size),
        left: Math.round((width - size) / 2),
        top: Math.round((height - size) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function write(file, buf) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

for (const [rel, w, h, size] of ANDROID_SPLASHES) {
  await write(join(outAndroid, rel), await splash(w, h, size));
}
console.log(`✓ Android 启动图：${ANDROID_SPLASHES.length} 张（底色 ${background}）`);

for (const name of IOS_SPLASHES) {
  await write(join(outIos, name), await splash(IOS_CANVAS, IOS_CANVAS, IOS_LOGO));
}
console.log(`✓ iOS 启动图：${IOS_SPLASHES.length} 张（${IOS_CANVAS}×${IOS_CANVAS}，logo ${IOS_LOGO}px）`);
