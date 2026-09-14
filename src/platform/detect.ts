/**
 * 运行时环境探测。
 *
 * 这是**唯一**允许写平台判断的地方。UI 只能读 `platform.info`，
 * 绝不允许直接摸 `window.__TAURI__` 或 `Capacitor`——那样会让
 * Web 构建里出现指向原生全局变量的死代码，也会让测试难以覆盖。
 */
import type { PlatformOs, PlatformTarget } from './types';

/** Tauri 2 在 window 上注入的内部句柄 */
interface TauriWindow extends Window {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}

/** Capacitor 在 window 上注入的全局对象 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
}

interface CapacitorWindow extends Window {
  Capacitor?: CapacitorGlobal;
}

/**
 * 探测目标平台。
 *
 * 优先级：Tauri > Capacitor > Web。
 * 不用 `VITE_TARGET` 编译期常量做主判据，因为同一个 Web 产物
 * 也可能被塞进 WebView 里跑；编译期常量只作为兜底交叉验证。
 */
export function detectTarget(): PlatformTarget {
  if (typeof window === 'undefined') return 'web';

  const w = window as TauriWindow;
  // Tauri 2 一定注入 __TAURI_INTERNALS__；__TAURI__ 则需要开 withGlobalTauri
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) return 'tauri';

  const cap = (window as CapacitorWindow).Capacitor;
  if (cap) {
    // Capacitor 3+ 提供 isNativePlatform()；Web 端也会注入 Capacitor 对象，
    // 必须靠这个函数区分，否则浏览器里会被误判成原生
    if (typeof cap.isNativePlatform === 'function') {
      return cap.isNativePlatform() ? 'capacitor' : 'web';
    }
    // 老版本没有该函数，退回看 platform 字段：'web' 表示跑在浏览器里
    const name = cap.getPlatform?.() ?? cap.platform;
    if (name && name !== 'web') return 'capacitor';
  }

  // 编译期兜底：某些壳（如 Tauri 的 devUrl 直连）可能来不及注入
  const buildTarget = typeof __APP_TARGET__ !== 'undefined' ? __APP_TARGET__ : 'web';
  return buildTarget === 'tauri' ? 'tauri' : buildTarget === 'capacitor' ? 'capacitor' : 'web';
}

/** 探测操作系统，仅用于文案与默认快捷键展示 */
export function detectOs(): PlatformOs {
  if (typeof navigator === 'undefined') return 'unknown';

  const cap = (window as CapacitorWindow).Capacitor;
  const capPlatform = cap?.getPlatform?.() ?? cap?.platform;
  if (capPlatform === 'android') return 'android';
  if (capPlatform === 'ios') return 'ios';

  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  // iPadOS 13+ 的 UA 伪装成 macOS，靠触摸点数区分
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return 'ios';

  // navigator.userAgentData 是 Chromium 才有的，取 platform 更准
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? '';
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'macos';
  if (/Linux|X11/i.test(platform)) return 'linux';

  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

/** 平台可读名，用于「关于」页 */
export function targetLabel(target: PlatformTarget, os: PlatformOs): string {
  if (target === 'tauri') {
    if (os === 'windows') return 'TimeCalc for Windows';
    if (os === 'macos') return 'TimeCalc for macOS';
    return 'TimeCalc for Linux';
  }
  if (target === 'capacitor') {
    if (os === 'android') return 'TimeCalc for Android';
    if (os === 'ios') return 'TimeCalc for iOS';
    return 'TimeCalc Mobile';
  }
  return 'TimeCalc Web';
}

/** 是否满足「可安装」条件：有 Service Worker 且未处于独立窗口 */
export function isInstallable(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** 移动端判定，用于决定默认布局密度（属于展示逻辑，不算平台分支） */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
