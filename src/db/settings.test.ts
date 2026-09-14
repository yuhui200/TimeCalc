/**
 * 设置持久化测试。
 *
 * 这些用例的重点不是「能存能取」，而是**脏数据不能流进计算逻辑**：
 * 用户可能装了旧版本、手改过 localStorage、或者同域下有别的应用
 * 写过同名 key。coerce() 是唯一的防线，所以它需要被单独压测。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  __resetSettingsCache,
  coerce,
  loadSettings,
  patchSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from './settings';

const SETTINGS_KEY = 'timecalc:settings';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  __resetSettingsCache();
  // 反闪烁脚本会写这两个属性，用例之间必须清干净
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.contrast;
  document.documentElement.style.colorScheme = '';
});

describe('DEFAULT_SETTINGS', () => {
  it('默认跟随系统主题，一周从周一开始（中文用户习惯）', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(DEFAULT_SETTINGS.weekStart).toBe(1);
  });

  it('默认周末是周六日，且历史记录默认开启', () => {
    expect(DEFAULT_SETTINGS.weekend).toEqual([0, 6]);
    expect(DEFAULT_SETTINGS.historyEnabled).toBe(true);
  });

  it('默认时区是北京 → 纽约，符合「跨时区协作」这个主场景', () => {
    expect(DEFAULT_SETTINGS.defaultFromZone).toBe('Asia/Shanghai');
    expect(DEFAULT_SETTINGS.defaultToZone).toBe('America/New_York');
  });

  it('全局快捷键默认关闭：未经用户同意不该占用系统级热键', () => {
    expect(DEFAULT_SETTINGS.globalShortcutEnabled).toBe(false);
  });

  it('常驻时区列表包含 UTC——它是换算时的心理锚点', () => {
    expect(DEFAULT_SETTINGS.pinnedZones).toContain('UTC');
  });
});

describe('coerce：脏数据回退', () => {
  it('空对象/undefined/null 都返回完整默认值', () => {
    expect(coerce(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(coerce(null)).toEqual(DEFAULT_SETTINGS);
    expect(coerce({})).toEqual(DEFAULT_SETTINGS);
  });

  it('非对象输入（字符串、数字、数组）不会让函数崩溃', () => {
    // 有人在 localStorage 里写了裸字符串 'dark'
    expect(() => coerce('dark')).not.toThrow();
    expect(() => coerce(42)).not.toThrow();
    expect(coerce('dark')).toEqual(DEFAULT_SETTINGS);
  });

  it('theme 只接受三个合法值，其余回退', () => {
    expect(coerce({ theme: 'dark' }).theme).toBe('dark');
    expect(coerce({ theme: 'light' }).theme).toBe('light');
    expect(coerce({ theme: 'system' }).theme).toBe('system');
    // 旧版本可能写过 'auto'，或有人手改成 'DARK'（大小写敏感）
    expect(coerce({ theme: 'auto' }).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(coerce({ theme: 'DARK' }).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('weekend 是字符串时不被展开成字符数组', () => {
    // 危险的脏数据：'0,6' 若被当成数组处理会得到 ['0', ',', '6']
    const result = coerce({ weekend: '0,6' });
    expect(result.weekend).toEqual(DEFAULT_SETTINGS.weekend);
  });

  it('weekend 过滤掉越界与非整数，并去重排序', () => {
    expect(coerce({ weekend: [6, 0, 0, 7, -1, 1.5, 3] }).weekend).toEqual([0, 3, 6]);
  });

  it('weekend 允许空数组（全年无休是合法业务场景，不是错误）', () => {
    expect(coerce({ weekend: [] }).weekend).toEqual([]);
  });

  it('pinnedZones 不允许为空——否则时区面板会整片空白', () => {
    expect(coerce({ pinnedZones: [] }).pinnedZones).toEqual(DEFAULT_SETTINGS.pinnedZones);
    expect(coerce({ pinnedZones: ['', '  '] }).pinnedZones).toEqual(DEFAULT_SETTINGS.pinnedZones);
  });

  it('pinnedZones 会去重并剔除空字符串', () => {
    expect(coerce({ pinnedZones: ['UTC', 'UTC', 'Asia/Tokyo', ''] }).pinnedZones).toEqual([
      'UTC',
      'Asia/Tokyo',
    ]);
  });

  it('maxResultUnits 限定在 1–8 之间的整数', () => {
    expect(coerce({ maxResultUnits: 1 }).maxResultUnits).toBe(1);
    expect(coerce({ maxResultUnits: 8 }).maxResultUnits).toBe(8);
    expect(coerce({ maxResultUnits: 0 }).maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
    expect(coerce({ maxResultUnits: 9 }).maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
    expect(coerce({ maxResultUnits: 2.5 }).maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
    // 表单控件回传的是字符串，必须被挡掉
    expect(coerce({ maxResultUnits: '3' }).maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
  });

  it('durationDisplayUnit 只接受 core 支持的时长单位', () => {
    expect(coerce({ durationDisplayUnit: 'hours' }).durationDisplayUnit).toBe('hours');
    expect(coerce({ durationDisplayUnit: 'fortnights' }).durationDisplayUnit).toBe(
      DEFAULT_SETTINGS.durationDisplayUnit,
    );
  });

  it('布尔字段只接受真正的布尔值，字符串 "false" 不会变成 true', () => {
    expect(coerce({ historyEnabled: false }).historyEnabled).toBe(false);
    expect(coerce({ historyEnabled: 'false' }).historyEnabled).toBe(true); // 回退到默认值 true
    expect(coerce({ toastOnCopy: false }).toastOnCopy).toBe(false);
    expect(coerce({ toastOnCopy: 0 }).toastOnCopy).toBe(DEFAULT_SETTINGS.toastOnCopy);
  });

  it('weekStart 只接受 0 或 1', () => {
    expect(coerce({ weekStart: 0 }).weekStart).toBe(0);
    expect(coerce({ weekStart: 1 }).weekStart).toBe(1);
    expect(coerce({ weekStart: 2 }).weekStart).toBe(DEFAULT_SETTINGS.weekStart);
  });

  it('时区名必须是去空格后非空的字符串', () => {
    expect(coerce({ defaultFromZone: '  ' }).defaultFromZone).toBe(DEFAULT_SETTINGS.defaultFromZone);
    expect(coerce({ defaultFromZone: 123 }).defaultFromZone).toBe(DEFAULT_SETTINGS.defaultFromZone);
    expect(coerce({ defaultFromZone: 'Europe/London' }).defaultFromZone).toBe('Europe/London');
  });

  it('保留未知字段之外的正确字段：一次脏数据不会污染整个设置', () => {
    const result = coerce({ theme: 'dark', weekend: 'bogus', epochUnit: 'ms' });
    expect(result.theme).toBe('dark');
    expect(result.epochUnit).toBe('ms');
    expect(result.weekend).toEqual(DEFAULT_SETTINGS.weekend);
  });
});

describe('loadSettings / saveSettings', () => {
  it('没有存储值时返回默认值', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('存了再读是一致的（往返不丢字段）', () => {
    const custom: Settings = {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      contrast: 'high',
      weekStart: 0,
      holidayRegion: 'JP',
      maxResultUnits: 5,
    };
    saveSettings(custom);
    __resetSettingsCache(); // 强制走一次真正的反序列化
    expect(loadSettings()).toEqual(custom);
  });

  it('写入时会先 coerce，非法值不会落盘', () => {
    saveSettings({ ...DEFAULT_SETTINGS, maxResultUnits: 99 });
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Settings;
    expect(raw.maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
  });

  it('存储里是坏 JSON 时回退到默认值而不是抛错', () => {
    localStorage.setItem(SETTINGS_KEY, '{ 这不是 JSON');
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('localStorage 抛异常（隐私模式）时仍然可用，只是不持久化', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    getSpy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    // 写失败不能让整个应用崩掉：内存缓存仍然生效
    expect(() => saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })).not.toThrow();
    expect(loadSettings().theme).toBe('dark');
    setSpy.mockRestore();
  });

  it('内存缓存保证同一会话内读到的是最后一次写入', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(loadSettings().theme).toBe('dark');
  });
});

describe('patchSettings', () => {
  it('只改指定字段，其余保留', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', epochUnit: 'ms' });
    const next = patchSettings({ theme: 'light' });
    expect(next.theme).toBe('light');
    expect(next.epochUnit).toBe('ms');
  });

  it('返回值与随后 loadSettings 的结果一致（不会出现两个真相）', () => {
    const returned = patchSettings({ weekStart: 0 });
    expect(returned).toEqual(loadSettings());
  });
});

describe('resetSettings', () => {
  it('把所有字段还原成默认值', () => {
    patchSettings({ theme: 'dark', historyEnabled: false, maxResultUnits: 7 });
    expect(resetSettings()).toEqual(DEFAULT_SETTINGS);
    __resetSettingsCache();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('subscribeSettings', () => {
  it('写入后通知订阅者，并带上新值', () => {
    const listener = vi.fn();
    subscribeSettings(listener);
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].theme).toBe('dark');
  });

  it('取消订阅后不再收到通知', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSettings(listener);
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
    unsubscribe();
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('patchSettings 也会触发通知（设置面板依赖这一点重渲染）', () => {
    const listener = vi.fn();
    subscribeSettings(listener);
    patchSettings({ contrast: 'high' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('通知里拿到的是 coerce 之后的值，不是调用方传进来的原始对象', () => {
    const listener = vi.fn();
    subscribeSettings(listener);
    saveSettings({ ...DEFAULT_SETTINGS, maxResultUnits: 99 });
    expect(listener.mock.calls[0]![0].maxResultUnits).toBe(DEFAULT_SETTINGS.maxResultUnits);
  });
});

/**
 * 与 `index.html` 里那段内联反闪烁脚本的契约测试。
 *
 * 这是整个项目最容易悄悄坏掉的地方：两边用**字符串键名**通信，
 * TypeScript 一个都检查不到。所以这里不满足于「断言键名写成什么样」，
 * 而是把 index.html 里的脚本原文抠出来真正执行一遍——改了任一边，
 * 另一个文件的行为就会当场暴露。
 */
