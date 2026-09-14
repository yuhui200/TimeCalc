/**
 * 时间差：两个时刻之间相差几小时几分钟。
 *
 * 与 dateDiff 的分工：
 *   - timeDiff 面向"时刻"（HH:mm），关心的是钟表上的跨度与是否跨夜
 *   - dateDiff 面向"日期"，关心的是日历日 / 工作日 / 自然月
 */
import dayjs from './dayjs';
import { humanizeDuration } from './duration';
import { clockToMinutes, minutesToClock } from './format';
import type { TimeDiffResult } from './types';

const MINUTES_PER_DAY = 1440;

export interface TimeDiffOptions {
  /**
   * 结束时刻早于开始时刻时的处理：
   *   'overnight'（默认）—— 视为次日，加上 24 小时
   *   'signed'          —— 保留负数
   */
  whenReversed?: 'overnight' | 'signed';
  /** 是否把秒计入精度（输入 'HH:mm:ss' 时） */
  withSeconds?: boolean;
}

/**
 * 计算两个时刻的差。
 *
 *   diffTimes('09:00', '17:30')  -> 8 小时 30 分钟
 *   diffTimes('22:00', '01:30')  -> 3 小时 30 分钟（跨夜）
 *   diffTimes('17:30', '09:00')  -> 按 overnight 规则 = 15 小时 30 分钟
 */
export function diffTimes(
  start: string,
  end: string,
  options: TimeDiffOptions = {},
): TimeDiffResult | null {
  const { whenReversed = 'overnight' } = options;

  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;

  let diff = endMinutes - startMinutes;
  let overnight = false;

  if (diff < 0) {
    if (whenReversed === 'overnight') {
      diff += MINUTES_PER_DAY;
      overnight = true;
    }
  } else if (diff === 0) {
    // 同一时刻：按 0 处理，而不是 24 小时
    overnight = false;
  }

  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 60);
  const minutes = Math.round(abs % 60);
  const sign = diff < 0 ? -1 : 1;

  return {
    startMinutes,
    endMinutes,
    diffMinutes: diff,
    hours,
    minutes,
    overnight,
    human: humanizeDuration({ hours: sign * hours, minutes: sign * minutes }, { maxUnits: 2 }),
  };
}

/**
 * 'HH:mm' 或 'HH:mm:ss' -> 分钟数（含小数）。
 * 这里是「一天中的时刻」语义，因此小时必须落在 0–23；
 * 需要 '27:30' 这种跨天时长写法请直接用 clockToMinutes。
 */
export function parseTimeToMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
}

/**
 * 从完整日期时间求差（保留天数维度）。
 * 返回的 diffMinutes 为带符号的精确分钟差。
 */
export function diffDateTimes(
  start: Date | string,
  end: Date | string,
): { diffMinutes: number; days: number; hours: number; minutes: number; human: string; reversed: boolean } | null {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return null;

  const diffMinutes = b.diff(a, 'minute');
  const reversed = diffMinutes < 0;
  const abs = Math.abs(diffMinutes);
  const days = Math.floor(abs / MINUTES_PER_DAY);
  const hours = Math.floor((abs % MINUTES_PER_DAY) / 60);
  const minutes = Math.round(abs % 60);

  return {
    diffMinutes,
    days,
    hours,
    minutes,
    reversed,
    human: humanizeDuration(
      { days: Math.sign(diffMinutes) * days, hours: Math.sign(diffMinutes) * hours, minutes: Math.sign(diffMinutes) * minutes },
      { maxUnits: 3 },
    ),
  };
}

/**
 * 把时长换算成其他单位（时间差的常见追问："那是多少分钟？"）。
 */
export function timeDiffEquivalents(diffMinutes: number) {
  const abs = Math.abs(diffMinutes);
  return {
    hours: diffMinutes / 60,
    minutes: diffMinutes,
    seconds: diffMinutes * 60,
    /** 'HH:mm'，超过 24 小时会继续累加，如 '27:30' */
    clock: minutesToClock(diffMinutes),
    days: abs / MINUTES_PER_DAY,
    /** 占比：一天中的百分比 */
    percentOfDay: (abs / MINUTES_PER_DAY) * 100,
    percentOfWorkday: (abs / 480) * 100, // 以 8 小时工作制为基准
  };
}

/**
 * 中间时刻（两时刻的中点），跨夜时按 overnight 规则。
 */
export function midpointTime(start: string, end: string): string | null {
  const diff = diffTimes(start, end);
  if (!diff) return null;
  const mid = (diff.startMinutes + diff.diffMinutes / 2) % MINUTES_PER_DAY;
  return minutesToClock(Math.round(((mid % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY));
}

/**
 * 时间轴溢出检查：给出提示文案，供 UI 显示"跨夜"徽标。
 */
export function overnightHint(result: TimeDiffResult): string | null {
  return result.overnight ? '结束时刻早于开始时刻，已按次日计算' : null;
}

export { MINUTES_PER_DAY };
