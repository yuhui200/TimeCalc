/**
 * 应用设置。
 *
 * **为什么不用 IndexedDB**：主题必须在首屏绘制前决定，否则会白屏闪一下
 * （FOUC）。IndexedDB 是异步 API，等它 resolve 时页面早就画完了。
 * localStorage 是同步的，`index.html` 里的内联脚本也能直接读到同一份数据。
 *
 * 因此约定：
 *   - 存储键名统一加 `timecalc:` 前缀，避免同域下与其它应用冲突；
 *   - `index.html` 的反闪烁脚本只读 `timecalc:settings` 这一条，
 *     字段名改动必须同步改那边（有测试守着，见 settings.test.ts）。
 *
 * localStorage 在隐私模式下可能直接抛异常，所有读写都必须 try/catch。
 */
import type { DurationUnit } from '../core/types';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ContrastMode = 'normal' | 'high';
export type HolidayRegion = 'CN' | 'US' | 'UK' | 'JP' | 'NONE';

export interface Settings {
  /** 主题；'system' 跟随系统 */
  theme: ThemeMode;
  /** 高对比度模式，为低视力用户提供更硬的边界与更高的前景/背景比 */
  contrast: ContrastMode;
  /** 一周从周几开始：0=周日，1=周一 */
  weekStart: 0 | 1;
  /** 周末定义，默认 [0, 6]（周六日）；可改成 [5, 6] 适配中东等地区 */
  weekend: number[];
  /** 节假日地区 */
  holidayRegion: HolidayRegion;
  /** 时区面板的默认源/目标时区 */
  defaultFromZone: string;
  defaultToZone: string;
  /** 时区面板里常驻显示的时区列表 */
  pinnedZones: string[];
  /** 结果里最多显示几个时长单位 */
  maxResultUnits: number;
  /** 是否记录历史 */
  historyEnabled: boolean;
  /** 是否启用全局快捷键（仅桌面端有效） */
  globalShortcutEnabled: boolean;
  /** 全局快捷键的加速键字符串 */
  globalShortcutAccelerator: string;
  /** 时间戳默认按秒还是毫秒解读 */
  epochUnit: 's' | 'ms';
  /** 自然语言解析里优先展示结果的单位 */
  durationDisplayUnit: DurationUnit;
  /** 复制结果后是否弹 toast */
  toastOnCopy: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  contrast: 'normal',
  weekStart: 1,
  weekend: [0, 6],
  holidayRegion: 'CN',
  defaultFromZone: 'Asia/Shanghai',
  defaultToZone: 'America/New_York',
  pinnedZones: ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'],
  maxResultUnits: 3,
  historyEnabled: true,
  globalShortcutEnabled: false,
  globalShortcutAccelerator: 'CommandOrControl+Shift+T',
  epochUnit: 's',
  durationDisplayUnit: 'days',
  toastOnCopy: true,
};

const SETTINGS_KEY = 'timecalc:settings';

/** 设置变更的订阅者 */
type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

/** 内存缓存：避免每次读取都 JSON.parse */
let cache: Settings | null = null;

function storage(): Storage | null {
  try {
    // 访问 localStorage 本身就可能抛（Safari 隐私模式 / 禁用 Cookie）
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 读取全部设置。
 * 合并顺序：默认值 → 存储值 → 逐字段类型校验。
 * 逐字段校验是必要的：旧版本写入的值可能类型已经变了，
 * 直接展开会让 `weekend: "0,6"` 这种脏数据流进计算逻辑。
 */
export function loadSettings(): Settings {
  if (cache) return cache;

  const store = storage();
  if (!store) {
    cache = { ...DEFAULT_SETTINGS };
    return cache;
  }

  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) {
      cache = { ...DEFAULT_SETTINGS };
      return cache;
    }
    cache = coerce(JSON.parse(raw));
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

/** 把任意来源的对象校验成合法 Settings，非法字段回退到默认值 */
export function coerce(input: unknown): Settings {
  const raw = (input ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const out: Settings = { ...DEFAULT_SETTINGS };

  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') {
    out.theme = raw.theme;
  }
  if (raw.contrast === 'normal' || raw.contrast === 'high') {
    out.contrast = raw.contrast;
  }
  if (raw.weekStart === 0 || raw.weekStart === 1) out.weekStart = raw.weekStart;

  if (Array.isArray(raw.weekend)) {
    const days = raw.weekend.filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    );
    // 空数组是合法的（全年无休场景），但只保留去重后的结果
    out.weekend = [...new Set(days)].sort((a, b) => a - b);
  }

  if (
    raw.holidayRegion === 'CN' ||
    raw.holidayRegion === 'US' ||
    raw.holidayRegion === 'UK' ||
    raw.holidayRegion === 'JP' ||
    raw.holidayRegion === 'NONE'
  ) {
    out.holidayRegion = raw.holidayRegion;
  }

  if (isNonEmptyString(raw.defaultFromZone)) out.defaultFromZone = raw.defaultFromZone;
  if (isNonEmptyString(raw.defaultToZone)) out.defaultToZone = raw.defaultToZone;

  if (Array.isArray(raw.pinnedZones)) {
    const zones = raw.pinnedZones.filter(isNonEmptyString);
    // 至少留一个，否则时区面板会空掉
    if (zones.length > 0) out.pinnedZones = [...new Set(zones)];
  }

  if (isInt(raw.maxResultUnits, 1, 8)) out.maxResultUnits = raw.maxResultUnits;
  if (typeof raw.historyEnabled === 'boolean') out.historyEnabled = raw.historyEnabled;
  if (typeof raw.globalShortcutEnabled === 'boolean') {
    out.globalShortcutEnabled = raw.globalShortcutEnabled;
  }
  if (isNonEmptyString(raw.globalShortcutAccelerator)) {
    out.globalShortcutAccelerator = raw.globalShortcutAccelerator;
  }
  if (raw.epochUnit === 's' || raw.epochUnit === 'ms') out.epochUnit = raw.epochUnit;
  if (isDurationUnit(raw.durationDisplayUnit)) out.durationDisplayUnit = raw.durationDisplayUnit;
  if (typeof raw.toastOnCopy === 'boolean') out.toastOnCopy = raw.toastOnCopy;

  return out;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const DURATION_UNITS: DurationUnit[] = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
  'milliseconds',
];

function isDurationUnit(value: unknown): value is DurationUnit {
  return typeof value === 'string' && (DURATION_UNITS as string[]).includes(value);
}

/** 写入全部设置（覆盖），并通知订阅者 */
export function saveSettings(next: Settings): void {
  const coerced = coerce(next);
  cache = coerced;
  const store = storage();
  if (store) {
    try {
      store.setItem(SETTINGS_KEY, JSON.stringify(coerced));
    } catch {
      // 配额满或隐私模式：内存缓存仍然生效，本次会话内设置可用
    }
  }
  for (const listener of listeners) listener(coerced);
}

/** 局部更新 */
export function patchSettings(patch: Partial<Settings>): Settings {
  const next = coerce({ ...loadSettings(), ...patch });
  saveSettings(next);
  return next;
}

/** 重置为默认值 */
export function resetSettings(): Settings {
  saveSettings({ ...DEFAULT_SETTINGS });
  return loadSettings();
}

/** 订阅设置变化，返回取消订阅函数 */
export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 供测试清理内存缓存与存储 */
export function __resetSettingsCache(): void {
  cache = null;
  listeners.clear();
}
