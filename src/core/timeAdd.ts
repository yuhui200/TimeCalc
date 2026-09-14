/**
 * 时间加减：对一个「时刻」（HH:mm 或完整日期时间）加上/减去若干小时、分钟。
 *
 * 两种模式：
 *   - wrap（默认）：把时间视为一天内的循环时刻，超过 24:00 自动回绕，
 *     并报告跨了几天。适合「15:30 + 9 小时 = 00:30（次日）」。
 *   - clamp：不跨越一天，仅在 00:00–23:59 内截断。适合排班表这类场景。
 */
import dayjs from './dayjs';
import { humanizeDuration } from './duration';
import { DATE_FMT, TIME_FMT, clockToMinutes, formatDateWithWeekday, minutesToClock } from './format';
import type { DateInput, Duration } from './types';

export type TimeAddMode = 'wrap' | 'clamp';

export interface TimeAddResult {
  /** 输入时刻（分钟，从零点起） */
  startMinutes: number;
  /** 结果时刻（分钟，可能 >= 1440 表示跨天） */
  rawMinutes: number;
  /** 归一化到 [0, 1440) 的分钟数 */
  normalizedMinutes: number;
  /** 'HH:mm' */
  clock: string;
  /** 跨过的天数，负数表示往前跨 */
  dayOffset: number;
  /** 若输入包含日期，这里给出结果日期 */
  date: Date | null;
  dateLabel: string | null;
  /** 时长的人类可读描述 */
  human: string;
  mode: TimeAddMode;
}

const MINUTES_PER_DAY = 1440;

function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/**
 * 解析时刻字符串。支持：
 *   '15:30'  '15:30:45'  '9:05'
 *   '2026-09-14 15:30'  '2026-09-14T15:30'
 *   Date 对象
 * 返回分钟数与可选的日期部分。
 */
export function parseClock(input: string | Date): { minutes: number; date: Date | null } | null {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return { minutes: input.getHours() * 60 + input.getMinutes(), date: input };
  }
  const text = input.trim();
  if (!text) return null;

  // 纯时刻（小时必须在 0–23；'25:00' 这类跨天写法在此不合法）
  const strict = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (strict) {
    const hours = Number(strict[1]);
    if (hours <= 23) {
      return {
        minutes: hours * 60 + Number(strict[2]) + (strict[3] ? Number(strict[3]) / 60 : 0),
        date: null,
      };
    }
    return null;
  }

  // 含日期
  const m = text.match(/(\d{1,3}):([0-5]\d)(?::([0-5]\d))?/);
  if (!m) return null;
  const d = dayjs(text);
  if (!d.isValid()) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
  return { minutes: Math.round(minutes), date: d.toDate() };
}

export interface TimeAddOptions {
  mode?: TimeAddMode;
  /** 时长中只有 hours / minutes / seconds 会被使用 */
  duration: Duration;
}

/**
 * 时刻 + 时长。
 *
 *   addToTime('15:30', { hours: 2, minutes: 30 })
 *     -> clock '18:00', dayOffset 0
 *   addToTime('22:00', { hours: 3 })
 *     -> clock '01:00', dayOffset 1
 *   addToTime('2026-09-14 15:30', { hours: 9 })
 *     -> clock '00:30', date 2026-09-15
 */
export function addToTime(input: string | Date, options: TimeAddOptions): TimeAddResult | null {
  const parsed = parseClock(input);
  if (!parsed) return null;

  const { duration, mode = 'wrap' } = options;
  const deltaMinutes =
    (duration.days ?? 0) * MINUTES_PER_DAY +
    (duration.hours ?? 0) * 60 +
    (duration.minutes ?? 0) +
    (duration.seconds ?? 0) / 60 +
    (duration.milliseconds ?? 0) / 60_000;

  // 保留小数分钟（秒级精度），展示时再取整
  const rawExact = parsed.minutes + deltaMinutes;
  const rawMinutes = Math.round(rawExact);
  const dayOffset = Math.floor(rawExact / MINUTES_PER_DAY);

  let normalized = mod(rawExact, MINUTES_PER_DAY);
  if (mode === 'clamp') {
    normalized = Math.min(Math.max(rawExact, 0), MINUTES_PER_DAY - 1);
  }
  const normalizedMinutes = Math.round(normalized);
  const clock = minutesToClock(normalizedMinutes);

  let date: Date | null = null;
  let dateLabel: string | null = null;
  if (parsed.date) {
    // 用 dayjs 做真实日期运算，跨越 DST 时以墙上时钟为准
    const base = dayjs(parsed.date);
    const moved = base.add(deltaMinutes, 'minute');
    date = moved.toDate();
    dateLabel = formatDateWithWeekday(date);
  } else if (mode === 'wrap' && dayOffset !== 0) {
    const d = dayjs().startOf('day').add(dayOffset, 'day');
    date = d.toDate();
    dateLabel = `${formatDateWithWeekday(date)}（相对今天）`;
  }

  return {
    startMinutes: parsed.minutes,
    rawMinutes,
    normalizedMinutes,
    clock,
    dayOffset,
    date,
    dateLabel,
    human: humanizeDuration(duration, { maxUnits: 3 }),
    mode,
  };
}

/** 时刻 - 时长 */
export function subtractFromTime(input: string | Date, duration: Duration, mode: TimeAddMode = 'wrap') {
  const negated: Duration = {};
  for (const [k, v] of Object.entries(duration) as [keyof Duration, number][]) {
    if (typeof v === 'number' && v !== 0) negated[k] = -v;
  }
  return addToTime(input, { duration: negated, mode });
}

/**
 * 在若干时长上依次叠加（链式快捷按钮用）。
 *   addToTimeChain('09:00', [{hours:1},{hours:7}]) -> '17:00'
 */
export function addToTimeChain(
  input: string | Date,
  durations: Duration[],
  mode: TimeAddMode = 'wrap',
): TimeAddResult | null {
  let cursor: string | Date = input;
  let last: TimeAddResult | null = null;
  for (const duration of durations) {
    last = addToTime(cursor, { duration, mode });
    if (!last) return null;
    cursor = last.date ?? last.clock;
  }
  return last;
}

/** 一天内的时刻列表生成（用于排班预览） */
export function timeRange(
  start: string,
  end: string,
  stepMinutes = 30,
  mode: TimeAddMode = 'wrap',
): string[] {
  const s = parseClock(start);
  const e = parseClock(end);
  if (!s || !e) return [];
  if (stepMinutes <= 0) return [];

  let span = e.minutes - s.minutes;
  if (span <= 0 && mode === 'wrap') span += MINUTES_PER_DAY;

  const out: string[] = [];
  for (let m = 0; m <= span; m += stepMinutes) {
    out.push(minutesToClock(mod(s.minutes + m, MINUTES_PER_DAY)));
  }
  return out;
}

export { DATE_FMT, TIME_FMT };
