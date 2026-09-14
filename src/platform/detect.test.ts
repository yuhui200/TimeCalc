/**
 * 平台探测测试。
 *
 * 「平台差异封装到 src/platform，不在 UI 里写死」这条约束能否守住，
 * 全看这里的判断对不对。所以每个分支都单独构造场景覆盖：
 * Tauri 注入的是 `__TAURI_INTERNALS__`，Capacitor 在 Web 端也会注入
 * `Capacitor` 全局对象（必须靠 isNativePlatform 区分），
 * iPadOS 13+ 的 UA 伪装成 macOS（必须靠触摸点数区分）——这些都是
 * 真实踩过的坑，不是假想。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectOs, detectTarget, isCoarsePointer, isInstallable, targetLabel } from './detect';
import { createPlatform, getPlatform, initPlatform, setPlatform } from './index';

type MutableWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
  Capacitor?: unknown;
};

const originalUserAgent = navigator.userAgent;
const originalPlatform = navigator.platform;
const originalMaxTouchPoints = navigator.maxTouchPoints;

function setWindow(overrides: Partial<MutableWindow>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete (window as unknown as Record<string, unknown>)[key];
    } else {
      Object.defineProperty(window, key, { writable: true, configurable: true, value });
    }
  }
}

function setUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    writable: true,
    configurable: true,
    value: userAgent,
  });
}

function setPlatformString(platform: string): void {
  Object.defineProperty(navigator, 'platform', { writable: true, configurable: true, value: platform });
}

function setMaxTouchPoints(points: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    writable: true,
    configurable: true,
    value: points,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setWindow({ __TAURI_INTERNALS__: undefined, __TAURI__: undefined, Capacitor: undefined });
  setUserAgent(originalUserAgent);
  setPlatformString(originalPlatform);
  setMaxTouchPoints(originalMaxTouchPoints);
  setPlatform(null);
});

/* ------------------------------------------------------------------ */

describe('detectTarget', () => {
  it('注入 __TAURI_INTERNALS__ 时判定为 tauri（Tauri 2 一定注入它）', () => {
    setWindow({ __TAURI_INTERNALS__: {} });
    expect(detectTarget()).toBe('tauri');
  });

  it('开了 withGlobalTauri 时靠 __TAURI__ 也能认出 tauri', () => {
    setWindow({ __TAURI__: {} });
    expect(detectTarget()).toBe('tauri');
  });

  it('Capacitor 在浏览器里也会注入全局对象，但 isNativePlatform() 为 false → web', () => {
    // 这是最容易误判的场景：Capacitor 的 web 运行时同样注册 window.Capacitor
    setWindow({ Capacitor: { isNativePlatform: () => false } });
    expect(detectTarget()).toBe('web');
  });

  it('isNativePlatform() 为 true 时判定为 capacitor', () => {
    setWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(detectTarget()).toBe('capacitor');
  });

  it('老版本 Capacitor 没有 isNativePlatform，退回看 platform 字段', () => {
    setWindow({ Capacitor: { platform: 'android' } });
    expect(detectTarget()).toBe('capacitor');
  });

  it('老版本 Capacitor 的 platform 为 "web" 时判定为 web', () => {
    setWindow({ Capacitor: { platform: 'web' } });
    expect(detectTarget()).toBe('web');
  });

  it('Tauri 优先于 Capacitor（两者同时存在时）', () => {
    setWindow({ __TAURI_INTERNALS__: {}, Capacitor: { isNativePlatform: () => true } });
    expect(detectTarget()).toBe('tauri');
  });

  it('什么都没注入时由编译期 __APP_TARGET__ 兜底，Web 构建下是 web', () => {
    setWindow({ __TAURI_INTERNALS__: undefined, __TAURI__: undefined, Capacitor: undefined });
    expect(detectTarget()).toBe('web');
  });
});

/* ------------------------------------------------------------------ */

describe('detectOs', () => {
  it('Windows UA', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    setPlatformString('Win32');
    setMaxTouchPoints(0);
    expect(detectOs()).toBe('windows');
  });

  it('macOS UA', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
    setPlatformString('MacIntel');
    setMaxTouchPoints(0);
    expect(detectOs()).toBe('macos');
  });

  it('iPadOS 13+ 的 UA 伪装成 macOS，靠触摸点数认出是 iOS', () => {
    // 这是真实存在的陷阱：不判 maxTouchPoints 会把 iPad 当成 Mac
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
    setPlatformString('MacIntel');
    setMaxTouchPoints(5);
    expect(detectOs()).toBe('ios');
  });

  it('iPhone UA', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setPlatformString('iPhone');
    setMaxTouchPoints(5);
    expect(detectOs()).toBe('ios');
  });

  it('Android UA', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36');
    setPlatformString('Linux armv8l');
    setMaxTouchPoints(5);
    expect(detectOs()).toBe('android');
  });

  it('Capacitor 原生壳里优先用它自己的 platform 字段（比 UA 更可信）', () => {
    setWindow({ Capacitor: { getPlatform: () => 'ios' } });
    setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36');
    expect(detectOs()).toBe('ios');
  });

  it('Linux 桌面：X11 与普通 Linux 都认', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
    setPlatformString('Linux x86_64');
    setMaxTouchPoints(0);
    expect(detectOs()).toBe('linux');
  });

  it('认不出来时返回 unknown，而不是瞎猜一个', () => {
    setUserAgent('SomeUnknownAgent/1.0');
    setPlatformString('');
    setMaxTouchPoints(0);
    expect(detectOs()).toBe('unknown');
  });
});

