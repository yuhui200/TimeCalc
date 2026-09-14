/**
 * Unix 时间戳互转。
 *
 * 支持自动识别秒 / 毫秒 / 微秒 / 纳秒，也能显式指定单位。
 * 判定阈值参考常见时间戳范围：
 *   |v| < 1e11        -> 秒     （1e11 秒 ≈ 公元 5138 年）
 *   |v| < 1e14        -> 毫秒
 *   |v| < 1e17        -> 微秒
 *   否则              -> 纳秒
 */
import dayjs from './dayjs';
import { DATETIME_SEC_FMT } from './format';
import type { DateInput } from './types';

export type EpochUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds' | 'auto';

export interface UnixConversion {
  /** 原始输入数字 */
  value: number;
  /** 实际使用的单位 */
  unit: Exclude<EpochUnit, 'auto'>;
  epochMs: number;
  date: Date;
  /** 'YYYY-MM-DD HH:mm:ss'（本地时区） */
  local: string;
  /** 'YYYY-MM-DD HH:mm:ssZ'（UTC） */
  utc: string;
  /** 秒级时间戳（可能为小数） */
  seconds: number;
  /** 毫秒级时间戳 */
  milliseconds: number;
  /** ISO 8601 */
  iso: string;
  /** 相对现在的描述，如 '3 天前' */
  relative: string;
}

const ABS = Math.abs;

export function detectEpochUnit(value: number): Exclude<EpochUnit, 'auto'> {
  const abs = ABS(value);
  if (abs < 1e11) return 'seconds';
  if (abs < 1e14) return 'milliseconds';
  if (abs < 1e17) return 'microseconds';
  return 'nanoseconds';
}

const UNIT_DIVISOR: Record<Exclude<EpochUnit, 'auto'>, number> = {
  seconds: 1,
  milliseconds: 1e3,
  microseconds: 1e6,
  nanoseconds: 1e9,
};

/** 时间戳数字 -> 绝对毫秒 */
export function epochToMs(value: number, unit: EpochUnit = 'auto'): number {
  const resolved = unit === 'auto' ? detectEpochUnit(value) : unit;
  return value * (1000 / UNIT_DIVISOR[resolved]);
}

/** 任意时间 -> 时间戳数字 */
export function toEpoch(input: DateInput, unit: Exclude<EpochUnit, 'auto'> = 'seconds'): number {
  const ms = dayjs(input).valueOf();
  return ms / (1000 / UNIT_DIVISOR[unit]);
}

/** 自动判断当前时刻适合展示哪种单位（默认秒） */
export function nowEpoch(unit: Exclude<EpochUnit, 'auto'> = 'seconds'): number {
  return toEpoch(new Date(), unit);
}

/**
 * 完整的时间戳解析结果，供 UI 直接渲染。
 * 传入非法值返回 null，由调用方展示空状态。
 */
export function convertEpoch(value: number, unit: EpochUnit = 'auto'): UnixConversion | null {
  if (!Number.isFinite(value)) return null;
  const resolved = unit === 'auto' ? detectEpochUnit(value) : unit;
  const epochMs = epochToMs(value, resolved);
  const d = dayjs(epochMs);
  if (!d.isValid()) return null;

  const now = Date.now();
  const diffMs = epochMs - now;
  const absDiff = ABS(diffMs);
  let relative: string;
  if (absDiff < 45_000) relative = '刚刚';
  else if (absDiff < 3_600_000) relative = `${Math.round(absDiff / 60_000)} 分钟${diffMs > 0 ? '后' : '前'}`;
  else if (absDiff < 86_400_000) relative = `${Math.round(absDiff / 3_600_000)} 小时${diffMs > 0 ? '后' : '前'}`;
  else if (absDiff < 2_592_000_000) relative = `${Math.round(absDiff / 86_400_000)} 天${diffMs > 0 ? '后' : '前'}`;
  else relative = `${(absDiff / 31_536_000_000).toFixed(1)} 年${diffMs > 0 ? '后' : '前'}`;

  return {
    value,
    unit: resolved,
    epochMs,
    date: d.toDate(),
    local: d.format(DATETIME_SEC_FMT),
    utc: d.utc().format(`${DATETIME_SEC_FMT}[Z]`),
    seconds: epochMs / 1000,
    milliseconds: epochMs,
    iso: d.toISOString(),
    relative,
  };
}

/** 反向：日期字符串 / Date -> 时间戳数组（三种单位一次给全） */
export function dateToEpochs(input: DateInput): {
  seconds: number;
  milliseconds: number;
  microseconds: number;
  nanoseconds: number;
} | null {
  const d = dayjs(input);
  if (!d.isValid()) return null;
  const ms = d.valueOf();
  return {
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
    microseconds: ms * 1000,
    nanoseconds: ms * 1e6,
  };
}

/**
 * 常见时间戳写法的宽松解析：允许前后空格、允许 '1700000000' 或 '1,700,000,000'。
 * 也接受 'now' / '现在' 这样的关键字。
 */
export function parseEpochInput(raw: string): { value: number; unit: EpochUnit } | null {
  const text = raw.trim().replace(/[,\s_]/g, '');
  if (!text) return null;
  if (/^(now|现在|当前)$/i.test(text)) {
    return { value: Date.now(), unit: 'milliseconds' };
  }
  const m = text.match(/^([+-]?\d+(?:\.\d+)?)(ms|s|us|ns)?$/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = m[2]?.toLowerCase();
  const unit: EpochUnit =
    suffix === 'ms' ? 'milliseconds'
    : suffix === 's' ? 'seconds'
    : suffix === 'us' ? 'microseconds'
    : suffix === 'ns' ? 'nanoseconds'
    : 'auto';
  return { value, unit };
}

export const EPOCH_UNIT_LABELS: Record<Exclude<EpochUnit, 'auto'>, string> = {
  seconds: '秒',
  milliseconds: '毫秒',
  microseconds: '微秒',
  nanoseconds: '纳秒',
};
