/**
 * 倒计时。
 *
 * 纯函数式：`snapshot(target, now)` 不持有定时器，
 * 由 UI 层的 useCountdown Hook 负责按秒调用。这样内核可测试、可复用。
 */
import dayjs from './dayjs';
import { humanizeDuration, msToClockParts } from './duration';
import { DATETIME_FMT } from './format';
import type { CountdownSnapshot, DateInput } from './types';

/** 计算一次倒计时快照 */
export function snapshot(target: DateInput, now: DateInput = new Date()): CountdownSnapshot | null {
  const t = dayjs(target);
  const n = dayjs(now);
  if (!t.isValid() || !n.isValid()) return null;

  const remainingMs = t.valueOf() - n.valueOf();
  const parts = msToClockParts(remainingMs);
  const abs = Math.abs(remainingMs);

  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);

  const expired = remainingMs <= 0;

  return {
    target: t.toDate(),
    remainingMs,
    expired,
    days,
    hours,
    minutes,
    seconds,
    totalHours: abs / 3_600_000,
    totalMinutes: abs / 60_000,
    human: expired
      ? `已过去 ${humanizeDuration({ days, hours, minutes, seconds }, { maxUnits: 3 })}`
      : `还剩 ${humanizeDuration({ days, hours, minutes, seconds }, { maxUnits: 3 })}`,
  };
}

/** 拆成可用于翻牌动画的数字数组 */
export function countdownDigits(snap: CountdownSnapshot): {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  return {
    days: String(snap.days),
    hours: String(snap.hours).padStart(2, '0'),
    minutes: String(snap.minutes).padStart(2, '0'),
    seconds: String(snap.seconds).padStart(2, '0'),
  };
}

/** 进度：从 start 到 target 已经走了多少（0–1） */
export function countdownProgress(
  start: DateInput,
  target: DateInput,
  now: DateInput = new Date(),
): number {
  const s = dayjs(start).valueOf();
  const t = dayjs(target).valueOf();
  const n = dayjs(now).valueOf();
  if (!Number.isFinite(s) || !Number.isFinite(t) || t === s) return 0;
  return Math.min(1, Math.max(0, (n - s) / (t - s)));
}

/** 常用倒计时目标：今天剩下的时间 */
export function endOfToday(now: DateInput = new Date()): Date {
  return dayjs(now).endOf('day').toDate();
}

/** 距离下一个整点还有多久 */
export function nextHour(now: DateInput = new Date()): Date {
  return dayjs(now).add(1, 'hour').startOf('hour').toDate();
}

/** 距离明天 0 点 */
export function startOfTomorrow(now: DateInput = new Date()): Date {
  return dayjs(now).add(1, 'day').startOf('day').toDate();
}

/** 距离本周结束（周日 24:00） */
export function endOfWeek(now: DateInput = new Date()): Date {
  return dayjs(now).endOf('isoWeek').toDate();
}

export const COUNTDOWN_PRESETS: readonly { id: string; label: string; resolve: (now?: DateInput) => Date }[] = [
  { id: 'today-end', label: '今天结束', resolve: (now) => endOfToday(now) },
  { id: 'tomorrow', label: '明天零点', resolve: (now) => startOfTomorrow(now) },
  { id: 'next-hour', label: '下一个整点', resolve: (now) => nextHour(now) },
  { id: 'week-end', label: '本周结束', resolve: (now) => endOfWeek(now) },
  { id: 'new-year', label: '明年元旦', resolve: (now) => dayjs(now).add(1, 'year').startOf('year').toDate() },
] as const;

/** 生成倒计时条目的默认标题 */
export function describeCountdown(snap: CountdownSnapshot): string {
  return `${dayjs(snap.target).format(DATETIME_FMT)} · ${snap.human}`;
}