describe('与 index.html 反闪烁脚本的契约', () => {
  // Vitest 的 root 就是 vite.config.ts 所在目录，也就是项目根
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

  /** 执行 index.html 里的那段 IIFE，模拟浏览器首帧 */
  function runBootScript(): void {
    // eslint-disable-next-line no-new-func -- 被测对象就是这段脚本文本本身
    new Function(inlineScript ?? '')();
  }

  /** 覆盖 matchMedia，模拟系统深色/浅色偏好 */
  function stubPrefersDark(prefersDark: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      }),
    });
  }

  it('能从 index.html 里抠出那段内联脚本（防止被挪进外部文件后静默失效）', () => {
    expect(inlineScript).toBeTruthy();
    expect(inlineScript).toContain('timecalc:settings');
  });

  it('settings 写出的 theme 能被反闪烁脚本读到（键名与字段名对齐）', () => {
    stubPrefersDark(false);
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });

    runBootScript();

    // saveSettings 用 'dark'，脚本直接读 s.theme —— 键名对不上就会变成 light
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('theme=system 时跟随系统偏好', () => {
    stubPrefersDark(true);
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'system' });

    runBootScript();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('contrast=high 会被脚本翻译成 data-contrast="hc"（CSS 令牌依赖这个值）', () => {
    stubPrefersDark(false);
    saveSettings({ ...DEFAULT_SETTINGS, contrast: 'high' });

    runBootScript();

    expect(document.documentElement.dataset.contrast).toBe('hc');
  });

  it('未设置过任何值时首屏不崩，并回退到跟随系统', () => {
    stubPrefersDark(false);
    expect(() => runBootScript()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('localStorage 里是坏 JSON 时脚本不抛错（隐私模式/手工改坏）', () => {
    stubPrefersDark(false);
    localStorage.setItem('timecalc:settings', '{ 坏数据');

    expect(() => runBootScript()).not.toThrow();
  });
});
