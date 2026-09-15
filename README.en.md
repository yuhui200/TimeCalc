# TimeCalc

**A time calculator that never touches the network.**

Date differences, date math, time differences, timezone conversion, Unix timestamps,
natural-language input, countdowns — computed entirely on your own device.
No account, no ads, no telemetry, no network requests.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-web%20%7C%20windows%20%7C%20macos%20%7C%20linux%20%7C%20android%20%7C%20ios-lightgrey)
![Network requests](https://img.shields.io/badge/network%20requests-0-brightgreen)

**[Open the web app →](https://yuhui200.github.io/TimeCalc/)** — nothing to install,
works offline after the first load.

<!--
  ============================================================
  One placeholder left: **screenshots**. Drop them into docs/images/
  and uncomment the block below.

     ![Date difference](docs/images/screenshot-1-desktop.png)
     ![Natural language input](docs/images/screenshot-2-mobile.png)

     Suggested sizes: desktop 1600x1000, mobile 800x1600. Three at most, at the top.

  The web URL is filled in, but it only resolves once Pages is enabled
  (Settings -> Pages -> Source: "GitHub Actions") and the deploy-pages
  workflow has run at least once.
  ============================================================
-->

[中文](README.md)

## Why another one

Every online date calculator I tried wanted my email first, buried the answer under
ads, or quietly shipped my input to a server. A date is not a secret — but the pattern
gets exhausting, so I wrote one that does the arithmetic locally.

TimeCalc runs entirely inside your local WebView. **Open DevTools → Network, filter to
Fetch/XHR, and use the app: zero requests.** The page itself is fetched from a static
host once, of course — after that it never talks to anyone. Airplane mode is a supported
configuration.

## What it does

- **Date difference** — in days, weeks, months, or *working days* (skips weekends and holidays)
- **Date math** — add or subtract days / weeks / months; one-tap chips for +1d, +7d, +30d, +1m
- **Time math** — differences and arithmetic that cross midnight (`23:00 + 3h` → `02:00` next day, clearly labelled)
- **Timezone conversion** — DST-aware, between any two zones
- **Unix timestamps** — seconds or milliseconds, auto-detected, both directions
- **Natural language** — type it the way you'd say it: `next Friday 3pm + 2h30m`, `2026-01-01 to 2026-09-14 working days`
- **Countdowns** — with a real system notification when the clock hits zero
- **Calendar export** — `.ics` files any calendar app can import
- **Command palette** — `Ctrl/⌘+K`, two characters to jump to any panel
- **History** — every calculation stays on your machine; favorite, copy, or delete
- **Lunar calendar and Chinese holidays** — 1900–2100, for those who need it

Built for accessibility rather than retrofitted: every tap target is ≥48px, the whole
flow is keyboard navigable, results are announced to screen readers (`aria-live`),
and there are dark / light / high-contrast themes with no white flash on load.

## Download

From the [Releases page](https://github.com/yuhui200/TimeCalc/releases):

| Platform | File | Notes |
| --- | --- | --- |
| Browser / PWA | [web app](https://yuhui200.github.io/TimeCalc/) | Installable to home screen, works offline |
| Windows | `TimeCalc_0.2.0_x64-setup.exe` | NSIS installer. SmartScreen will warn you — it's unsigned |
| Windows | `TimeCalc_0.2.0_x64_en-US.msi` | WiX installer, for managed deployment |
| macOS | `TimeCalc_0.2.0_universal.dmg` | Universal binary (Apple Silicon + Intel) |
| Linux | `TimeCalc_0.2.0_amd64.AppImage` | Portable — `chmod +x` and run |
| Linux | `TimeCalc_0.2.0_amd64.deb` | Debian / Ubuntu |
| Android | `app-debug.apk` | Debug-signed; enable "install from unknown sources" |
| iOS | `TimeCalc-unsigned.ipa` | **Unsigned** — sign it yourself, see below |

### About the warnings you'll see

**Nothing here is code-signed.** Signing certificates cost money — an EV certificate for
Windows, $99/year for Apple — and this is a side project. So:

- **Windows** — SmartScreen says "unknown publisher". *More info* → *Run anyway*.
- **macOS** — not notarized. Right-click → *Open* the first time; a double-click will be blocked by Gatekeeper.
- **Android** — the APK carries Android's auto-generated debug signature. Fine for sideloading, not for the Play Store.
- **iOS** — a `.ipa` must be signed to install on a device. Use [AltStore](https://altstore.io/) or [Sideloadly](https://sideloadly.io/) with your own Apple ID. With a **free** Apple ID the signature **expires after 7 days** and has to be renewed. That's Apple's rule, not a build problem.

The macOS and Linux builds have not been run on real hardware — they're only known to
compile in CI. Bug reports welcome.

## How it's built

One TypeScript codebase, four targets. No Electron and no Flutter: the desktop shell is
**Tauri 2** (Rust + the system WebView, which is why the Windows installer is a couple of
megabytes instead of a hundred), and the mobile shells are **Capacitor 7**. All of them
reuse the same web build.

- `src/core` — pure TypeScript. No React, no platform, runs in Node.
- `src/components` — shared UI. Contains no platform checks.
- `src/platform` — the only place allowed to ask "which platform am I on?"

Capabilities that a given platform lacks are reported as `{ ok: false, reason: 'unsupported' }`
rather than thrown — a browser having no global-shortcut API is a fact, not an error, so the
UI degrades instead of showing a red box.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 444 unit tests
npm run e2e          # Playwright, 4 viewports
```

Architecture rules, build-target switching, native-shell gotchas, and the acceptance
checklist live in **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** (Chinese).

## License

MIT
