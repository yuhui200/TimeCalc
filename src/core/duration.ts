/**
 * 时长（Duration）的解析、归一化、折算与人类可读化。
 *
 * 设计取舍：
 *   - `Duration` 是**日历感知**的，{ months: 1 } 表示一个自然月而非 30 天。
 *     真正把它施加到某个日期上由 dateAdd.ts 负责。
 *   - 需要标量比较时用 `durationToMs()`，按平均长度折算并明确标注为近似值。
 */
import dayjs from './dayjs';
import type { Duration, DurationInput, DurationUnit } from './types';

export const ZERO_DURATION: Readonly<Required<Duration>> = Object.freeze({
  years: 0,
  months: 0,
  weeks: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  milliseconds: 0,
});

/** 单位在 Duration 中的书写顺序（也是展示顺序） */
export const DURATION_UNITS: readonly DurationUnit[] = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
  'milliseconds',
] as const;

/** 由大到小的中文单位名 */
export const UNIT_LABELS_ZH: Record<DurationUnit, string> = {
  years: '年',
  months: '个月',
  weeks: '周',
  days: '天',
  hours: '小时',
  minutes: '分钟',
  seconds: '秒',
  milliseconds: '毫秒',
};

/** 英文单位名（单数/复数） */
export const UNIT_LABELS_EN: Record<DurationUnit, [string, string]> = {
  years: ['year', 'years'],
  months: ['month', 'months'],
  weeks: ['week', 'weeks'],
  days: ['day', 'days'],
  hours: ['hour', 'hours'],
  minutes: ['minute', 'minutes'],
  seconds: ['second', 'seconds'],
  milliseconds: ['millisecond', 'milliseconds'],
};

/**
 * 平均折算系数（毫秒）。
 * 注意 months / years 是平均值：1 年 = 365.2425 天，1 月 = 1/12 年。
 * 用于"大约多久"这类标量场景，不可用于精确日期运算。
 */
export const UNIT_MS: Record<DurationUnit, number> = {
  years: 31_556_952_000, // 365.2425 天
  months: 2_629_746_000, // 365.2425 / 12 天
  weeks: 604_800_000,
  days: 86_400_000,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1_000,
  milliseconds: 1,
};

/** 中文数字单位别名 → Duration 字段名 */
export const UNIT_ALIASES: Record<string, DurationUnit> = {
  // 中文
  年: 'years',
  个月: 'months',
  月: 'months',
  周: 'weeks',
  星期: 'weeks',
  礼拜: 'weeks',
  天: 'days',
  日: 'days',
  小时: 'hours',
  钟头: 'hours',
  分钟: 'minutes',
  分: 'minutes',
  秒: 'seconds',
  秒钟: 'seconds',
  毫秒: 'milliseconds',

  // 英文（长 → 短，解析时按长度优先匹配）
  years: 'years',
  year: 'years',
  yrs: 'years',
  yr: 'years',
  y: 'years',
  months: 'months',
  month: 'months',
  mos: 'months',
  mo: 'months',
  weeks: 'weeks',
  week: 'weeks',
  wks: 'weeks',
  wk: 'weeks',
  w: 'weeks',
  days: 'days',
  day: 'days',
  d: 'days',
  hours: 'hours',
  hour: 'hours',
  hrs: 'hours',
  hr: 'hours',
  h: 'hours',
  minutes: 'minutes',
  minute: 'minutes',
  mins: 'minutes',
  min: 'minutes',
  // 注意：裸 'm' 在 "2h30m" 这类写法中表示分钟；月份请写 'mo'
  m: 'minutes',
  seconds: 'seconds',
  second: 'seconds',
  secs: 'seconds',
  sec: 'seconds',
  s: 'seconds',
  milliseconds: 'milliseconds',
  millisecond: 'milliseconds',
  ms: 'milliseconds',
};

/** 按长度降序排列的别名列表，供正则构造使用（长别名优先匹配） */
export const UNIT_ALIASES_BY_LENGTH: readonly string[] = Object.keys(UNIT_ALIASES).sort(
  (a, b) => b.length - a.length,
);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 把任意 DurationInput 归一化为所有字段均为有限数字的 Required<Duration> */
export function normalizeDuration(input: DurationInput = {}): Required<Duration> {
  if (typeof input === 'number') {
    return { ...ZERO_DURATION, milliseconds: input };
  }
  if (typeof input === 'string') {
    const parsed = parseDuration(input);
    return { ...ZERO_DURATION, ...parsed };
  }
  const out = { ...ZERO_DURATION };
  for (const unit of DURATION_UNITS) {
    const value = input[unit];
    if (isFiniteNumber(value)) out[unit] = value;
  }
  return out;
}

