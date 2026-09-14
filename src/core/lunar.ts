/**
 * 农历（夏历）与二十四节气。
 *
 * 算法基于经典的「压缩 LunarInfo 表 + 1900-01-31 基准日」方案，
 * 覆盖 1900–2100 年，误差为 0（该区间内的农历数据是查表所得）。
 *
 * 数据布局（每个年份一个 20 bit 整数）：
 *   bit 16      : 闰月大小，1 = 30 天，0 = 29 天
 *   bit 15 .. 4 : 正月到十二月的大小，1 = 30 天，0 = 29 天
 *   bit 3  .. 0 : 闰月月份，0 表示无闰月
 */
import type { LunarDate } from './types';

/** 1900–2100 年农历数据表 */
const LUNAR_INFO: readonly number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2100;

const DAY_MS = 86_400_000;
/** 1900-01-31 是农历 1900 年正月初一 */
const BASE_UTC = Date.UTC(1900, 0, 31);

const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;
const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'] as const;
const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
] as const;

/** 二十四节气名，索引与 S_TERM_INFO 对应 */
export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
] as const;

/** 节气分钟偏移表（相对 1900-01-06 02:05 UTC） */
const S_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921,
  173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033,
  353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
] as const;

/** 回归年毫秒数 */
const TROPICAL_YEAR_MS = 31_556_925_974.7;

function assertYearRange(year: number): void {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) {
    throw new RangeError(`农历数据仅覆盖 ${LUNAR_MIN_YEAR}–${LUNAR_MAX_YEAR} 年，收到 ${year}`);
  }
}

/** 农历 y 年闰哪个月，0 表示不闰 */
export function leapMonth(year: number): number {
  assertYearRange(year);
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0xf;
}

/** 农历 y 年闰月的天数，无闰月返回 0 */
export function leapDays(year: number): number {
  if (leapMonth(year) === 0) return 0;
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0x10000 ? 30 : 29;
}

/** 农历 y 年 m 月（非闰月）的天数 */
export function lunarMonthDays(year: number, month: number): number {
  assertYearRange(year);
  if (month < 1 || month > 12) throw new RangeError(`农历月份必须在 1–12，收到 ${month}`);
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & (0x10000 >> month) ? 30 : 29;
}

/** 农历 y 年的总天数 */
export function lunarYearDays(year: number): number {
  let sum = 348; // 12 个月 × 29 天
  const info = LUNAR_INFO[year - LUNAR_MIN_YEAR];
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    sum += info & bit ? 1 : 0;
  }
  return sum + leapDays(year);
}

/** 农历年的中文写法，如 2026 -> '二〇二六' */
export function lunarYearText(year: number): string {
  return String(year)
    .split('')
    .map((c) => CN_DIGITS[Number(c)] ?? c)
    .join('');
}

/** 干支纪年 */
export function ganzhiOf(year: number): string {
  const stem = HEAVENLY_STEMS[(((year - 4) % 10) + 10) % 10];
  const branch = EARTHLY_BRANCHES[(((year - 4) % 12) + 12) % 12];
  return `${stem}${branch}`;
}

/** 生肖 */
export function zodiacOf(year: number): string {
  return ZODIAC[(((year - 4) % 12) + 12) % 12];
}

/** 农历月名，闰月加前缀「闰」 */
export function lunarMonthText(month: number, isLeap = false): string {
  const base = `${MONTH_NAMES[month - 1]}月`;
  return isLeap ? `闰${base}` : base;
}

/** 农历日名 */
export function lunarDayText(day: number): string {
  return DAY_NAMES[day - 1] ?? String(day);
}

