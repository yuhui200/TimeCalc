/**
 * 节假日数据与推算。
 *
 * 数据来源分级（HolidayEntry.approximate 区分）：
 *   - approximate = false：官方公布的放假安排（含调休补班），目前内置中国 2024 / 2025 年
 *   - approximate = true ：按固定日期或农历规则推算出的**法定假日**，
 *                          不含国务院临时安排的调休，实际放假可能不同
 *
 * 中国 2026 年及以后的安排以国务院办公厅通知为准。应用提供「自定义节假日」
 * 入口，用户可把官方通知里的调休日补进去，覆盖推算结果。
 */
import dayjs from './dayjs';
import { DATE_FMT } from './format';
import { solarTermDay, lunarToSolar } from './lunar';
import type { HolidayEntry, HolidayRegion } from './types';

export const HOLIDAY_REGIONS: { id: HolidayRegion; label: string }[] = [
  { id: 'CN', label: '中国' },
  { id: 'US', label: '美国' },
  { id: 'UK', label: '英国（英格兰&威尔士）' },
  { id: 'JP', label: '日本' },
  { id: 'NONE', label: '不计算节假日' },
];

/** 该地区周末对应的星期索引（0=周日） */
export const REGION_WEEKEND: Record<HolidayRegion, readonly number[]> = {
  CN: [0, 6],
  US: [0, 6],
  UK: [0, 6],
  JP: [0, 6],
  NONE: [0, 6],
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function iso(date: Date): string {
  return dayjs(date).format(DATE_FMT);
}

/** 生成闭区间内的每一天 */
function eachDay(startISO: string, endISO: string): Date[] {
  const start = dayjs(startISO);
  const end = dayjs(endISO);
  const out: Date[] = [];
  for (let d = start; d.isSameOrBefore(end, 'day'); d = d.add(1, 'day')) {
    out.push(d.toDate());
  }
  return out;
}

/** 把一段假期展开成逐日条目 */
function holidayRange(
  startISO: string,
  endISO: string,
  name: string,
  region: HolidayRegion,
  approximate = false,
): HolidayEntry[] {
  return eachDay(startISO, endISO).map((d) => ({
    date: iso(d),
    name,
    kind: 'holiday' as const,
    region,
    approximate,
  }));
}

function workdayList(dates: string[], name: string, region: HolidayRegion, approximate = false): HolidayEntry[] {
  return dates.map((date) => ({ date, name, kind: 'workday' as const, region, approximate }));
}

function entry(date: Date, name: string, region: HolidayRegion, approximate = false): HolidayEntry {
  return { date: iso(date), name, kind: 'holiday', region, approximate };
}

/** 某月第 n 个星期 w 的日期；n 从 1 开始 */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

/** 某月最后一个星期 w 的日期 */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0); // 下月第 0 天 = 本月最后一天
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - offset);
}

/** 复活节（匿名格里高利算法，Meeus/Jones/Butcher） */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** 周末顺延：落在周六 → 前移到周五，落在周日 → 后移到周一（美式 observed 规则） */
function observedUS(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return dayjs(date).subtract(1, 'day').toDate();
  if (day === 0) return dayjs(date).add(1, 'day').toDate();
  return date;
}

/** 英国 substitute day：落在周末则顺延到下一个工作日 */
function substituteUK(date: Date, taken: Set<string>): Date {
  let d = dayjs(date);
  while (d.day() === 0 || d.day() === 6 || taken.has(d.format(DATE_FMT))) {
    d = d.add(1, 'day');
  }
  return d.toDate();
}

// ---------------------------------------------------------------------------
// 中国
// ---------------------------------------------------------------------------

/** 官方公布的放假安排（含调休）。新增年份时在此追加即可。 */
const CN_OFFICIAL: Record<number, HolidayEntry[]> = {
  2024: [
    ...holidayRange('2024-01-01', '2024-01-01', '元旦', 'CN'),
    ...holidayRange('2024-02-10', '2024-02-17', '春节', 'CN'),
    ...holidayRange('2024-04-04', '2024-04-06', '清明节', 'CN'),
    ...holidayRange('2024-05-01', '2024-05-05', '劳动节', 'CN'),
    ...holidayRange('2024-06-10', '2024-06-10', '端午节', 'CN'),
    ...holidayRange('2024-09-15', '2024-09-17', '中秋节', 'CN'),
    ...holidayRange('2024-10-01', '2024-10-07', '国庆节', 'CN'),
    ...workdayList(
      ['2024-02-04', '2024-02-18', '2024-04-07', '2024-04-28', '2024-05-11', '2024-09-14', '2024-09-29', '2024-10-12'],
      '调休上班',
      'CN',
    ),
  ],
  2025: [
    ...holidayRange('2025-01-01', '2025-01-01', '元旦', 'CN'),
    ...holidayRange('2025-01-28', '2025-02-04', '春节', 'CN'),
    ...holidayRange('2025-04-04', '2025-04-06', '清明节', 'CN'),
    ...holidayRange('2025-05-01', '2025-05-05', '劳动节', 'CN'),
    ...holidayRange('2025-05-31', '2025-06-02', '端午节', 'CN'),
    ...holidayRange('2025-10-01', '2025-10-08', '国庆节、中秋节', 'CN'),
    ...workdayList(
      ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11'],
      '调休上班',
      'CN',
    ),
  ],
};