/**
 * 解析时长字符串。
 *
 * 支持的写法（可混合、可带空格、可为负）：
 *   '2h30m'  '2h 30m'  '1d2h'  '90m'  '-3d'
 *   '2小时30分钟'  '1年2个月3天'  '1y 2mo 3d 4h 5m 6s'
 *   'P1DT2H30M'（ISO 8601 Duration）
 *
 * 裸 'm' 解释为分钟，'mo' 解释为月（与 ISO 8601 及常见口语一致）。
 */
export function parseDuration(input: string): Duration {
  const text = input.trim();
  if (!text) return {};

  // ISO 8601: PnYnMnDTnHnMnS / PnW
  const iso = /^[+-]?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
  const isoMatch = text.match(iso);
  if (isoMatch && text.length > 2) {
    const [, y, mo, w, d, h, mi, s] = isoMatch;
    return compactDuration({
      years: num(y),
      months: num(mo),
      weeks: num(w),
      days: num(d),
      hours: num(h),
      minutes: num(mi),
      seconds: num(s),
    });
  }

  const result: Duration = {};
  // 匹配「数字 + 单位」，单位按长度优先，避免 'mo' 被 'm' 抢先匹配
  const pattern = new RegExp(
    `([+-]?\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALIASES_BY_LENGTH.map(escapeRegExp).join('|')})`,
    'gi',
  );

  let matched = false;
  for (const m of text.matchAll(pattern)) {
    const value = Number(m[1]);
    const unit = UNIT_ALIASES[m[2].toLowerCase()];
    if (!unit || !Number.isFinite(value)) continue;
    result[unit] = (result[unit] ?? 0) + value;
    matched = true;
  }

  // 纯数字：按毫秒处理过于隐晦，这里按「秒」是最常见的直觉？
  // 都不是——裸数字在自然语言里几乎总是"天数"或"分钟"的省略。
  // 为避免歧义，裸数字不解析，交给调用方处理。
  if (!matched) {
    const bare = text.match(/^[+-]?\d+(?:\.\d+)?$/);
    if (bare) return { minutes: Number(bare[0]) };
  }

  return compactDuration(result);
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 去掉值为 0 / undefined 的字段，保持对象精简 */
export function compactDuration(input: Duration): Duration {
  const out: Duration = {};
  for (const unit of DURATION_UNITS) {
    const v = input[unit];
    if (isFiniteNumber(v) && v !== 0) out[unit] = v;
  }
  return out;
}

/** 时长是否为零 */
export function isZeroDuration(input: DurationInput): boolean {
  const d = normalizeDuration(input);
  return DURATION_UNITS.every((u) => d[u] === 0);
}

/** 时长是否为负（按标量折算判断） */
export function isNegativeDuration(input: DurationInput): boolean {
  return durationToMs(input) < 0;
}

/** 时长取反 */
export function negateDuration(input: DurationInput): Duration {
  const d = normalizeDuration(input);
  const out: Duration = {};
  for (const unit of DURATION_UNITS) {
    if (d[unit] !== 0) out[unit] = -d[unit];
  }
  return out;
}

/**
 * 折算为毫秒（近似）。
 * months / years 使用平均值；如需精确结果请走 dateAdd。
 */
export function durationToMs(input: DurationInput): number {
  const d = normalizeDuration(input);
  let total = 0;
  for (const unit of DURATION_UNITS) {
    total += d[unit] * UNIT_MS[unit];
  }
  return total;
}

/** 求两个时长的和 */
export function addDurations(...inputs: DurationInput[]): Duration {
  const out: Duration = {};
  for (const input of inputs) {
    const d = normalizeDuration(input);
    for (const unit of DURATION_UNITS) {
      if (d[unit] !== 0) out[unit] = (out[unit] ?? 0) + d[unit];
    }
  }
  return compactDuration(out);
}

/** a - b */
export function subtractDurations(a: DurationInput, b: DurationInput): Duration {
  return addDurations(a, negateDuration(b));
}

/**
 * 把标量毫秒转换为日历时长。
 *
 * `maxUnit` 指定**使用的最大单位**，从它开始依次向更小单位拆解，
 * 余数一直拆到毫秒，不会因上限而丢失精度。
 *
 *   msToDuration(90_000_000)                  // 25 小时 -> { days: 1, hours: 1 }
 *   msToDuration(90_000_000, {maxUnit:'hours'}) // 全部用小时表示 -> { hours: 25 }
 *   msToDuration(3_661_000, {maxUnit:'minutes'})// -> { minutes: 61, seconds: 1 }
 *
 * 注意：切换到 years / months 时会用到平均值，属于近似结果；
 * 需要精确的日历运算请走 dateAdd。
 */
export function msToDuration(ms: number, opts: { maxUnit?: DurationUnit } = {}): Duration {
  const { maxUnit = 'days' } = opts;

  const chain: DurationUnit[] = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
  const startIndex = chain.indexOf(maxUnit);
  const usable = chain.slice(startIndex === -1 ? 0 : startIndex);

  let rest = Math.abs(ms);
  const out: Duration = {};

  for (const unit of usable) {
    const size = UNIT_MS[unit];
    const count = Math.floor(rest / size);
    if (count > 0) out[unit] = count;
    rest -= count * size;
  }
  if (rest > 0) out.milliseconds = Math.round(rest);

  const result = compactDuration(out);
  return ms < 0 ? negateDuration(result) : result;
}

/**
 * 把标量毫秒转换为「时:分:秒」式日历分量（不涉及月/年，用于时间差展示）。
 */
export function msToClockParts(ms: number): {
  sign: -1 | 0 | 1;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
} {
  const sign: -1 | 0 | 1 = ms > 0 ? 1 : ms < 0 ? -1 : 0;
  let rest = Math.abs(ms);
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1_000);
  rest -= seconds * 1_000;
  return { sign, days, hours, minutes, seconds, milliseconds: Math.round(rest) };
}

