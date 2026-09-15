#!/usr/bin/env node
/**
 * 把 Capacitor 模板里**丢了就会出问题**的那几处原生配置补回去。
 *
 * 为什么需要这一步：
 *   android/ 与 ios/ 都在 .gitignore 里，属于生成产物，每次 `cap add`
 *   都从头铺 Capacitor 模板。模板给的是 Capacitor 自己的默认值，
 *   而我们需要的几处定制每次都会被冲掉。**这些错误有个共同点：构建日志
 *   全绿，只有装到真机上才看得见。** 目前有六处：
 *
 *   1. **App 图标**——模板铺的是 Capacitor 的 logo。不覆盖的话构建日志
 *      一切正常，只有装到手机上才会发现图标不对。
 *      （图标源：`npx tauri icon` 生成的 src-tauri/icons/，已提交进仓库）
 *
 *   2. **启动图**——同样印着 Capacitor 的 logo，启动时先闪一下它才进界面。
 *      图源见 scripts/gen-splash.mjs（那一步需要 sharp，产物已提交，
 *      所以这里只做拷贝、CI 不必装 sharp）。
 *
 *   3. **通知栏小图标**——capacitor.config.ts 里 LocalNotifications.smallIcon
 *      点名了 ic_stat_timecalc，而模板里没有这个资源。找不到时插件会退回
 *      应用图标，偏偏通知小图标是拿 alpha 通道当遮罩渲染的：全彩图标进去，
 *      状态栏里出来一个纯白方块。
 *
 *   4. **精确闹钟权限**——@capacitor/local-notifications 的清单里
 *      没有 SCHEDULE_EXACT_ALARM。缺了它，Android 12+ 上
 *      `canScheduleExactAlarms()` 返回 false，插件会打一条 warning 后
 *      退回 `setAndAllowWhileIdle`：**通知照样响，但时间不精确**，
 *      Doze 模式下可能晚几分钟。倒计时的全部意义就是「到点响」，
 *      所以这个权限要显式声明。
 *
 *   5. **版本号**——模板写死 versionCode 1 / versionName "1.0"，
 *      跟 package.json 的版本对不上。
 *
 *   6. **非 ASCII 路径**——AGP 默认拒绝在含中文的路径下构建，
 *      而本机就是 D:\系统\TimeCalc。这一条是真的会构建失败，
 *      与上面几条"静默出错"不同。
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

/**
 * mipmap-* 各目录之外的图标相关文件，同样要覆盖。相对 `src-tauri/icons/android/` 与
 * `android/app/src/main/res/` 的同一路径。
 *
 *   mipmap-anydpi-v26/ic_launcher.xml —— 自适应图标的定义，声明前景用
 *     `@mipmap/ic_launcher_foreground`、背景用 `@color/ic_launcher_background`
 *   values/ic_launcher_background.xml —— 上面那个背景色
 *
 * 就当前这两个文件而言，Tauri 生成的与 Capacitor 模板里的**语义完全一致**
 * （背景都是白色，自适应 XML 只是元素顺序不同），所以拷不拷看不出区别。
 * 留着是为了脚本本身完整：将来换图标时若 Tauri 给出不同的背景色，
 * 这里不覆盖就会静默沿用模板的值。
 *
 * 注意 Capacitor 还带一个 `mipmap-anydpi-v26/ic_launcher_round.xml`，
 * Tauri 不生成对应文件，因此不在覆盖范围内。它引用的仍是上面这两个资源，
 * 所以前景与背景照样跟着换。
 *
 * 最后一个不同源：`drawable/ic_stat_timecalc.xml` 不是 Tauri 生成的，
 * 是手写的矢量图（见该文件自身的注释），放在 src-tauri/icons/android/ 下
 * 只是为了跟其他移动端资源待在一起。
 */
const ANDROID_EXTRA_FILES = [
  'mipmap-anydpi-v26/ic_launcher.xml',
  'values/ic_launcher_background.xml',
  'drawable/ic_stat_timecalc.xml',
];

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

  for (const rel of ANDROID_EXTRA_FILES) {
    const from = join(src, rel);
    const to = join(ANDROID_RES, rel);
    // 目标目录不存在说明模板结构变了，别硬造目录——静默跳过比造出个
    // 谁都不会读的路径要好。真出问题会在真机上以「图标没换」的形式暴露。
    if (!existsSync(from) || !existsSync(dirname(to))) continue;
    copyFileSync(from, to);
    copied++;
  }

  console.log(`✓ Android 图标：覆盖 ${copied} 个文件（mipmap + 自适应定义）`);
}

/**
 * AGP 默认拒绝在含非 ASCII 字符的路径下构建（本项目是 `D:\系统\TimeCalc`）。
 * 这道检查针对的是 Windows 上一些老工具对中文路径的兼容问题。
 *
 * **仅在本机路径确实含非 ASCII 时才放行**：实测 aapt2 / d8 / 资源合并
 * 都能正常处理中文路径（本机完整编译通过），但 CI 跑在 Linux 上、
 * 路径全是 ASCII，那边没有必要也不该把这个安全检查关掉。
 */
function syncAndroidGradleProperties() {
  const path = join(root, 'android', 'gradle.properties');
  if (!existsSync(path)) return console.log('· 跳过 gradle.properties：没有 android/（先跑 cap add android）');

  // 路径里有没有非 ASCII 字符
  if (!/[^\x00-\x7F]/.test(root)) {
    return console.log('✓ gradle.properties：项目路径全 ASCII，保留 AGP 的路径检查');
  }

  const text = readFileSync(path, 'utf8');
  if (text.includes('android.overridePathCheck')) {
    return console.log('✓ gradle.properties：已放行非 ASCII 路径');
  }

  writeFileSync(
    path,
    `${text.replace(/\n*$/, '\n')}\n` +
      '# 项目路径含非 ASCII 字符（中文目录名），AGP 默认会拒绝构建。\n' +
      '# 实测本项目的 aapt2 / d8 / 资源合并都能正常处理，故放行。\n' +
      '# 由 scripts/sync-native.mjs 自动补上——android/ 是生成目录。\n' +
      'android.overridePathCheck=true\n',
  );
  console.log('✓ gradle.properties：放行非 ASCII 路径（android.overridePathCheck=true）');
}

