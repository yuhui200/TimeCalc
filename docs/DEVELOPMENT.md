# TimeCalc 开发文档

面向要改这个仓库的人：架构约定、构建目标怎么切、原生壳的几个坑、测试与验收。

安装与使用说明见 [README](../README.md)｜[English](../README.en.md)

---

## 架构总览

一套 `src/core` + `src/components` + `src/platform`，同时产出四种形态：

| 形态 | 技术 | 产物 |
| --- | --- | --- |
| 浏览器 / PWA | Vite + React + vite-plugin-pwa | 静态站点，可安装、可离线 |
| Windows / macOS / Linux | Tauri 2（Rust + 系统 WebView） | `.msi` / `.dmg` / `.AppImage` |
| Android / iOS | Capacitor 7 | `.apk` / `.aab` / `.ipa` |

不含 Electron、Flutter、uni-app——桌面与移动端都复用同一份 Web 产物，
差异全部收敛在 `src/platform` 里。

---

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

首次拉取代码后如果要用端到端测试，还需下载一次浏览器内核：

```bash
npm run e2e:install  # playwright install --with-deps chromium
```

---

## 项目结构

```text
TimeCalc/
├─ src/
│  ├─ core/                 ★ 纯 TypeScript 计算内核，零 UI 依赖、零平台依赖
│  │  ├─ dayjs.ts               dayjs 实例（utc + timezone 插件只在这里注册一次）
│  │  ├─ datetime.ts            日期解析 / 格式化 / 区间运算
│  │  ├─ duration.ts            时长分解与人类可读输出
│  │  ├─ dateDiff.ts            日期差（天 / 周 / 月 / 工作日）
│  │  ├─ dateAdd.ts             日期加减
│  │  ├─ timeDiff.ts            时间差（小时 / 分钟）
│  │  ├─ timeAdd.ts             时间加减
│  │  ├─ timezone.ts            时区换算
│  │  ├─ unix.ts                Unix 时间戳 ⇄ 日期
│  │  ├─ workdays.ts            工作日 / 调休
│  │  ├─ holidays.ts            节假日数据
│  │  ├─ lunar.ts               农历（1900–2100）
│  │  ├─ countdown.ts           倒计时
│  │  ├─ ics.ts                 .ics 日历文件生成
│  │  ├─ natural.ts             自然语言解析（自研中文规则 + chrono-node 兜底）
│  │  ├─ format.ts              展示格式化
│  │  ├─ types.ts               内核公共类型
│  │  └─ index.ts               统一出口
│  │
│  ├─ components/           ★ 跨端共享组件（三端复用同一套 UI）
│  │  ├─ Button.tsx             Button / IconButton（只有 md / lg 两档，都 ≥48px）
│  │  ├─ Field.tsx              TextField / DateField / TimeField / Switch / SelectField…
│  │  ├─ Segmented.tsx          Segmented / Tabs（radiogroup、tablist 语义）
│  │  ├─ Dialog.tsx             模态框（焦点陷阱 + 焦点归还 + Esc + 滚动锁定）
│  │  ├─ CommandPalette.tsx     命令面板 + 模糊匹配评分
│  │  ├─ ResultDisplay.tsx      结果区（大字号 + aria-live）
│  │  ├─ CopyButton.tsx         复制按钮 + 独立 live region
│  │  ├─ KeyboardHelp.tsx       快捷键帮助
│  │  ├─ Chip.tsx               Chip / ChipRow / Badge
│  │  ├─ Card.tsx               Card / StatList / StatRow
│  │  ├─ EmptyState.tsx         空状态
│  │  └─ cn.ts                  类名拼接（纯 clsx，不做 tailwind-merge）
│  │
│  ├─ platform/             ★ 平台差异的**唯一**落点
│  │  ├─ types.ts               适配器接口 + CapabilityResult 契约
│  │  ├─ detect.ts              运行时环境探测（唯一允许写平台判断的地方）
│  │  ├─ web.ts                 Web 基线实现（同时是另两个的父类）
│  │  ├─ tauri.ts               Web 基线 + Tauri 原生增强
│  │  ├─ capacitor.ts           Web 基线 + Capacitor 原生增强
│  │  └─ index.ts               createPlatform() / getPlatform()
│  │
│  ├─ features/             ★ 功能面板（每个面板只依赖 core + components + platform）
│  │  ├─ registry.ts            面板注册表：导航、命令面板、快捷键、历史的唯一真相来源
│  │  ├─ natural/               自然语言
│  │  ├─ dateDiff/  dateAdd/    日期差 / 日期加减
│  │  ├─ timeDiff/  timeAdd/    时间差 / 时间加减
│  │  ├─ timezone/  unix/       时区 / 时间戳
│  │  ├─ countdown/             倒计时
│  │  ├─ history/               历史记录
│  │  ├─ settings/              设置
│  │  └─ about/                 关于（能力清单）
│  │
│  ├─ hooks/                ★ 跨端复用逻辑
│  │  ├─ usePlatform.tsx        平台适配器的 React 接入点
│  │  ├─ useSettings.ts         设置订阅（useSyncExternalStore）
│  │  ├─ useTheme.ts            主题解析与写入
│  │  ├─ useHotkeys.ts          快捷键调度 + formatAccelerator
│  │  ├─ useNavigation.tsx      hash 路由
│  │  ├─ useHistory.ts          历史记录读写
│  │  ├─ useCountdown.ts        倒计时计时器（对齐 Date.now()，不累积漂移）
│  │  ├─ useCopy.ts             复制统一入口
│  │  ├─ useToast.tsx           Toast 系统
│  │  ├─ useInstallPrompt.ts    PWA 安装提示
│  │  └─ useMediaQuery.ts       媒体查询
│  │
│  ├─ db/                   ★ 持久化
│  │  ├─ settings.ts            localStorage（同步，首屏防闪烁需要）
│  │  ├─ schema.ts              Dexie 表结构（仅历史记录）
│  │  ├─ history.ts             历史记录增删查
│  │  └─ types.ts               持久化类型
│  │
│  ├─ apps/web/             ★ 应用外壳（三端共用的入口）
│  │  ├─ main.tsx               启动：初始化平台 → 挂载 React → 移除启动骨架
│  │  ├─ App.tsx                布局、导航、命令面板、快捷键、更新提示
│  │  └─ pwa.ts                 Service Worker 注册与更新调度
│  │
│  └─ test/setup.ts             Vitest 全局准备（匹配 jsdom 缺失的浏览器 API）
│
├─ src-tauri/               ★ Tauri 2 桌面壳（Rust 侧只有胶水代码）
│  ├─ src/lib.rs                窗口创建 + 插件注册
│  ├─ src/main.rs               可执行入口（薄，为了让移动端也能链接 lib）
│  ├─ capabilities/default.json 权限清单（与 src/platform/tauri.ts 一一对应）
│  ├─ tauri.conf.json           窗口、CSP、打包配置
│  ├─ Cargo.toml
│  └─ icons/                    `npx tauri icon` 生成；splash/ 另有 gen-splash.mjs
│
├─ public/
│  ├─ icons/                    PWA 图标（`npm run icons` 生成）
│  └─ offline.html              离线兜底页
│
├─ e2e/app.spec.ts          Playwright 端到端测试
├─ index.html               首屏防闪烁脚本 + 启动骨架
├─ vite.config.ts           构建目标切换 + PWA 配置 + Vitest 配置
├─ playwright.config.ts     4 个测试项目（桌面 ×2、移动 ×2）
├─ capacitor.config.ts
└─ tailwind.config.js       设计令牌映射
```

