/**
 * 日期差：两个日期之间相差多少天 / 周 / 月 / 年 / 工作日。
 *
 * 关键语义区分（很多时间计算器在这里含糊，TimeCalc 明确区分）：
 *   total.days     —— 精确的 24 小时天数（含小数），2026-01-01 00:00 → 01-02 12:00 = 1.5
 *   calendarDays   —— 按自然日计，含首尾两端，同上例 = 2
 *   spanDays       —— 首尾端点之间的天数，不含端点，同上例 = 1
 *   workdays       —— 自然日范围内的工作日，含首尾，自动排除周末与节假日
 */
import dayjs from './dayjs';
import { countHolidays, countWeekendDays, countWorkdays, type WorkdayOptions } from './workdays';
import type { DateDiffResult, DateInput } from './types';

export interface DateDiffOptions extends WorkdayOptions {
  /** 计算工作日时使用的参照年份（用于加载节假日），不传则按区间自动推断 */
  holidayYears?: number[];
}

/**
 * 计算两个日期的完整差异。
 * 传入顺序不影响结果大小，方向由 `sign` 表示。
 */
export function diffDates(
  startInput: DateInput,
  endInput: DateInput,
  options: DateDiffOptions = {},
): DateDiffResult | null {
  const start = dayjs(startInput);
  const end = dayjs(endInput);
  if (!start.isValid() || !end.isValid()) return null;

  const sign: -1 | 0 | 1 =
    end.valueOf() > start.valueOf() ? 1 : end.valueOf() < start.valueOf() ? -1 : 0;

  // 日历分解始终按时间较早 → 较晚的方向计算，再统一带符号输出
  const from = sign < 0 ? end : start;
  const to = sign < 0 ? start : end;

  const calendar = calendarBreakdown(from, to);
  const rawMs = Math.abs(to.diff(from, 'millisecond'));

  const totalDaysExact = rawMs / 86_400_000;
  const calendarDays = Math.abs(to.startOf('day').diff(from.startOf('day'), 'day')) + 1;
  const spanDays = Math.abs(to.startOf('day').diff(from.startOf('day'), 'day'));

  const workdayOptions: WorkdayOptions = {
    weekendDays: options.weekendDays,
    holidays: options.holidays,
    extraWorkdays: options.extraWorkdays,
    inclusiveStart: true,
    inclusiveEnd: true,
  };

  return {
    start: start.toDate(),
    end: end.toDate(),
    sign,
    calendar: {
      years: sign * calendar.years,
      months: sign * calendar.months,
      days: sign * calendar.days,
      hours: sign * calendar.hours,
      minutes: sign * calendar.minutes,
      seconds: sign * calendar.seconds,
    },
    total: {
      years: sign * (totalDaysExact / 365.2425),
      months: sign * (totalDaysExact / 30.436875),
      weeks: sign * (totalDaysExact / 7),
      days: sign * totalDaysExact,
      hours: sign * (rawMs / 3_600_000),
      minutes: sign * (rawMs / 60_000),
      seconds: sign * (rawMs / 1000),
      milliseconds: sign * rawMs,
    },
    calendarDays,
    spanDays,
    workdays: sign * countWorkdays(from, to, workdayOptions),
    weekendDays: countWeekendDays(from, to, workdayOptions),
    holidays: countHolidays(from, to, workdayOptions),
  };
}

/** 把 from → to 分解为 年 / 月 / 天 / 时 / 分 / 秒，全部为非负数 */
function calendarBreakdown(
  from: dayjs.Dayjs,
  to: dayjs.Dayjs,
): { years: number; months: number; days: number; hours: number; minutes: number; seconds: number } {
  let cursor = from;

  const years = to.diff(cursor, 'year');
  cursor = cursor.add(years, 'year');

  const months = to.diff(cursor, 'month');
  cursor = cursor.add(months, 'month');

  const days = to.diff(cursor, 'day');
  cursor = cursor.add(days, 'day');

  const restMs = to.diff(cursor, 'millisecond');
  const hours = Math.floor(restMs / 3_600_000);
  const minutes = Math.floor((restMs % 3_600_000) / 60_000);
  const seconds = Math.floor((restMs % 60_000) / 1000);

  return { years, months, days, hours, minutes, seconds };
}

/**
 * 只要天数（含小数），最常用的快捷函数。
 *   diffInDays('2026-01-01', '2026-09-14') -> 256.xx
 */
export function diffInDays(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'day', true);
}

/** 整日差（截断），'相差几天' 的常用口语含义 */
export function diffInWholeDays(start: DateInput, end: DateInput): number {
  const a = dayjs(start).startOf('day');
  const b = dayjs(end).startOf('day');
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'day');
}

export function diffInWeeks(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'week', true);
}

export function diffInMonths(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'month', true);
}

export function diffInYears(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'year', true);
}

export function diffInHours(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'hour', true);
}

export function diffInMinutes(start: DateInput, end: DateInput): number {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return NaN;
  return b.diff(a, 'minute', true);
}

/**
 * 年龄 / 周年计算。返回「x 岁 y 个月 z 天」。
 */
export function calculateAge(birthday: DateInput, at: DateInput = new Date()) {
  const birth = dayjs(birthday);
  const now = dayjs(at);
  if (!birth.isValid() || !now.isValid() || now.isBefore(birth)) return null;

  const years = now.diff(birth, 'year');
  const afterYears = birth.add(years, 'year');
  const months = now.diff(afterYears, 'month');
  const afterMonths = afterYears.add(months, 'month');
  const days = now.diff(afterMonths, 'day');

  const nextBirthday = birth.add(
    now.isBefore(birth.add(years, 'year').date(birth.date()).month(birth.month())) ? years : years + 1,
    'year',
  );

  return {
    years,
    months,
    days,
    totalDays: now.diff(birth, 'day'),
    nextBirthday: nextBirthday.toDate(),
    daysToNextBirthday: nextBirthday.startOf('day').diff(now.startOf('day'), 'day'),
  };
}

/**
 * 区间内的「第几天」——项目进度、学期周次等场景。
 */
export function dayOfRange(current: DateInput, start: DateInput, end: DateInput) {
  const c = dayjs(current).startOf('day');
  const s = dayjs(start).startOf('day');
  const e = dayjs(end).startOf('day');
  if (!c.isValid() || !s.isValid() || !e.isValid()) return null;

  const total = e.diff(s, 'day') + 1;
  const index = c.diff(s, 'day') + 1;
  return {
    index,
    total,
    percent: Math.min(100, Math.max(0, (index / total) * 100)),
    remaining: total - index,
  };
}
