# TimeCalc · 时间计算器

**一个从不联网的时间计算器。**

日期差、日期加减、时间差、时间加减、时区转换、Unix 时间戳、自然语言输入、倒计时——
全部在你的设备上算完。没有账号，没有广告，没有埋点，没有网络请求。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![平台](https://img.shields.io/badge/platforms-web%20%7C%20windows%20%7C%20macos%20%7C%20linux%20%7C%20android%20%7C%20ios-lightgrey)
![网络请求](https://img.shields.io/badge/network%20requests-0-brightgreen)

**[打开网页版 →](https://yuhui200.github.io/TimeCalc/)** —— 不用安装，首次加载后可离线使用。

<!--
  ============================================================
  还差一处：**截图**。录好后放进 docs/images/，再把下面这段的注释去掉：

     ![日期差](docs/images/screenshot-1-desktop.png)
     ![自然语言输入](docs/images/screenshot-2-mobile.png)

     建议尺寸：桌面 1600×1000，手机 800×1600。三张以内，放最上面。

  网页版地址已填好，但它要等仓库 Settings → Pages 里
  把 Source 设成 "GitHub Actions"、且 deploy-pages 工作流跑过一次之后才通。
  ============================================================
-->

[English](README.en.md)

## 为什么要再写一个

我试过的每一个在线日期计算器，要么先要我的邮箱，要么把答案埋在广告底下，
要么悄悄把输入发去服务器。日期算不上什么秘密，但这种套路让人疲惫，
所以我自己写了一个在本地算的。

TimeCalc 完全跑在你本地的 WebView 里。**打开开发者工具 → Network，筛到 Fetch/XHR，
操作一遍：零个请求。** 页面本身当然要从静态服务器取一次 JS 和 CSS，但那之后
它再不跟任何人说话。飞行模式是受支持的用法。

## 能做什么

- **日期差** —— 按天、周、月，或**工作日**（跳过周末和节假日）
- **日期加减** —— 加减天 / 周 / 月；+1天、+7天、+30天、+1月 一键出结果
- **时间加减** —— 支持跨天（`23:00 + 3h` → 次日 `02:00`，并明确标注）
- **时区换算** —— 自动处理夏令时，任意两个时区之间
- **Unix 时间戳** —— 秒 / 毫秒自动识别，双向换算
- **自然语言** —— 按你平时说话的方式输入：`下周五下午3点 + 2h30m`、`2026-01-01 到 2026-09-14 多少个工作日`。
  中文规则是手写的，不是拿通用解析器凑合
- **倒计时** —— 到点弹真的系统通知
- **日历导出** —— 生成 `.ics`，任何日历应用都能导入
- **命令面板** —— `Ctrl/⌘+K`，打**拼音首字母**就能跳：`rqc` → 日期差，`sq` → 时区，`djs` → 倒计时
- **历史记录** —— 所有计算都留在本机，可收藏、可复制、可删除
- **农历、节假日与调休** —— 1900–2100。想知道「调休之后哪天要上班」，不用再去翻日历

无障碍是设计进去的，不是后来补的：所有触摸目标 ≥48px，全流程可用键盘走完，
结果通过 `aria-live` 播报给屏幕阅读器，暗色 / 亮色 / 高对比度三态，刷新不闪白。

## 下载

在 [Releases 页面](https://github.com/yuhui200/TimeCalc/releases) 获取：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| 浏览器 / PWA | [网页版](https://yuhui200.github.io/TimeCalc/) | 可装到主屏幕，断网可用 |
| Windows | `TimeCalc_0.2.0_x64-setup.exe` | NSIS 安装包。会弹 SmartScreen 警告——未签名 |
| Windows | `TimeCalc_0.2.0_x64_en-US.msi` | WiX 安装包，适合批量部署 |
| macOS | `TimeCalc_0.2.0_universal.dmg` | 通用二进制（Apple Silicon + Intel） |
| Linux | `TimeCalc_0.2.0_amd64.AppImage` | 免安装，`chmod +x` 后直接运行 |
| Linux | `TimeCalc_0.2.0_amd64.deb` | Debian / Ubuntu 系 |
| Android | `app-debug.apk` | debug 签名，需允许「安装未知来源应用」 |
| iOS | `TimeCalc-unsigned.ipa` | **未签名**，需自己重签，见下 |

### 关于那些警告

**所有安装包都没有代码签名。** 签名要花钱——Windows 的 EV 证书、Apple 的 99 美元/年——
这是个业余项目，没有配。所以：

- **Windows** —— SmartScreen 提示「未知发布者」，点「更多信息」→「仍要运行」。
- **macOS** —— 未公证。首次打开要右键 →「打开」，直接双击会被 Gatekeeper 拦下。
- **Android** —— 用的是 Android 自动生成的 debug 签名。侧载没问题，上不了应用商店。
- **iOS** —— `.ipa` 必须签名才能装到设备上。用 [AltStore](https://altstore.io/) 或
  [Sideloadly](https://sideloadly.io/) 配合你自己的 Apple ID 重签。**免费 Apple ID 签的
  **7 天后失效**，到期要重签一次——这是 Apple 的限制，不是构建的问题。

macOS 与 Linux 的产物没有在真机上验证过，目前只有 CI 构建成功的记录。欢迎提 Issue。

## 是怎么做的

一份 TypeScript 代码，四种产物。没有 Electron，也没有 Flutter：桌面壳是
**Tauri 2**（Rust + 系统 WebView，所以 Windows 安装包只有几 MB 而不是一百多 MB），
移动壳是 **Capacitor 7**，三者复用同一份 Web 产物。

- `src/core` —— 纯 TypeScript。不认识 React，也不认识平台，能在 Node 里直接跑。
- `src/components` —— 跨端共享 UI，不允许出现平台判断。
- `src/platform` —— 唯一允许问「我在哪个平台上」的地方。

平台缺失某项能力时返回 `{ ok: false, reason: 'unsupported' }` 而不是抛异常——
浏览器没有全局快捷键 API 是个事实，不是错误，所以界面降级展示而不是弹一个红框。

## 开发

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 444 个单元测试
npm run e2e          # Playwright，4 个视口
```

架构约定、构建目标怎么切、原生壳的几个坑、验收清单，都在
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**。

## License

MIT