/**
 * 按规则推算中国的法定假日（不含调休）。
 *   元旦 1/1 ｜ 春节 正月初一至初三 ｜ 清明 节气日
 *   劳动节 5/1–5/2 ｜ 端午 五月初五 ｜ 中秋 八月十五 ｜ 国庆 10/1–10/3
 */
export function computeChineseHolidays(year: number): HolidayEntry[] {
  const out: HolidayEntry[] = [];

  out.push(entry(new Date(year, 0, 1), '元旦', 'CN', true));

  const springFestival = lunarToSolar(year, 1, 1);
  if (springFestival) {
    out.push(
      ...holidayRange(
        iso(springFestival),
        iso(dayjs(springFestival).add(2, 'day').toDate()),
        '春节',
        'CN',
        true,
      ),
    );
  }

  const qingming = solarTermDay(year, 6); // 清明是小寒起的第 6 个节气
  out.push(entry(new Date(year, qingming.month - 1, qingming.day), '清明节', 'CN', true));

  out.push(...holidayRange(`${year}-05-01`, `${year}-05-02`, '劳动节', 'CN', true));

  const duanwu = lunarToSolar(year, 5, 5);
  if (duanwu) out.push(entry(duanwu, '端午节', 'CN', true));

  const midAutumn = lunarToSolar(year, 8, 15);
  if (midAutumn) out.push(entry(midAutumn, '中秋节', 'CN', true));

  out.push(...holidayRange(`${year}-10-01`, `${year}-10-03`, '国庆节', 'CN', true));

  return out;
}

// ---------------------------------------------------------------------------
// 美国
// ---------------------------------------------------------------------------