### 三层架构的边界规则

1. **`src/core` 不认识 React，也不认识平台。** 它只接收原始值、返回原始值，
   可以在 Node 里直接跑。因此它是唯一被要求 80% 覆盖率的部分。
2. **`src/components` 不允许出现 `if (isTauri)`。** 需要平台能力时通过
   `usePlatform()` 拿适配器，能力缺失时展示降级方案。
3. **`src/platform` 是唯一允许做平台判断的地方。** 新增原生能力时，
   改这里 + 对应的 `capabilities/default.json`，UI 一行都不用动。

---

## 命令

### 通用

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（`http://localhost:5173`） |
| `npm run build` | 类型检查 + 生产构建 → `dist/` |
| `npm run preview` | 预览 `dist/`（`http://localhost:4173`） |
| `npm run typecheck` | 只跑 `tsc --noEmit` |
| `npm test` | Vitest 单元测试（444 个） |
| `npm run test:watch` | 单元测试 watch 模式 |
| `npm run test:coverage` | 覆盖率报告（core 有阈值门槛） |
| `npm run e2e` | Playwright 端到端测试（自动 build + preview） |
| `npm run icons` | 生成 PWA 图标与移动端启动图（→ `public/icons/`、`src-tauri/icons/splash/`） |
| `npm run icons:tauri` | 生成桌面 / 移动端图标（→ `src-tauri/icons/`） |

