/**
 * Service Worker 注册与更新提示。
 *
 * 需求：「PWA 离线可用 + Service Worker + manifest」。
 *
 * 为什么用 `registerType: 'prompt'` 而不是 `autoUpdate`：
 * 本应用的核心是「算到一半」，自动更新会在用户填完输入、正要读结果的瞬间
 * 刷新页面，把输入全部丢掉。所以更新必须由用户点了才发生。
 *
 * 三件事都在这里收口：
 *   1. 注册 SW；
 *   2. 有新版本时通知 UI（而不是自己刷新）；
 *   3. 离线就绪时给一次轻提示——用户知道「现在断网也能用了」。
 *
 * `virtual:pwa-register` 是 vite-plugin-pwa 提供的虚拟模块。
 * 在 Tauri / Capacitor 构建里 PWA 插件被关闭，vite.config.ts 里有一个
 * 替身插件把它解析成空实现，因此这份代码三端都能原样编译。
 */
import { registerSW } from 'virtual:pwa-register';

export interface PWAHandlers {
  /** 发现新版本，UI 应展示「立即更新」 */
  onNeedRefresh?: () => void;
  /** 离线缓存就绪（首次安装后触发一次） */
  onOfflineReady?: () => void;
  /** 注册失败 */
  onError?: (error: unknown) => void;
  /** 注册成功，给出 scope 供调试 */
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
}

export interface PWAController {
  /** 应用更新并刷新页面 */
  update: () => void;
  /** 主动检查更新（应用从后台回到前台时调用） */
  check: () => Promise<void>;
  /** 停止定时检查 */
  dispose: () => void;
}

/** 定时检查更新的间隔：1 小时。本地计算型应用不需要更频繁 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 初始化 PWA。返回的控制器即使在不支持 SW 的环境下也是安全的空实现，
 * 因此调用方不需要判断平台。
 */
export function initPWA(handlers: PWAHandlers = {}): PWAController {
  // 非浏览器环境（测试 / SSR）直接返回空实现
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { update: () => {}, check: async () => {}, dispose: () => {} };
  }

  let registration: ServiceWorkerRegistration | undefined;

  const updateSW = registerSW({
    // 注册后立刻检查一次，避免用户停在旧版本上直到刷新
    immediate: true,
    onNeedRefresh() {
      handlers.onNeedRefresh?.();
    },
    onOfflineReady() {
      handlers.onOfflineReady?.();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      handlers.onRegistered?.(reg);
    },
    onRegisterError(error: unknown) {
      // SW 注册失败不影响应用本身，只是失去离线能力
      handlers.onError?.(error);
    },
  });

  const timer = window.setInterval(() => {
    // 离线时检查必然失败，跳过以免刷无意义的报错
    if (!navigator.onLine) return;
    void registration?.update();
  }, CHECK_INTERVAL_MS);

  // 从后台切回前台时立即检查：用户可能就是「出去转了一圈回来」
  const onVisible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void registration?.update();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    update: () => {
      // true = 立刻激活新 SW 并重载页面
      void updateSW(true);
    },
    check: async () => {
      await registration?.update();
    },
    dispose: () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
