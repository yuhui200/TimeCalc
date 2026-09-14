/**
 * 平台适配层入口。
 *
 * 用法（在应用启动时执行一次）：
 *   const platform = await createPlatform();
 *   await platform.init();
 *   <PlatformProvider value={platform}>...
 *
 * UI 组件通过 `usePlatform()` 拿适配器，**永远不要**自己 import
 * `./tauri` 或 `./capacitor`——那会让平台分支泄漏到 UI 里。
 */
import type { AppInfo, Platform, PlatformTarget } from './types';
import { detectOs, detectTarget, isInstallable, targetLabel } from './detect';
import { createWebPlatform, isStandalone } from './web';
import { createTauriPlatform } from './tauri';
import { createCapacitorPlatform } from './capacitor';

export * from './types';
export { detectOs, detectTarget, isCoarsePointer, isInstallable, targetLabel } from './detect';
export { isStandalone, downloadText, legacyCopy } from './web';
export { tapFeedback, nativeGet, nativeSet } from './capacitor';

function buildAppInfo(target: PlatformTarget): AppInfo {
  const os = detectOs();
  return {
    target,
    os,
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    installable: target === 'web' && isInstallable(),
    standalone: isStandalone(),
    label: targetLabel(target, os),
  };
}

/**
 * 创建当前平台的适配器集合。
 *
 * 探测失败时**不会**抛异常，而是退回 Web 实现——宁可少几个原生能力，
 * 也不能让应用起不来。
 */
export function createPlatform(target: PlatformTarget = detectTarget()): Platform {
  const info = buildAppInfo(target);
  try {
    if (target === 'tauri') return createTauriPlatform(info);
    if (target === 'capacitor') return createCapacitorPlatform(info);
    return createWebPlatform({ info });
  } catch {
    return createWebPlatform({ info });
  }
}

/** 全局单例。SSR / 测试里可能没有 window，此时按 Web 处理 */
let singleton: Platform | null = null;

export function getPlatform(): Platform {
  if (!singleton) singleton = createPlatform();
  return singleton;
}

/** 供测试替换实现 */
export function setPlatform(platform: Platform | null): void {
  singleton = platform;
}

export async function initPlatform(): Promise<Platform> {
  const platform = getPlatform();
  try {
    await platform.init();
  } catch {
    // 初始化失败不应阻断启动；各适配器会在调用时再报具体原因
  }
  return platform;
}
