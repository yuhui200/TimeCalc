/**
 * 展示层格式化工具（纯函数，不含 UI）。
 * 所有面向用户的可读文本都在这里集中，便于将来接入 i18n。
 */
import dayjs from './dayjs';
import type { DateInput, DurationInput } from './types';
import { humanizeDuration } from './duration';

export const DATE_FMT = 'YYYY-MM-DD';
export const TIME_FMT = 'HH:mm';
export const DATETIME_FMT = 'YYYY-MM-DD HH:mm';
export const DATETIME_SEC_FMT = 'YYYY-MM-DD HH:mm:ss';
/** ISO 8601 带本地偏移，如 2026-09-14T15:30:00+08:00 */
export const ISO_LOCAL_FMT = 'YYYY-MM-DDTHH:mm:ssZ';

export const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
export const WEEKDAY_SHORT_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toDate(input: DateInput): Date {
  return input instanceof Date ? input : dayjs(input).toDate();
}

/** 安全格式化：非法输入返回占位符而不是 'Invalid Date' */
export function formatDate(input: DateInput | null | undefined, pattern = DATE_FMT): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = dayjs(input);
  return d.isValid() ? d.format(pattern) : '—';
}

export function formatDateTime(input: DateInput, pattern = DATETIME_FMT): string {
  return formatDate(input, pattern);
}

/** '2026-09-14 周一' */
export function formatDateWithWeekday(input: DateInput): string {
  const d = dayjs(input);
  if (!d.isValid()) return '—';
  return `${d.format(DATE_FMT)} ${WEEKDAY_ZH[d.day()]}`;
}

/** '周一' */
export function formatWeekday(input: DateInput): string {
  const d = dayjs(input);
  return d.isValid() ? WEEKDAY_ZH[d.day()] : '—';
}

/** 数字千分位 */
export function formatNumber(
  value: number,
  opts: { maximumFractionDigits?: number; locale?: string } = {},
): string {
  const { maximumFractionDigits = 2, locale = 'zh-CN' } = opts;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** 带正负号，如 '+3' / '-2' */
export function formatSigned(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = digits > 0 ? value.toFixed(digits) : String(Math.trunc(value));
  return value > 0 ? `+${fixed}` : fixed;
}

/** 分钟数 -> 'HH:mm'（可超过 24 小时，如 '27:30'） */
export function minutesToClock(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${pad2(h)}:${pad2(m)}`;
}

/** 'HH:mm' -> 从零点起的分钟数；非法返回 null */
export function clockToMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  if (h > 99) return null;
  return h * 60 + min + sec / 60;
}

/** 时长 -> '2小时30分钟' 紧凑中文 */
export function formatDurationZh(input: DurationInput, compact = false): string {
  return humanizeDuration(input, { locale: 'zh', compact, maxUnits: 4 });
}

/**
 * 相对时间的中文描述，以 base 为参照。
 * 输出 '3 天后' / '2 小时前' / '刚刚'
 */
export function formatRelativeZh(target: DateInput, base: DateInput = new Date()): string {
  const t = dayjs(target);
  const b = dayjs(base);
  if (!t.isValid() || !b.isValid()) return '—';

  const diffMs = t.diff(b);
  const abs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? '后' : '前';

  if (abs < 45_000) return '刚刚';
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)} 分钟${suffix}`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)} 小时${suffix}`;
  if (abs < 2_592_000_000) return `${Math.round(abs / 86_400_000)} 天${suffix}`;
  if (abs < 31_536_000_000) return `${Math.round(abs / 2_592_000_000)} 个月${suffix}`;
  return `${(abs / 31_536_000_000).toFixed(1)} 年${suffix}`;
}

/** 生成一个短小的唯一 ID（不依赖 crypto，兼容所有 WebView） */
export function shortId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
}

/** 截断过长文本 */
export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
