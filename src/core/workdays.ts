/**
 * 工作日计算：判断、计数、加减。
 *
 * 术语：
 *   - 周末：默认周六 + 周日（0=周日 … 6=周六），可按地区配置（如中东为周五+周六）
 *   - 节假日：放假日，从工作日中扣除
 *   - 调休上班日：原本是周末但需要上班的日期，加回工作日
 *
 * 「含首尾」语义：countWorkdays 默认把 start 与 end 当天都算作候选。
 * 例：周一 → 周五 = 5 个工作日（而不是 4 个）。绝大多数用户提问
 * 「A 到 B 有多少个工作日」时期望的就是这个含义。
 */
import dayjs from './dayjs';
import { DATE_FMT } from './format';
import type { DateInput, HolidayEntry } from './types';

/** 默认周末：周六 + 周日 */
export const DEFAULT_WEEKEND: readonly number[] = [0, 6];

export interface WorkdayOptions {
  /** 周末对应的星期索引，0=周日。默认 [0, 6] */
  weekendDays?: readonly number[];
  /** 放假日集合，'YYYY-MM-DD' */
  holidays?: Iterable<string>;
  /** 调休上班日集合，'YYYY-MM-DD' */
  extraWorkdays?: Iterable<string>;
  /** 是否把起始日计入，默认 true */
  inclusiveStart?: boolean;
  /** 是否把结束日计入，默认 true */
  inclusiveEnd?: boolean;
}

/** 迭代上限：约 200 年，防止误传超大区间导致卡死 */
const MAX_ITER_DAYS = 73_050;

export function dayKey(input: DateInput): string {
  return dayjs(input).format(DATE_FMT);
}

export function toKeySet(source?: Iterable<string>): Set<string> {
  if (!source) return new Set();
  return source instanceof Set ? source : new Set(source);
}

/** 把 HolidayEntry[] 拆成假日 / 补班两个集合 */
export function splitHolidayEntries(entries: readonly HolidayEntry[]): {
  holidays: Set<string>;
  extraWorkdays: Set<string>;
} {
  const holidays = new Set<string>();
  const extraWorkdays = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'holiday') holidays.add(e.date);
    else extraWorkdays.add(e.date);
  }
  return { holidays, extraWorkdays };
}

export function isWeekend(input: DateInput, weekendDays: readonly number[] = DEFAULT_WEEKEND): boolean {
  const d = dayjs(input);
  return d.isValid() && weekendDays.includes(d.day());
}

/**
 * 是否为工作日。判断顺序：调休上班日 > 周末 > 节假日。
 * 这样「周末但调休上班」会被正确判为工作日。
 */
export function isWorkday(input: DateInput, options: WorkdayOptions = {}): boolean {
  const d = dayjs(input);
  if (!d.isValid()) return false;

  const weekendDays = options.weekendDays ?? DEFAULT_WEEKEND;
  const key = d.format(DATE_FMT);

  if (toKeySet(options.extraWorkdays).has(key)) return true;
  if (weekendDays.includes(d.day())) return false;
  if (toKeySet(options.holidays).has(key)) return false;
  return true;
}

function prepareRange(
  start: DateInput,
  end: DateInput,
  options: WorkdayOptions,
): { from: dayjs.Dayjs; to: dayjs.Dayjs; reversed: boolean; weekendDays: readonly number[]; holidays: Set<string>; extra: Set<string> } | null {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return null;

  const reversed = b.isBefore(a);
  const from = (reversed ? b : a).startOf('day');
  const to = (reversed ? a : b).startOf('day');

  return {
    from,
    to,
    reversed,
    weekendDays: options.weekendDays ?? DEFAULT_WEEKEND,
    holidays: toKeySet(options.holidays),
    extra: toKeySet(options.extraWorkdays),
  };
}

/**
 * 统计区间内的工作日数量。
 *   countWorkdays('2026-01-01', '2026-09-14')
 */
export function countWorkdays(start: DateInput, end: DateInput, options: WorkdayOptions = {}): number {
  const range = prepareRange(start, end, options);
  if (!range) return 0;

  const { from, to, weekendDays, holidays, extra } = range;
  const { inclusiveStart = true, inclusiveEnd = true } = options;

  const totalDays = to.diff(from, 'day');
  if (totalDays > MAX_ITER_DAYS) {
    throw new RangeError(`工作日统计区间过大（${totalDays} 天），请缩小到 200 年以内`);
  }

  let count = 0;
  let cursor = from.clone();
  for (let i = 0; i <= totalDays; i++) {
    const isFirst = i === 0;
    const isLast = i === totalDays;
    const include = (!isFirst || inclusiveStart) && (!isLast || inclusiveEnd);

    if (include) {
      const key = cursor.format(DATE_FMT);
      if (extra.has(key)) count++;
      else if (!weekendDays.includes(cursor.day()) && !holidays.has(key)) count++;
    }
    cursor = cursor.add(1, 'day');
  }
  return count;
}