export function computeUSHolidays(year: number): HolidayEntry[] {
  const raw: [Date, string][] = [
    [new Date(year, 0, 1), "New Year's Day"],
    [nthWeekdayOfMonth(year, 1, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekdayOfMonth(year, 2, 1, 3), "Washington's Birthday"],
    [lastWeekdayOfMonth(year, 5, 1), 'Memorial Day'],
    [new Date(year, 5, 19), 'Juneteenth'],
    [new Date(year, 6, 4), 'Independence Day'],
    [nthWeekdayOfMonth(year, 9, 1, 1), 'Labor Day'],
    [nthWeekdayOfMonth(year, 10, 1, 2), 'Columbus Day'],
    [new Date(year, 10, 11), 'Veterans Day'],
    [nthWeekdayOfMonth(year, 11, 4, 4), 'Thanksgiving Day'],
    [new Date(year, 11, 25), 'Christmas Day'],
  ];
  // 元旦的 observed 可能落在上一年 12/31，这里只保留落在本年内的条目
  return raw
    .map(([d, name]) => entry(observedUS(d), name, 'US'))
    .filter((e) => e.date.startsWith(String(year)));
}

// ---------------------------------------------------------------------------
// 英国（英格兰 & 威尔士）
// ---------------------------------------------------------------------------

export function computeUKHolidays(year: number): HolidayEntry[] {
  const easter = easterSunday(year);
  const goodFriday = dayjs(easter).subtract(2, 'day').toDate();
  const easterMonday = dayjs(easter).add(1, 'day').toDate();

  const taken = new Set<string>();
  const push = (d: Date, name: string) => {
    taken.add(iso(d));
    return entry(d, name, 'UK');
  };

  const out: HolidayEntry[] = [];
  out.push(push(substituteUK(new Date(year, 0, 1), taken), "New Year's Day"));
  out.push(push(goodFriday, 'Good Friday'));
  out.push(push(easterMonday, 'Easter Monday'));
  out.push(push(nthWeekdayOfMonth(year, 5, 1, 1), 'Early May Bank Holiday'));
  out.push(push(lastWeekdayOfMonth(year, 5, 1), 'Spring Bank Holiday'));
  out.push(push(lastWeekdayOfMonth(year, 8, 1), 'Summer Bank Holiday'));
  out.push(push(substituteUK(new Date(year, 11, 25), taken), 'Christmas Day'));
  out.push(push(substituteUK(new Date(year, 11, 26), taken), 'Boxing Day'));

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 日本
// ---------------------------------------------------------------------------

export function computeJPHolidays(year: number): HolidayEntry[] {
  const raw: [Date, string][] = [
    [new Date(year, 0, 1), '元日'],
    [nthWeekdayOfMonth(year, 1, 1, 2), '成人の日'],
    [new Date(year, 1, 11), '建国記念の日'],
    [new Date(year, 1, 23), '天皇誕生日'],
    [new Date(year, 3, 29), '昭和の日'],
    [new Date(year, 4, 3), '憲法記念日'],
    [new Date(year, 4, 4), 'みどりの日'],
    [new Date(year, 4, 5), 'こどもの日'],
    [nthWeekdayOfMonth(year, 7, 1, 3), '海の日'],
    [new Date(year, 7, 11), '山の日'],
    [nthWeekdayOfMonth(year, 9, 1, 3), '敬老の日'],
    [nthWeekdayOfMonth(year, 10, 1, 2), 'スポーツの日'],
    [new Date(year, 10, 3), '文化の日'],
    [new Date(year, 10, 23), '勤労感謝の日'],
  ];

  // 春分 / 秋分使用近似公式（1980–2099 年误差不超过 1 天）
  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  raw.push([new Date(year, 2, vernal), '春分の日']);
  raw.push([new Date(year, 8, autumnal), '秋分の日']);

  const sorted = raw
    .map(([d, name]) => ({ date: iso(d), name, kind: 'holiday' as const, region: 'JP' as const }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 振替休日：落在周日的假日顺延到下一个非假日
  const taken = new Set(sorted.map((e) => e.date));
  const extra: HolidayEntry[] = [];
  for (const e of sorted) {
    const d = dayjs(e.date);
    if (d.day() !== 0) continue;
    let next = d.add(1, 'day');
    while (taken.has(next.format(DATE_FMT))) next = next.add(1, 'day');
    taken.add(next.format(DATE_FMT));
    extra.push({ date: next.format(DATE_FMT), name: '振替休日', kind: 'holiday', region: 'JP' });
  }

  return [...sorted, ...extra].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 统一入口
// ---------------------------------------------------------------------------

/** 取某年某地区的节假日条目（已按日期排序，同日期去重） */
export function getHolidays(year: number, region: HolidayRegion): HolidayEntry[] {
  if (region === 'NONE') return [];

  let entries: HolidayEntry[];
  switch (region) {
    case 'CN':
      entries = CN_OFFICIAL[year] ?? computeChineseHolidays(year);
      break;
    case 'US':
      entries = computeUSHolidays(year);
      break;
    case 'UK':
      entries = computeUKHolidays(year);
      break;
    case 'JP':
      entries = computeJPHolidays(year);
      break;
    default:
      entries = [];
  }

  // 同一天既有放假又有调休时，以最后写入为准（官方数据优先于推算）
  const byDate = new Map<string, HolidayEntry>();
  for (const e of entries) byDate.set(e.date, e);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 取跨年区间的节假日条目 */
export function getHolidaysInRange(
  startYear: number,
  endYear: number,
  region: HolidayRegion,
): HolidayEntry[] {
  const out: HolidayEntry[] = [];
  for (let y = startYear; y <= endYear; y++) out.push(...getHolidays(y, region));
  return out;
}

/** 打包成 workdays.ts 需要的集合形式 */
export function getHolidaySet(
  region: HolidayRegion,
  years: number[],
): { holidays: Set<string>; extraWorkdays: Set<string>; entries: HolidayEntry[] } {
  const entries: HolidayEntry[] = [];
  for (const y of years) entries.push(...getHolidays(y, region));

  const holidays = new Set<string>();
  const extraWorkdays = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'holiday') holidays.add(e.date);
    else extraWorkdays.add(e.date);
  }
  return { holidays, extraWorkdays, entries };
}

/** 判断某日是否是节假日（不含周末） */
export function isHoliday(input: Date | string, region: HolidayRegion): HolidayEntry | null {
  const d = dayjs(input);
  if (!d.isValid()) return null;
  const key = d.format(DATE_FMT);
  return getHolidays(d.year(), region).find((e) => e.date === key) ?? null;
}

/**
 * 从指定日期开始的接下来若干个节假日（用于「下一个假期」倒计时）。
 */
export function upcomingHolidays(
  from: Date | string,
  region: HolidayRegion,
  count = 5,
): HolidayEntry[] {
  const start = dayjs(from);
  if (!start.isValid() || region === 'NONE') return [];

  const out: HolidayEntry[] = [];
  for (let offset = 0; offset <= 2 && out.length < count; offset++) {
    const year = start.year() + offset;
    for (const e of getHolidays(year, region)) {
      if (e.kind !== 'holiday') continue;
      if (dayjs(e.date).isBefore(start.startOf('day'))) continue;
      if (out.some((x) => x.date === e.date)) continue;
      out.push(e);
    }
  }
  return out
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}

/** 数据是否来自官方公布（用于 UI 上显示「推算」徽标） */
export function isOfficial(region: HolidayRegion, year: number): boolean {
  return region === 'CN' && year in CN_OFFICIAL;
}
