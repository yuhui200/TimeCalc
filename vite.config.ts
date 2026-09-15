/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

/**
 * 版本号直接读 package.json，不再在下面写死。
 * 写死的话每次升版本都要手动同步这里，漏了就变成「安装包是 0.1.1、
 * 界面里显示 0.1.0」。CI 里需要覆盖时仍可用 VITE_APP_VERSION。
 */
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

/**
 * 构建目标：web(PWA) | tauri(桌面) | capacitor(移动)。
 *
 * Tauri CLI 在 beforeDevCommand / beforeBuildCommand 里会注入 TAURI_ENV_PLATFORM，
 * 所以直接 `npm run tauri:build` 就能自动切到 tauri 目标。
 * VITE_TARGET 显式存在时优先级更高，方便手动覆盖或 CI 里交叉构建。
 */
type BuildTarget = 'web' | 'tauri' | 'capacitor';

/**
 * 解析构建目标，三级优先：
 *
 *   1. `VITE_TARGET` 环境变量——手动覆盖，CI 里用；
 *   2. `--mode capacitor`——**Capacitor CLI 不会注入任何环境变量**
 *      （不像 Tauri 有 TAURI_ENV_PLATFORM），所以移动端只能靠 mode 传。
 *      用 Vite 的 mode 而不是引入 cross-env，是为了不打破上面那条
 *      「不在 npm scripts 里堆环境变量」的约定——Windows 上尤其难写。
 *   3. 其余：TAURI_ENV_PLATFORM 存在 → tauri，否则 → web。
 */
function resolveTarget(mode: string): BuildTarget {
  const explicit = process.env.VITE_TARGET as BuildTarget | undefined;
  if (explicit) return explicit;
  if (mode === 'capacitor') return 'capacitor';
  return process.env.TAURI_ENV_PLATFORM ? 'tauri' : 'web';
}

/**
 * `virtual:pwa-register` 的替身。
 *
 * 原生 App 壳里没有 Service Worker，注册逻辑必须是空操作而不是报错。
 * 返回一个永不触发回调的 registerSW，行为与「SW 不可用」时的真实实现一致。
 */
function pwaRegisterStub(): PluginOption {
  const ID = 'virtual:pwa-register';
  return {
    name: 'timecalc:pwa-register-stub',
    resolveId(id) {
      return id === ID ? `\0${ID}` : null;
    },
    load(id) {
      if (id !== `\0${ID}`) return null;
      return [
        'export function registerSW() {',
        '  return async function updateServiceWorker() {};',
        '}',
      ].join('\n');
    },
  };
}