/** 统计周末天数（含首尾，调休上班日仍计为周末） */
export function countWeekendDays(start: DateInput, end: DateInput, options: WorkdayOptions = {}): number {
  const range = prepareRange(start, end, options);
  if (!range) return 0;
  const { from, to, weekendDays } = range;
  const totalDays = to.diff(from, 'day');
  if (totalDays > MAX_ITER_DAYS) return 0;

  let count = 0;
  let cursor = from.clone();
  for (let i = 0; i <= totalDays; i++) {
    if (weekendDays.includes(cursor.day())) count++;
    cursor = cursor.add(1, 'day');
  }
  return count;
}

/** 命中的节假日天数（仅统计放假日，不含周末） */
export function countHolidays(start: DateInput, end: DateInput, options: WorkdayOptions = {}): number {
  const range = prepareRange(start, end, options);
  if (!range) return 0;
  const { from, to, holidays, weekendDays } = range;
  const totalDays = to.diff(from, 'day');
  if (totalDays > MAX_ITER_DAYS) return 0;

  let count = 0;
  let cursor = from.clone();
  for (let i = 0; i <= totalDays; i++) {
    const key = cursor.format(DATE_FMT);
    if (holidays.has(key) && !weekendDays.includes(cursor.day())) count++;
    cursor = cursor.add(1, 'day');
  }
  return count;
}

/**
 * 日期 + N 个工作日。
 *   addWorkdays('2026-09-14', 5)   -> 往后 5 个工作日
 *   addWorkdays('2026-09-14', -3)  -> 往前 3 个工作日
 * n = 0 时返回最近的一个工作日（若当日不是工作日则顺延到下一个）。
 */
export function addWorkdays(start: DateInput, n: number, options: WorkdayOptions = {}): Date {
  const d = dayjs(start);
  if (!d.isValid()) throw new TypeError('addWorkdays: 起始日期无效');
  if (!Number.isFinite(n)) throw new TypeError('addWorkdays: 天数必须是有限数字');

  const weekendDays = options.weekendDays ?? DEFAULT_WEEKEND;
  const holidays = toKeySet(options.holidays);
  const extra = toKeySet(options.extraWorkdays);

  const check = (day: dayjs.Dayjs): boolean => {
    const key = day.format(DATE_FMT);
    if (extra.has(key)) return true;
    if (weekendDays.includes(day.day())) return false;
    return !holidays.has(key);
  };

  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(n));
  let cursor = d.startOf('day');

  if (remaining === 0) {
    // 就近顺延到工作日
    while (!check(cursor)) cursor = cursor.add(step, 'day');
    return cursor.toDate();
  }

  let guard = 0;
  while (remaining > 0) {
    cursor = cursor.add(step, 'day');
    if (check(cursor)) remaining--;
    if (++guard > MAX_ITER_DAYS) throw new RangeError('addWorkdays: 迭代次数超限，请检查节假日配置');
  }
  return cursor.toDate();
}

/** 下一个工作日（严格向后，不含当天） */
export function nextWorkday(start: DateInput, options: WorkdayOptions = {}): Date {
  return addWorkdays(start, 1, options);
}

/** 上一个工作日（严格向前，不含当天） */
export function previousWorkday(start: DateInput, options: WorkdayOptions = {}): Date {
  return addWorkdays(start, -1, options);
}

/** 列出区间内所有工作日，可选上限保护 */
export function listWorkdays(
  start: DateInput,
  end: DateInput,
  options: WorkdayOptions & { limit?: number } = {},
): Date[] {
  const range = prepareRange(start, end, options);
  if (!range) return [];
  const { from, to, weekendDays, holidays, extra } = range;
  const { limit = 1000 } = options;

  const out: Date[] = [];
  const totalDays = to.diff(from, 'day');
  const cursor = from.clone();
  for (let i = 0; i <= totalDays && out.length < limit; i++) {
    const day = cursor.add(i, 'day');
    const key = day.format(DATE_FMT);
    if (extra.has(key) || (!weekendDays.includes(day.day()) && !holidays.has(key))) {
      out.push(day.toDate());
    }
  }
  return out;
}

/** 区间的自然日总数（含首尾） */
export function countCalendarDays(start: DateInput, end: DateInput): number {
  const a = dayjs(start).startOf('day');
  const b = dayjs(end).startOf('day');
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.abs(b.diff(a, 'day')) + 1;
}