/** 本地日期 -> 该日 UTC 零点的毫秒数，用于纯日期差值计算 */
function localDateToUtcMs(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** UTC 毫秒 -> 本地零点的 Date */
function utcMsToLocalDate(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 某年第 n 个节气（0 = 小寒）的日期（当月第几天与月份） */
export function solarTermDay(year: number, index: number): { month: number; day: number } {
  const ms =
    TROPICAL_YEAR_MS * (year - 1900) + S_TERM_INFO[index] * 60_000 + Date.UTC(1900, 0, 6, 2, 5);
  const d = new Date(ms);
  return { month: Math.floor(index / 2) + 1, day: d.getUTCDate() };
}

/** 某日是否是节气，是则返回节气名 */
export function solarTermOf(date: Date): string | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const idx = (month - 1) * 2;
  for (const i of [idx, idx + 1]) {
    if (i < 0 || i > 23) continue;
    const t = solarTermDay(date.getFullYear(), i);
    if (t.month === month && t.day === day) return SOLAR_TERMS[i];
  }
  return null;
}

/** 某年全部 24 节气的公历日期 */
export function solarTermsOfYear(year: number): { name: string; month: number; day: number; date: Date }[] {
  return SOLAR_TERMS.map((name, i) => {
    const { month, day } = solarTermDay(year, i);
    return { name, month, day, date: new Date(year, month - 1, day) };
  });
}

/**
 * 公历 -> 农历。超出 1900–2100 返回 null。
 */
export function solarToLunar(input: Date): LunarDate | null {
  const year = input.getFullYear();
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) return null;

  let offset = Math.floor((localDateToUtcMs(input) - BASE_UTC) / DAY_MS);

  let lunarYear = LUNAR_MIN_YEAR;
  let temp = 0;
  for (lunarYear = LUNAR_MIN_YEAR; lunarYear < LUNAR_MAX_YEAR && offset > 0; lunarYear++) {
    temp = lunarYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;

  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
      --lunarMonth;
      isLeap = true;
      temp = leapDays(lunarYear);
    } else {
      temp = lunarMonthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === leap + 1) isLeap = false;
    offset -= temp;
  }

  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      --lunarMonth;
    }
  }
  if (offset < 0) {
    offset += temp;
    --lunarMonth;
  }

  const lunarDay = offset + 1;
  const monthText = lunarMonthText(lunarMonth, isLeap);
  const dayText = lunarDayText(lunarDay);

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    text: `${lunarYearText(lunarYear)}年${monthText}${dayText}`,
    zodiac: zodiacOf(lunarYear),
    ganzhi: ganzhiOf(lunarYear),
    solarTerm: solarTermOf(input),
  };
}

/**
 * 农历 -> 公历。用于按农历规则推算节日（春节、端午、中秋…）。
 * 闰月请显式传 isLeap = true。
 */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeap = false,
): Date | null {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30) return null;

  let offset = 0;
  for (let y = LUNAR_MIN_YEAR; y < year; y++) offset += lunarYearDays(y);

  const leap = leapMonth(year);
  for (let m = 1; m < month; m++) {
    offset += lunarMonthDays(year, m);
    if (leap === m) offset += leapDays(year);
  }
  if (isLeap && leap === month) {
    // 闰月排在正常月之后
    offset += lunarMonthDays(year, month);
  }
  offset += day - 1;

  return utcMsToLocalDate(BASE_UTC + offset * DAY_MS);
}

/** 农历年份的中文纪年，如 '丙午马年' */
export function lunarYearLabel(year: number): string {
  return `${ganzhiOf(year)}${zodiacOf(year)}年`;
}

/** 便捷：公历日期 -> 一行中文农历描述 */
export function formatLunar(input: Date): string {
  const lunar = solarToLunar(input);
  if (!lunar) return '—';
  const term = lunar.solarTerm ? ` · ${lunar.solarTerm}` : '';
  return `${lunar.text}${term}`;
}

/** 节日名（农历固定节日） */
export function lunarFestival(input: Date): string | null {
  const lunar = solarToLunar(input);
  if (!lunar || lunar.isLeap) return null;
  const key = `${lunar.month}-${lunar.day}`;
  const table: Record<string, string> = {
    '1-1': '春节',
    '1-15': '元宵节',
    '2-2': '龙抬头',
    '5-5': '端午节',
    '7-7': '七夕',
    '7-15': '中元节',
    '8-15': '中秋节',
    '9-9': '重阳节',
    '12-8': '腊八节',
    '12-23': '小年',
  };
  return table[key] ?? null;
}