### Web / PWA

```bash
npm run build
npm run preview            # 本地验证
# 部署：把 dist/ 整个目录丢到任意静态托管即可
```

Service Worker 用 **prompt** 模式：新版本就绪时底部弹条，用户点「立即更新」才切换，
不会在用户算到一半时刷新页面。

> PWA 需要 HTTPS（`localhost` 例外）。用 http 提供给内网时，
> 剪贴板会退回 `document.execCommand('copy')` 兜底，功能仍然可用。

### 桌面端（Tauri 2）

前置：Rust 工具链（`rustup`）+ 各平台系统依赖。

```bash
npm run tauri:dev          # 开发（热更新）

# 打包
npm run tauri:build:win    # Windows → .msi + .exe(NSIS)
npm run tauri:build:mac    # macOS   → .dmg + .app
npm run tauri:build:linux  # Linux   → .AppImage + .deb
npm run tauri:build        # 当前平台的默认全部目标
```

产物在 `src-tauri/target/release/bundle/`。

Linux 额外需要（Debian / Ubuntu）：

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

各平台只能在各自系统上打包（Windows 的 `.msi` 要在 Windows 上构建），
Tauri 不提供交叉编译。

> **已验证（Windows，2026-09-14）**：在 Rust 1.98.1 / MSVC 工具链上跑通
> `npm run tauri:build:win`，首次全量编译约 6 分 36 秒，产出
> `TimeCalc_0.1.0_x64_zh-CN.msi` 与 `_en-US.msi`（各 2.09 MB）、
> `TimeCalc_0.1.0_x64-setup.exe`（1.52 MB）。
> 打包过程中 Tauri 会自动从 GitHub 下载 WiX 3.14 与 NSIS 3.11 工具链。
> **macOS 与 Linux 两个目标没有在对应系统上验证过**，上面的 CI 路径同样未经实跑。

#### 拿全平台安装包：交给 CI

因为上一条限制，想一次性拿到全部五个平台的安装包，最省事的办法是让
[.github/workflows/release.yml](../.github/workflows/release.yml) 在 GitHub
提供的四种 runner 上分别构建：

```bash
git tag v0.2.0
git push origin v0.2.0     # 推送 tag 即触发，产物进草稿 Release
```

也可以在 Actions 页面手动触发（Run workflow）。产物：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `*_x64-setup.exe` | NSIS 安装包，双击即装 |
| Windows | `*_x64_en-US.msi` | WiX 安装包，适合批量部署 |
| macOS | `*.dmg` | 通用二进制，Apple Silicon 与 Intel 通用 |
| Linux | `*.AppImage` | 免安装，`chmod +x` 后直接运行 |
| Linux | `*.deb` | Debian / Ubuntu 系 |
| Android | `app-debug.apk` | debug 签名，可直接侧载 |
| iOS | `TimeCalc-unsigned.ipa` | **未签名**，需自己重签后才能装，见下 |

工作流默认产出**草稿** Release，确认无误后手动 Publish 才公开。
移动端产物先作为 workflow artifact 由各自的 job 上传，最后统一由一个
`attach-mobile` job 用 `gh release upload` 挂到 Release 上——**不各传各的**，
否则移动端 job 和桌面端的 `tauri-action` 会并行抢着创建同一个 Release，
正文由先跑完的那个决定。

