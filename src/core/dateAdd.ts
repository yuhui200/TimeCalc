/**
 * 日期加减：日期 ± N 年/月/周/日/时/分/秒。
 *
 * 全部通过 dayjs 的日历运算完成，因此：
 *   - 1/31 + 1 月 = 2/28（或闰年 2/29），不会溢出到 3 月
 *   - 跨 DST 时以「墙上时钟」为准（dayjs 默认行为）
 */
import dayjs from './dayjs';
import { humanizeDuration } from './duration';
import { formatDateWithWeekday } from './format';
import type { DateInput, Duration } from './types';

export interface DateAddResult {
  input: Date;
  output: Date;
  duration: Duration;
  sign: 1 | -1;
  /** 人类可读结果，如 '2026-09-21 周一' */
  label: string;
  /** 结果相对输入的自然日偏移 */
  dayShift: number;
  /** 星期几（0=周日） */
  weekday: number;
  /** 是否与输入同一天（仅时间被改动） */
  sameDay: boolean;
}

/** 把 Duration 施加到日期上。sign = -1 时做减法。 */
export function applyDuration(input: DateInput, duration: Duration, sign: 1 | -1 = 1): Date {
  const base = dayjs(input);
  if (!base.isValid()) throw new TypeError('applyDuration: 日期无效');

  let cursor = base;
  const order: (keyof Duration)[] = [
    'years',
    'months',
    'weeks',
    'days',
    'hours',
    'minutes',
    'seconds',
    'milliseconds',
  ];

  for (const unit of order) {
    const value = duration[unit];
    if (typeof value !== 'number' || value === 0 || !Number.isFinite(value)) continue;
    cursor = cursor.add(sign * value, unit);
  }
  return cursor.toDate();
}

/** 日期 + 时长（带完整结果对象） */
export function addDuration(input: DateInput, duration: Duration): DateAddResult | null {
  return buildResult(input, duration, 1);
}

/** 日期 - 时长 */
export function subtractDuration(input: DateInput, duration: Duration): DateAddResult | null {
  return buildResult(input, duration, -1);
}

function buildResult(input: DateInput, duration: Duration, sign: 1 | -1): DateAddResult | null {
  const base = dayjs(input);
  if (!base.isValid()) return null;
  const output = applyDuration(base.toDate(), duration, sign);
  const out = dayjs(output);
  const dayShift = out.startOf('day').diff(base.startOf('day'), 'day');

  return {
    input: base.toDate(),
    output,
    duration,
    sign,
    label: formatDateWithWeekday(output),
    dayShift,
    weekday: out.day(),
    sameDay: dayShift === 0,
  };
}

/** 简写：加 N 天 */
export function addDays(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'day').toDate();
}

export function addWeeks(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'week').toDate();
}

export function addMonths(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'month').toDate();
}

export function addYears(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'year').toDate();
}

export function addHours(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'hour').toDate();
}

export function addMinutes(input: DateInput, n: number): Date {
  return dayjs(input).add(n, 'minute').toDate();
}

/**
 * 快捷偏移预设。UI 上的大按钮直接绑定这些值。
 */
export interface QuickAddPreset {
  id: string;
  label: string;
  duration: Duration;
}

export const QUICK_ADD_PRESETS: readonly QuickAddPreset[] = [
  { id: 'd1', label: '+1 天', duration: { days: 1 } },
  { id: 'd7', label: '+7 天', duration: { days: 7 } },
  { id: 'd30', label: '+30 天', duration: { days: 30 } },
  { id: 'm1', label: '+1 月', duration: { months: 1 } },
  { id: 'm3', label: '+3 月', duration: { months: 3 } },
  { id: 'y1', label: '+1 年', duration: { years: 1 } },
  { id: 'h1', label: '+1 小时', duration: { hours: 1 } },
  { id: 'mi30', label: '+30 分钟', duration: { minutes: 30 } },
] as const;

export const QUICK_SUBTRACT_PRESETS: readonly QuickAddPreset[] = [
  { id: 'd1', label: '-1 天', duration: { days: 1 } },
  { id: 'd7', label: '-7 天', duration: { days: 7 } },
  { id: 'd30', label: '-30 天', duration: { days: 30 } },
  { id: 'm1', label: '-1 月', duration: { months: 1 } },
  { id: 'm3', label: '-3 月', duration: { months: 3 } },
  { id: 'y1', label: '-1 年', duration: { years: 1 } },
  { id: 'h1', label: '-1 小时', duration: { hours: 1 } },
  { id: 'mi30', label: '-30 分钟', duration: { minutes: 30 } },
] as const;

/**
 * 链式偏移：从一个日期出发连续施加多个时长。
 * 用于「下周五 +1 月 +3 天」这类累加输入。
 */
export function addDurationChain(input: DateInput, durations: Duration[]): Date {
  let cursor = dayjs(input);
  for (const d of durations) cursor = dayjs(applyDuration(cursor.toDate(), d, 1));
  return cursor.toDate();
}

/**
 * 把一个日期对齐到边界：'day' | 'week' | 'month' | 'quarter' | 'year'
 */
export function alignTo(
  input: DateInput,
  unit: 'day' | 'week' | 'month' | 'quarter' | 'year',
  edge: 'start' | 'end' = 'start',
): Date {
  const d = dayjs(input);
  if (!d.isValid()) throw new TypeError('alignTo: 日期无效');
  if (unit === 'quarter') {
    const q = Math.floor(d.month() / 3);
    const base = d.month(q * 3).startOf('month');
    return (edge === 'start' ? base : base.add(3, 'month').subtract(1, 'millisecond')).toDate();
  }
  const start = d.startOf(unit);
  return (edge === 'start' ? start : start.endOf(unit)).toDate();
}

/** 结果摘要，用于历史记录标题 */
export function describeAddResult(result: DateAddResult): string {
  const op = result.sign === 1 ? '+' : '-';
  return `${dayjs(result.input).format('YYYY-MM-DD HH:mm')} ${op} ${humanizeDuration(result.duration, {
    maxUnits: 3,
  })} = ${dayjs(result.output).format('YYYY-MM-DD HH:mm')}`;
}