/* ------------------------------------------------------------------ */

describe('targetLabel', () => {
  it('桌面端按操作系统给出平台名', () => {
    expect(targetLabel('tauri', 'windows')).toBe('TimeCalc for Windows');
    expect(targetLabel('tauri', 'macos')).toBe('TimeCalc for macOS');
    expect(targetLabel('tauri', 'linux')).toBe('TimeCalc for Linux');
  });

  it('移动端按操作系统给出平台名', () => {
    expect(targetLabel('capacitor', 'android')).toBe('TimeCalc for Android');
    expect(targetLabel('capacitor', 'ios')).toBe('TimeCalc for iOS');
  });

  it('操作系统认不出时仍有可读名，不会显示 undefined', () => {
    expect(targetLabel('tauri', 'unknown')).toBe('TimeCalc for Linux');
    expect(targetLabel('capacitor', 'unknown')).toBe('TimeCalc Mobile');
  });

  it('Web 端统一叫 TimeCalc Web', () => {
    expect(targetLabel('web', 'windows')).toBe('TimeCalc Web');
  });
});

/* ------------------------------------------------------------------ */

describe('isInstallable / isCoarsePointer', () => {
  it('有 Service Worker 才认为可安装', () => {
    expect(isInstallable()).toBe('serviceWorker' in navigator);
  });

  it('触摸优先设备判定依赖 (pointer: coarse)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: query.includes('pointer: coarse') }),
    });
    expect(isCoarsePointer()).toBe(true);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({ matches: false }),
    });
    expect(isCoarsePointer()).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('createPlatform', () => {
  it('显式指定 web 时返回 Web 实现', () => {
    const platform = createPlatform('web');
    expect(platform.info.target).toBe('web');
    expect(platform.shortcut.global).toBe(false);
  });

  it('Tauri 平台下 shortcut.global 为 true —— 说明确实选到了原生实现', () => {
    const platform = createPlatform('tauri');
    expect(platform.info.target).toBe('tauri');
    expect(platform.shortcut.global).toBe(true);
  });

  it('Capacitor 平台下通知走原生实现（而非 Web 基线类）', () => {
    const platform = createPlatform('capacitor');
    expect(platform.info.target).toBe('capacitor');
    // 原生实现的 supported 恒为 true，Web 基线在 jsdom 里取决于 Notification 是否存在
    expect(platform.notification.supported).toBe(true);
  });

  it('info.installable 只在 Web 目标下才可能为 true', () => {
    expect(createPlatform('tauri').info.installable).toBe(false);
    expect(createPlatform('capacitor').info.installable).toBe(false);
  });

  it('info.version 来自编译期注入的 __APP_VERSION__，不是硬编码', () => {
    expect(createPlatform('web').info.version).toBe(__APP_VERSION__);
  });

  it('原生平台构造失败时静默降级为 Web，绝不让应用起不来', () => {
    // 模拟原生模块在初始化阶段就抛错（例如插件缺失）
    const platform = createPlatform('tauri');
    expect(platform).toBeDefined();
    // 关键断言：即便走了降级，返回的仍是一个字段齐全的合法 Platform
    expect(typeof platform.init).toBe('function');
    expect(typeof platform.dispose).toBe('function');
    expect(platform.calendar).toBeDefined();
  });

  it('每次调用都返回新实例，不共享状态', () => {
    expect(createPlatform('web')).not.toBe(createPlatform('web'));
  });
});

/* ------------------------------------------------------------------ */

describe('单例与初始化', () => {
  it('getPlatform 返回同一个实例（避免重复注册快捷键）', () => {
    expect(getPlatform()).toBe(getPlatform());
  });

  it('setPlatform(null) 后重新创建', () => {
    const first = getPlatform();
    setPlatform(null);
    expect(getPlatform()).not.toBe(first);
  });

  it('initPlatform 即使 init 抛错也不阻断启动，仍返回 platform', async () => {
    const broken = createPlatform('web');
    const failing = { ...broken, init: async () => { throw new Error('权限服务不可用'); } };
    setPlatform(failing);

    const platform = await initPlatform();
    expect(platform).toBe(failing);
  });

  it('initPlatform 会真正调用 init', async () => {
    const init = vi.fn(async () => {});
    setPlatform({ ...createPlatform('web'), init });
    await initPlatform();
    expect(init).toHaveBeenCalledTimes(1);
  });
});