首次构建约 10–20 分钟（要编译全部 Rust 依赖），之后有 Rust 缓存会快很多。

未配置代码签名，所以 macOS 首次打开需要右键「打开」，Windows 可能弹
SmartScreen 提示，Android 装的是 debug 签名包。要消除这些提示需自备证书，
`release.yml` 末尾列了所需的环境变量。

#### iOS 的 ipa 为什么不能直接装

能装到真机上的 `.ipa` **必须签名**，而签名要 Apple 开发者账号（$99/年）。
没有账号时 CI 只能产出**未签名**的 ipa，拿到后有两条路：

1. **自己重签侧载**：用 [AltStore](https://altstore.io/) 或
   [Sideloadly](https://sideloadly.io/)，拿你自己的 Apple ID 重签后装到设备上。
   免费 Apple ID 签的包 **7 天过期**，到期需重签——这是 Apple 的限制，不是构建的问题。
2. **走正式签名**：有账号后在 `release.yml` 的 `ios` job 里补上证书与描述文件的
   secrets，把 `CODE_SIGNING_ALLOWED=NO` 那条去掉即可产出可直接安装的 ipa。

### 移动端（Capacitor 7）

前置：

- **Android**：JDK 17+（本机用 21，与 Gradle 8.11 是一等组合）+ Android SDK，
  需要 `platform-tools`、`platforms;android-35`、`build-tools;35.0.0`
  （版本要和 [android/variables.gradle](../android/variables.gradle) 里的 `compileSdkVersion` 对齐）。
  本机 SDK 装在 `D:\Android\Sdk`，由 `android/local.properties` 指向——该文件随
  `android/` 一起在 `.gitignore` 里，CI 上改由 `ANDROID_HOME` 提供。
- **iOS**：**只能在 macOS 上构建**。Xcode 不发行 Windows 版，这不是工具链没配好，
  是没有可配的东西——编译器、SDK、签名工具全部锁在 macOS 里。
  本机 `npx cap add ios` 只能铺出 Xcode 工程（会提示
  `Skipping pod install because CocoaPods is not installed`），编译必须交给 CI。

```bash
npm run build:capacitor        # 生成 dist/（capacitor 目标，见下）

# Android
npm run cap:add:android        # 只需一次：铺模板 + 同步图标
npm run cap:android            # build + sync + 打开 Android Studio

# iOS
npm run cap:add:ios            # 只需一次（仅 macOS）
npm run cap:ios                # build + sync + 打开 Xcode
```

不开 Android Studio，直接出 APK：

```bash
npm run cap:sync
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

debug 包用的是 Android 自动生成的 debug 签名，可以直接侧载安装；
要上架或分发给别人，得自备 keystore 走 `assembleRelease`。

> **`android/` 与 `ios/` 都在 `.gitignore` 里**，属于生成产物，每次 `cap add`
> 都从头铺 Capacitor 模板。由此带来两个必须知道的后果：
>
> 1. **原生定制必须靠脚本补**。`scripts/sync-native.mjs` 负责把模板不会带的
>    那几处补回去，`cap:add:*` 脚本已经接上了这一步：
>    - **App 图标**——`npx tauri icon` 早就生成了整套原生图标
>      （`src-tauri/icons/android/` 与 `ios/`，已提交），但 `cap add` 铺的是
>      Capacitor 模板自带的默认 logo。
>    - **启动图（splash）**——跟 app 图标是两套独立资源，模板上印的同样是
>      Capacitor 的 logo。图由 `scripts/gen-splash.mjs` 生成，见下面「启动图」。
>    - **通知栏小图标**——`capacitor.config.ts` 里 `LocalNotifications.smallIcon`
>      点名了 `ic_stat_timecalc`，而模板里没有这个资源。通知小图标是拿 alpha
>      通道当遮罩渲染的，找不到就退回应用图标——状态栏里出来一个纯白方块。
>    - **`SCHEDULE_EXACT_ALARM` 权限**——倒计时通知要靠它才精确，
>      理由见下面「Android 上的精确闹钟」。
>    - **版本号**——模板写死 `versionCode 1` / `versionName "1.0"`，
>      跟发布版本无关。脚本按 `package.json` 的版本改写，
>      `versionCode` 用 `major*10000 + minor*100 + patch` 映射（0.2.0 → 200），
>      保证单调递增，否则 Android 不让覆盖安装。
>    - **AGP 的路径检查**——本项目路径含中文（`D:\系统\TimeCalc`），
>      AGP 默认直接拒绝构建。仅在路径确实含非 ASCII 字符时才放行，
>      CI 在 Linux 上路径全 ASCII，那边保留检查。
>
>    这一类的共同点是**漏了不会构建失败**（路径检查那条除外，它是硬失败）：
>    日志一切正常，只有装到真机、或打开「设置 → 应用」才看得出来。
>    所以凡是要加原生配置，都往这个脚本里加，别手改。
>    启动图与通知小图标各自带了安全网：万一 Capacitor 后续版本改了资源布局，
>    脚本会把「模板里有、我们没覆盖」的文件名逐一列出来，不会默默放过。
> 2. **不要直接改这两个目录里的文件**——改了下次 `cap add` 就丢。要固化上面
>    覆盖不到的原生改动（原生插件、自定义 manifest 节点），得先把对应目录从
>    `.gitignore` 里移出来改成提交。
>
> **`.gitignore` 里那两条规则必须带前导斜杠**（`/android/`、`/ios/`）。
> 不带斜杠时，`android/` 匹配的是**任意层级**的同名目录，会把
> `src-tauri/icons/android/`、`src-tauri/icons/ios/` 这些**需要提交的图标源**
> 一起忽略掉。踩过一次：源头没进仓库，CI 上 `sync-native.mjs` 只打一行
> 「跳过：没有 src-tauri/icons/android」就继续，构建全绿，打出来的 APK / IPA
> 装的却是 Capacitor 的默认图标——v0.2.0 就这么发出去了，装到手机上才发现。
> 所以改这两条规则时，务必用 `git ls-tree -r HEAD --name-only | grep icons/`
> 确认图标源确实在仓库里。

#### 启动图

启动时那一下白屏上的图案，跟 app 图标是**两套独立资源**：app 图标在
`mipmap-*` / `AppIcon.appiconset`，启动图在 `drawable*/splash.png` /
`Splash.imageset`。Capacitor 模板两边印的都是它自己的 logo——所以只换图标
是不够的，启动瞬间仍会闪一下 Capacitor 的蓝叉。

`scripts/gen-splash.mjs` 从 `public/icons/icon.svg` 重新生成这两套共 14 张
（Android 11 张 + iOS 3 张），产物提交进 `src-tauri/icons/splash/`，
再由 `sync-native.mjs` 拷进生成目录。

几个决定：

- **画布与 logo 尺寸原样沿用模板**（见脚本里的 `ANDROID_SPLASHES`），
  只换内容不换比例，启动页的视觉分量跟以前一致。那些数字是逐张量出来的，
  **没有可推导的公式**——Capacitor 直接打包了静态图，各密度的 logo 边长
  并不成比例（mdpi 64、hdpi/xhdpi 96、xxhdpi/xxxhdpi 128）。
- **底色直接从 `capacitor.config.ts` 读**，不在脚本里写死。它必须等于
  `SplashScreen.backgroundColor`，否则启动图交接给 WebView 的瞬间会闪色。
- **生成与同步分成两步**，因为生成要 sharp 而同步跑在 CI 上。产物进仓库，
  CI 侧就只做文件拷贝，不必装图像库。

#### Android 上的精确闹钟

倒计时到点要靠 `@capacitor/local-notifications` 把通知预排到未来的某一刻。
Android 12（API 31）起这件事多了一道手续——`SCHEDULE_EXACT_ALARM` 是
**特殊应用权限**，跟通知权限不是一回事：

- **清单里声明**只是拿到「有资格申请」；
- **Android 14+ 默认是拒绝的**，得用户自己在「闹钟和提醒」里打开。

两道都要，缺一不可。少了会怎样：插件不崩，而是在
`setExactIfPossible()` 里打一条 warning 后退回 `setAndAllowWhileIdle`——
通知照样响，但**时间不精确**，Doze 模式下可能晚几分钟。倒计时的全部意义
就是到点响，所以这条链上两处都补齐了：

| 位置 | 做了什么 |
| --- | --- |
| `scripts/sync-native.mjs` | 往 app manifest 里补 `SCHEDULE_EXACT_ALARM` 声明 |
| `src/platform/capacitor.ts` 的 `requestExactAlarm()` | 用户点「启用提醒」时，若尚未授权就跳系统设置页 |

几个刻意的取舍：

- **只在 Android 上做**。插件把 iOS 侧这两个方法实现成了 `call.unimplemented()`，
  直接调会 reject——必须按平台分支，不能盲调。
- **放在 `requestPermission()` 而不是 `scheduleAt()`**。前者是用户点按钮触发的，
  弹设置页符合预期；后者是后台排期，突然把用户拽去设置界面是骚扰。
- **已授权就直接返回**，不会每次点「启用提醒」都跳一次设置。
- **失败静默吞掉**。老版本插件没这两个方法、或设备没有该设置页时，退回非精确
  闹钟即可——不该因为「拿不到更精确的闹钟」让整个授权流程失败。

### 构建目标是怎么切的

`vite.config.ts` 里的 `resolveTarget()` 按三级优先决定目标，取值
`web` / `tauri` / `capacitor`：

| 优先级 | 来源 | 用途 |
| --- | --- | --- |
| 1 | `VITE_TARGET` 环境变量 | 手动覆盖、CI 交叉构建 |
| 2 | `--mode capacitor` | 移动端（Capacitor 不像 Tauri 那样注入环境变量） |
| 3 | `TAURI_ENV_PLATFORM` → `tauri`，否则 `web` | 桌面端 / 默认 |

三个目标的差别：

- `web`：启用 PWA 插件，`base = /`
- `tauri`：关闭 PWA，构建目标降到 `chrome105` / `safari13` 以适配各平台 WebView
- `capacitor`：关闭 PWA，`base = ./`

Tauri CLI 会注入 `TAURI_ENV_PLATFORM`，所以 `npm run tauri:build` 自动识别为
`tauri` 目标。**Capacitor CLI 什么都不注入**，所以移动端走 `--mode capacitor`
（即 `npm run build:capacitor`）。用 mode 而不是引 `cross-env`，是为了不在
npm scripts 里堆环境变量——Windows 上尤其难写。

> ⚠️ 给原生壳构建时**必须**用 `npm run build:capacitor`，别图省事跑 `npm run build`。
> 后者是 `web` 目标，会把 Service Worker 和 `manifest.webmanifest` 一起打进
> APK / ipa——SW 会在 WebView 里缓存旧资源，症状是「代码改了，App 里还是老样子」。
> `npm run cap:sync` 走的已经是正确目标。

非 Web 目标下 `virtual:pwa-register` 由 `vite.config.ts` 里的一个桩插件接管，
使 `src/apps/web/pwa.ts` 三端都能原样编译——**不给源码加 `if` 分支**。

---

## 平台差异是怎么封装的

`src/platform/types.ts` 定义了六个适配器，每个能力都返回
`CapabilityResult<T>` 而不是抛异常：

```ts
type CapabilityResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unsupported' | 'denied' | 'failed'; message?: string };
```

**能力缺失是正常情况，不是错误**——浏览器没有全局快捷键是事实，
UI 据此展示「已退化为页内快捷键」，而不是弹一个红色报错。

| 能力 | Web | Tauri | Capacitor |
| --- | --- | --- | --- |
| 通知 | Notification API | plugin-notification | local-notifications |
| 剪贴板 | clipboard API + execCommand 兜底 | plugin-clipboard-manager | @capacitor/clipboard |
| 保存文件 | `<a download>` | plugin-dialog + plugin-fs（原生「另存为」） | filesystem + share |
| 写入日历 | 不支持（恒返回 `unsupported`） | 落 `.ics` 到用户选定路径 | 落 `.ics` + 系统分享 |
| 全局快捷键 | 不支持 | plugin-global-shortcut | 不支持 |
| 轻触反馈 | 空操作 | 空操作 | @capacitor/haptics |

所有 `@tauri-apps/*` 与 `@capacitor/*` 都通过**动态 `import()`** 引入，
Vite 会自动把它们切成独立 chunk，Web 首屏不会加载到原生插件代码。

---

## 测试与验收

### 单元测试

```bash
npm test
```

444 个用例，分布如下：

| 文件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `src/core/datetime.test.ts` | 41 | 日期解析、格式化、边界（闰年、月末） |
| `src/core/duration.test.ts` | 24 | 时长分解与人类可读输出 |
| `src/core/calendar.test.ts` | 49 | 日期差 / 加减 / 工作日 / 节假日 / 农历 |
| `src/core/natural.test.ts` | 40 | 中文自然语言解析 |
| `src/core/format.test.ts` | 51 | 展示层格式化：占位符、取整、相对时间、截断 |
| `src/core/countdown.test.ts` | 23 | 倒计时快照、进度、五个预设目标时刻 |
| `src/components/components.test.tsx` | 104 | 组件语义、键盘交互、48px 触摸目标 |
| `src/platform/web.test.ts` | 41 | Web 适配器与降级路径 |
| `src/platform/detect.test.ts` | 33 | 平台/系统探测的每个分支 |
| `src/db/settings.test.ts` | 38 | 设置校验、脏数据回退、与首屏脚本的契约 |

覆盖率门槛配在 `vite.config.ts` 里：`src/core/**` 语句 / 函数 / 行 80%、分支 70%。
内核是三端共用的唯一真相来源，覆盖率掉了就应当视为构建失败。

门槛只统计**有运行时代码**的文件。`src/core/types.ts`（纯类型声明）与
`src/core/index.ts`（纯 re-export 桶文件）被显式排除：v8 会把它们记成 0/0，
计入分母等于在给「本来就没有逻辑」这件事扣分。注意别顺手写成
`src/**/types.ts`——`src/db/types.ts` 里放着 `HISTORY_KIND_META` 这类真数据，
必须继续计入。

### 端到端测试

```bash
npm run e2e:install        # 首次
npm run e2e                # 全部 4 个项目
npm run e2e -- --project=desktop-chromium   # 只跑 Chromium
```

Playwright 会自动 `build` + `preview` 后开跑，覆盖 4 个视口：
桌面 Chromium、桌面 Firefox、Pixel 7、iPhone 14。

注意 4 个项目分别依赖 Playwright 自带的 chromium / firefox / webkit 二进制，
所以 `npm run e2e` 之前必须先跑 `npm run e2e:install`（它会一并装好三种内核）。
只装 Chromium 的话，Firefox 与 WebKit 两个项目会因为找不到可执行文件而直接失败。

已在本机验证：`desktop-chromium` 与 `mobile-android`（Pixel 7）两个项目
**37 通过 / 1 跳过 / 0 失败**——跳过的是「移动端布局」那条，
它在非移动项目里会按 `test.skip` 主动跳过，属于预期行为。
Firefox 与 WebKit 两个项目尚未在本机跑过。

### 验收清单

#### 功能

- [ ] 日期差：2026-01-01 → 2026-12-31 = 365 天；可切「天 / 周 / 月 / 工作日」
- [ ] 日期加减：+1天 / +7天 / +30天 / +1月 芯片一次点击即出结果
- [ ] 时间差：09:00 → 18:00 = 9 小时
- [ ] 时间加减：支持跨天（23:00 + 3h = 次日 02:00）并明确标注跨天
- [ ] 时区换算：北京 2026-06-01 12:00 → 纽约 2026-06-01 00:00（夏令时已生效）
- [ ] 时间戳：`0` → `1970-01-01`；秒 / 毫秒自动识别且可手动切换
- [ ] 自然语言：「下周五 15:00 + 2h30m」→ 17:30；「2026-01-01 到 2026-09-14 多少个工作日」→ 数量
- [ ] 倒计时：设定目标后剩余时间持续刷新，到点触发通知
- [ ] 历史记录：算过一次后出现在列表；点击可复制；可收藏、可删除、可清空
- [ ] `.ics` 导出：导出的文件能被系统日历正常导入

#### 体验

- [ ] 手机（≤420px）单列布局，功能条可横向滚动，页面主体无横向滚动条
- [ ] 桌面多列布局，`Ctrl/⌘+K` 唤起命令面板，输入两个字就能跳到任意功能
- [ ] 所有可点元素的高度 ≥ 48px（e2e 里逐个量过）
- [ ] 暗色 / 亮色 / 跟随系统三态可切；刷新后不闪白（首屏内联脚本生效）
- [ ] 高对比度模式下边框与文字对比度明显提高
- [ ] `Tab` 能走完整个流程；`?` 打开快捷键帮助；`Esc` 关闭弹窗
- [ ] 修改输入后结果自动更新，屏幕阅读器会自动播报（`aria-live="polite"`）

#### 平台

- [ ] PWA 可安装到主屏幕；断网后仍能打开并使用
- [ ] `.msi` 安装后能从开始菜单启动；通知、另存为、全局快捷键均可用
- [ ] `.dmg` / `.AppImage` 能正常启动
- [ ] Android / iOS 包能安装；倒计时到点弹出系统通知
- [ ] 任一端的「关于」页正确显示当前平台与可用能力清单

---

## 设计约定（改动前请先读）

- **`cn()` 是纯 clsx，不是 tailwind-merge。** 后传的类名不会覆盖前传的，
  最终由 CSS 源码顺序决定。所以组件**不打算**允许外部用 `className` 覆盖内部
  的 Tailwind 类，暴露它只是为了加布局类（margin、grid 位置）。
- **设计系统里不存在小于 48px 的尺寸。** `Button` 只有 `md` / `lg`，
  `Segmented` 没有 `size` 属性。这是有意的：一旦存在小尺寸变体，
  迟早会有人用它把触摸目标做到 32px。
- **主题必须在首屏绘制前决定。** `index.html` 里有一段同步内联脚本直接读
  `localStorage['timecalc:settings']`。字段名改动必须同步改两边——
  `src/db/settings.test.ts` 会把那段脚本原文抠出来执行一遍来守住这个契约。
- **设置存 localStorage，历史存 IndexedDB。** 前者是同步的（首屏需要），
  后者数据量大且不需要参与首屏。
- **计时器对齐 `Date.now()` 而不是累加 `interval`。** 后台标签页的
  `setInterval` 会被节流，累加会越走越慢。
- **哈希路由（`#/panel-id`）而不是 History API。** 这样在 `file://`
  （Capacitor）和自定义协议（Tauri）下都能工作，不需要服务端配合重写规则。
- **Rust 侧不写业务逻辑。** 计算全在 TypeScript 里，桌面壳只负责创建窗口、
  注册插件、把系统能力暴露出去。
- **`src-tauri/capabilities/default.json` 与 `src/platform/tauri.ts` 必须同步。**
  权限少了，前端调用会被静默拦下（表现为「点了没反应」而不是报错）。

---

## 常见问题

**`npm run dev` 后手机访问不到？**
`vite.config.ts` 里 `server.host = true` 已开启局域网访问，用电脑的局域网 IP
加 `:5173` 访问即可。注意 http 访问时剪贴板会走降级路径。

**Tauri 构建报 `capabilities` 校验失败？**
`src/platform/tauri.ts` 里用了某个插件能力，但 `capabilities/default.json`
没放行。两边必须成对修改。

**Capacitor 打开是白屏？**
多半是 `base` 不是 `./`。用 `npm run cap:sync`（它包含正确的构建目标），
不要直接用 `npm run build` 的产物再手动 `cap copy`。

**PWA 更新不生效？**
Service Worker 是 prompt 模式，需要点底部的「立即更新」。
开发服务器下 SW 是关闭的（`devOptions.enabled = false`），要验证得用
`npm run build && npm run preview`。

---

## License

MIT