/**
 * 把 package.json 的版本号写进 Android 的 build.gradle。
 *
 * Capacitor 模板铺的是 `versionCode 1` / `versionName "1.0"`，跟发布版本毫无关系。
 * 装到手机上，「设置 → 应用」里显示的就是这个值——Release 页面写着 0.2.0、
 * 手机上却显示 1.0，对不上。
 *
 * versionCode 必须是**单调递增的整数**（Android 靠它判断能否覆盖安装），
 * 而 semver 带点号，所以做固定映射：major*10000 + minor*100 + patch，
 * 0.2.0 → 200。预发布标识（如 1.0.0-beta.1）在这里忽略——本项目不打预发布。
 */
function syncAndroidVersion() {
  const gradlePath = join(root, 'android', 'app', 'build.gradle');
  if (!existsSync(gradlePath)) return console.log('· 跳过版本号：没有 android/（先跑 cap add android）');

  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const parsed = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!parsed) {
    return console.log(`· 跳过版本号：package.json 的 version（${version}）不是 semver`);
  }

  const [, major, minor, patch] = parsed;
  const versionCode = Number(major) * 10000 + Number(minor) * 100 + Number(patch);

  const text = readFileSync(gradlePath, 'utf8');
  const next = text
    .replace(/(\bversionCode\s+)\d+/, `$1${versionCode}`)
    .replace(/(\bversionName\s+)"[^"]*"/, `$1"${version}"`);

  if (next === text) {
    return console.log(`✓ Android 版本号：已是 ${version}（versionCode ${versionCode}）`);
  }

  writeFileSync(gradlePath, next);
  console.log(`✓ Android 版本号：versionName=${version} versionCode=${versionCode}`);
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

/** `res/` 下所有含 splash.png 的目录名（模板可能带 drawable/ 与 drawable-<限定符>/ 若干）。 */
function splashDirs(res) {
  return readdirSync(res).filter((d) => existsSync(join(res, d, 'splash.png')));
}

/**
 * 把 TimeCalc 的启动图铺进 res/ 的各个 drawable 目录。
 *
 * 逐目录按**模板现有的目录名**匹配，而不是照搬 gen-splash.mjs 的清单：
 * 两边一旦不一致，下面的安全网会报出来。硬造目录没有意义——
 * 造出来的路径如果没人引用，就只是多几个死文件。
 */
function syncAndroidSplash() {
  const src = join(root, 'src-tauri', 'icons', 'splash', 'android');
  if (!existsSync(src)) return console.log('· 跳过 Android 启动图：没有 src-tauri/icons/splash/android');
  if (!existsSync(ANDROID_RES)) return console.log('· 跳过 Android 启动图：没有 android/（先跑 cap add android）');

  const covered = new Set();
  for (const dir of readdirSync(src)) {
    const to = join(ANDROID_RES, dir, 'splash.png');
    if (!existsSync(join(src, dir, 'splash.png')) || !existsSync(to)) continue;
    copyFileSync(join(src, dir, 'splash.png'), to);
    covered.add(dir);
  }

  console.log(`✓ Android 启动图：覆盖 ${covered.size} 张`);
  // 安全网：模板里有、我们没生成的启动图 → Capacitor 换了资源布局，
  // 此时那几张仍是 Capacitor 的 logo，必须让人看见而不是默默放过。
  const missed = splashDirs(ANDROID_RES).filter((d) => !covered.has(d));
  if (missed.length > 0) {
    console.log(`! Android 启动图：模板里还有未覆盖的 —— ${missed.join('、')}`);
    console.log('  Capacitor 大概改了资源布局，请同步 scripts/gen-splash.mjs 的 ANDROID_SPLASHES');
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

/**
 * iOS 的启动图放在 Splash.imageset/ 下，由同目录的 Contents.json 按
 * 1x/2x/3x 引用三个文件（模板里这三份逐字节相同）。这里按**现有文件名**
 * 逐个覆盖、不写死名字——名字对不上就说明模板改了，安全网会报出来。
 */
function syncIosSplash() {
  const src = join(root, 'src-tauri', 'icons', 'splash', 'ios');
  const dstDir = join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
  if (!existsSync(src)) return console.log('· 跳过 iOS 启动图：没有 src-tauri/icons/splash/ios');
  if (!existsSync(dstDir)) return console.log('· 跳过 iOS 启动图：没有 ios/（先跑 cap add ios）');

  const present = readdirSync(dstDir).filter((n) => n.endsWith('.png'));
  let copied = 0;
  for (const name of present) {
    const from = join(src, name);
    if (!existsSync(from)) continue;
    copyFileSync(from, join(dstDir, name));
    copied++;
  }

  console.log(`✓ iOS 启动图：覆盖 ${copied} 张`);
  const missed = present.filter((n) => !existsSync(join(src, n)));
  if (missed.length > 0) {
    console.log(`! iOS 启动图：imageset 里还有未覆盖的 —— ${missed.join('、')}`);
    console.log('  Capacitor 大概改了资源布局，请同步 scripts/gen-splash.mjs 的 IOS_SPLASHES');
  }
}

syncAndroidIcons();
syncAndroidSplash();
syncAndroidManifest();
syncAndroidVersion();
syncAndroidGradleProperties();
syncIos();
syncIosSplash();