export default defineConfig(({ mode }) => {
  const TARGET = resolveTarget(mode);
  const isTauri = TARGET === 'tauri';
  const isCapacitor = TARGET === 'capacitor';
  const enablePWA = TARGET === 'web';

  /**
   * Tauri 2 官方建议：Windows 使用 chrome105，macOS/Linux 使用 safari13，
   * 以便 WebView2 / WKWebView / WebKitGTK 都能正确解析产物。
   */
  const tauriBuildTarget =
    process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13';

  /**
   * 站点根路径。
   *
   * - Capacitor 走 file:// 或 capacitor://，必须用相对路径。
   *   （这里**必须**是 capacitor 目标：默认 web 目标会连 Service Worker 和
   *   manifest.webmanifest 一起打进原生包，SW 在 WebView 里会缓存旧资源。）
   * - 其余默认 '/'，所以本地开发地址仍然是 localhost:5173。
   * - `VITE_BASE` 用于部署到子路径：GitHub Pages 把站点放在 /<repo>/ 下，
   *   那里 base 不能是 '/'，否则静态资源全部 404。只有部署工作流会设置它。
   *
   * 下面的 manifest 里 start_url / scope / 图标路径都引用这个值，别各写各的。
   */
  const base = isCapacitor ? './' : (process.env.VITE_BASE || '/');

  return {
    base,

    // Tauri 会把 TAURI_ENV_* 注入到编译期，用于区分 dev / build 与平台
    envPrefix: ['VITE_', 'TAURI_ENV_'],

    plugins: [
      react(),
      // 非 Web 目标（Tauri / Capacitor）关掉了 PWA 插件，
      // `virtual:pwa-register` 会解析失败导致构建中断。
      // 这里补一个空实现，让 src/apps/web/pwa.ts 三端都能原样编译。
      ...(enablePWA ? [] : [pwaRegisterStub()]),
      ...((enablePWA
        ? [
            VitePWA({
              registerType: 'prompt',
              injectRegister: null, // 由 src/apps/web/pwa.ts 手动注册，便于控制更新提示

              // 开发环境下不启用 SW，避免调试缓存干扰；用 devOptions 可临时打开
              devOptions: { enabled: false },

              // 这些名字来自 `npm run icons`（pwa-assets-generator minimal-2023 预设）
              // 的实际产物，改预设时这里要同步改。
              includeAssets: [
                'icons/icon.svg',
                'icons/favicon.ico',
                'icons/apple-touch-icon-180x180.png',
                'offline.html',
              ],

              // 下面所有路径都以 `base` 开头，不写死 '/'。
              // 部署到子路径时（GitHub Pages 的 /<repo>/）写死 '/' 会让
              // start_url 指向域名根、图标全部 404——装到主屏幕后打开是白屏。
              // 这段只在 web 目标下求值（enablePWA），此时 base 必是 '/xxx/' 形式。
              manifest: {
                id: base,
                name: 'TimeCalc — 时间计算器',
                short_name: 'TimeCalc',
                description:
                  '日期差、日期加减、时间差、时区转换、Unix 时间戳、自然语言时间解析。全部在本地计算，离线可用。',
                lang: 'zh-CN',
                dir: 'ltr',
                start_url: base,
                scope: base,
                display: 'standalone',
                display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
                orientation: 'any',
                background_color: '#ffffff',
                theme_color: '#2563eb',
                categories: ['utilities', 'productivity'],
                icons: [
                  { src: `${base}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
                  { src: `${base}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
                  {
                    src: `${base}icons/maskable-icon-512x512.png`,
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                  { src: `${base}icons/icon.svg`, sizes: 'any', type: 'image/svg+xml' },
                ],
                // 快捷方式用 hash 路由：与 src/hooks/useNavigation.tsx 的约定一致，
                // 且 H5 壳里 file:// 协议下也能正确跳转
                shortcuts: [
                  {
                    name: '自然语言计算',
                    short_name: '自然语言',
                    url: `${base}#/natural`,
                    description: '直接输入「下周五 15:00 + 2h30m」',
                  },
                  {
                    name: '时区换算',
                    short_name: '时区',
                    url: `${base}#/timezone`,
                  },
                  {
                    name: '日期差',
                    short_name: '日期差',
                    url: `${base}#/date-diff`,
                  },
                  {
                    name: 'Unix 时间戳',
                    short_name: '时间戳',
                    url: `${base}#/unix`,
                  },
                ],
              },

              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
                globIgnores: ['**/icons/source/**'],
                // 同样不能让它是写死的 '/'：SW 会拿这个路径当离线兜底，
                // 部署在子路径时 /index.html 根本不存在，断网就白屏。
                navigateFallback: `${base}index.html`,
                navigateFallbackDenylist: [/^\/api\//],
                cleanupOutdatedCaches: true,
                clientsClaim: false,
                skipWaiting: false,
                runtimeCaching: [
                  {
                    // 本地计算型应用：导航请求走「网络优先，失败回退缓存」，保证版本及时更新
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'timecalc-pages',
                      networkTimeoutSeconds: 3,
                      expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 30 },
                    },
                  },
                  {
                    urlPattern: ({ request }) =>
                      ['style', 'script', 'worker'].includes(request.destination),
                    handler: 'StaleWhileRevalidate',
                    options: {
                      cacheName: 'timecalc-assets',
                      expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 60 },
                    },
                  },
                  {
                    urlPattern: ({ request }) => request.destination === 'image',
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'timecalc-images',
                      expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 90 },
                    },
                  },
                ],
              },
            }) satisfies PluginOption,
          ]
        : []) as PluginOption[]),
    ],

    resolve: {
      alias: {
        '@': srcDir,
      },
    },

    define: {
      __APP_TARGET__: JSON.stringify(TARGET),
      __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? pkg.version),
    },

    server: {
      port: 5173,
      strictPort: false,
      host: true, // 便于手机在同一局域网访问调试
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      target: isTauri ? tauriBuildTarget : 'es2022',
      // 始终压缩。Cargo.toml 的 [profile.release] 只作用于 Rust 代码，
      // 嵌入式 WebView 加载的 JS/CSS 是原样打包进去的——不压的话
      // 桌面端首屏要解析 300KB+ 未压缩脚本，白白拖慢启动。
      minify: 'esbuild',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            time: ['dayjs'],
            nlp: ['chrono-node'],
            db: ['dexie'],
          },
        },
      },
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/core/**', 'src/platform/**', 'src/db/**'],
        // 只排除**没有任何运行时代码**的文件：纯类型声明与纯 re-export 桶文件。
        // v8 会把它们记成 0/0，计入分母只会稀释真实模块的信号——
        // 那是在给「没有逻辑」这件事扣分，不是在衡量测试质量。
        // 注意别顺手写成 src/**/types.ts：src/db/types.ts 里放着
        // HISTORY_KIND_META 这类真数据，必须继续计入。
        exclude: ['src/core/types.ts', 'src/core/index.ts', 'src/db/index.ts'],
        thresholds: {
          // 内核必须保持高覆盖：它是三端共用的唯一真相来源
          'src/core/**': { statements: 80, branches: 70, functions: 80, lines: 80 },
        },
      },
    },
  };
});