export interface HumanizeOptions {
  /** 最多输出几个非零单位，默认 3 */
  maxUnits?: number;
  /** 语言，默认 'zh' */
  locale?: 'zh' | 'en';
  /** 全零时的显示文本，默认 '0 分钟' */
  zeroText?: string;
  /** 是否显示正负号，默认 false（由调用方决定前缀） */
  showSign?: boolean;
  /** 紧凑模式：省略空格与"个"，如 "2时30分" */
  compact?: boolean;
}

/**
 * 人类可读化。
 *   humanizeDuration({ hours: 2, minutes: 30 })           -> '2 小时 30 分钟'
 *   humanizeDuration({ days: 1, hours: 2 }, {maxUnits:2}) -> '1 天 2 小时'
 *   humanizeDuration(0)                                   -> '0 分钟'
 */
export function humanizeDuration(input: DurationInput, options: HumanizeOptions = {}): string {
  const { maxUnits = 3, locale = 'zh', zeroText, showSign = false, compact = false } = options;
  const d = normalizeDuration(input);

  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    const value = d[unit];
    if (value === 0) continue;
    parts.push(formatUnitValue(value, unit, locale, compact));
    if (parts.length >= maxUnits) break;
  }

  if (parts.length === 0) {
    return zeroText ?? (locale === 'zh' ? `0 ${compact ? '分' : '分钟'}` : '0 minutes');
  }

  const sign = showSign && isNegativeDuration(d) ? '-' : '';
  const sep = compact ? '' : ' ';
  const body = parts.map((p) => p.replace(/^-/, '')).join(sep);
  return `${sign}${body}`;
}

function formatUnitValue(
  value: number,
  unit: DurationUnit,
  locale: 'zh' | 'en',
  compact: boolean,
): string {
  if (locale === 'en') {
    const [one, many] = UNIT_LABELS_EN[unit];
    return `${formatNumberish(value)} ${Math.abs(value) === 1 ? one : many}`;
  }
  const label = UNIT_LABELS_ZH[unit];
  if (compact) {
    const shortZh: Record<DurationUnit, string> = {
      years: '年',
      months: '月',
      weeks: '周',
      days: '天',
      hours: '时',
      minutes: '分',
      seconds: '秒',
      milliseconds: '毫秒',
    };
    return `${formatNumberish(value)}${shortZh[unit]}`;
  }
  // 中文里 "1 个月" 而不是 "1个月" 更易读，但 "2个月" 更自然；
  // 统一采用「数字 + 空格 + 单位」以便大字号排版对齐
  return `${formatNumberish(value)} ${label}`;
}

/** 数字格式化：最多保留 3 位小数，去掉尾随 0 */
export function formatNumberish(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

/**
 * 把日历时长（{years, months, days...}）转换为中文口语描述。
 * 例：{ days: 1, hours: 2, minutes: 30 } -> '1 天 2 小时 30 分钟'
 */
export function describeDuration(input: DurationInput, maxUnits = 3): string {
  return humanizeDuration(input, { maxUnits, locale: 'zh' });
}

/** 把日期范围（毫秒）分解为 D/H/M/S，用于倒计时 */
export function splitMs(ms: number) {
  return msToClockParts(ms);
}

/** 供 UI 做「时长 + 单位」下拉时使用 */
export function unitLabel(unit: DurationUnit, locale: 'zh' | 'en' = 'zh'): string {
  return locale === 'zh' ? UNIT_LABELS_ZH[unit] : UNIT_LABELS_EN[unit][1];
}

/** 用 dayjs 校验一个 ISO 字符串是否是合法日期 */
export function isValidDateInput(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const d = dayjs(value);
    return d.isValid();
  }
  return false;
}
