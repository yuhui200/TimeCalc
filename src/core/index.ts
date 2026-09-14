/**
 * TimeCalc 核心内核的统一出口。
 *
 * 使用方（UI / 测试 / 各平台入口）只应从 `@/core` 引入，
 * 不要深入具体文件——这样内部重构不影响外部。
 */

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------
export { dayjs, default as dayjsDefault } from './dayjs';

export type {
  CalendarEvent,
  CountdownSnapshot,
  DateDiffResult,
  DateInput,
  Duration,
  DurationInput,
  DurationUnit,
  HolidayEntry,
  HolidayRegion,
  ISODate,
  ISODateTime,
  LunarDate,
  NaturalParse,
  TimeDiffResult,
  TimeZoneConversion,
  TimeZoneId,
  WeekdayIndex,
  ZoneInfo,
} from './types';

// ---------------------------------------------------------------------------
// 时长
// ---------------------------------------------------------------------------
export {
  DURATION_UNITS,
  UNIT_ALIASES,
  UNIT_ALIASES_BY_LENGTH,
  UNIT_LABELS_EN,
  UNIT_LABELS_ZH,
  UNIT_MS,
  ZERO_DURATION,
  addDurations,
  compactDuration,
  describeDuration,
  durationToMs,
  formatNumberish,
  humanizeDuration,
  isNegativeDuration,
  isValidDateInput,
  isZeroDuration,
  msToClockParts,
  msToDuration,
  negateDuration,
  normalizeDuration,
  parseDuration,
  splitMs,
  subtractDurations,
  unitLabel,
} from './duration';
export type { HumanizeOptions } from './duration';

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------
export {
  DATE_FMT,
  DATETIME_FMT,
  DATETIME_SEC_FMT,
  ISO_LOCAL_FMT,
  TIME_FMT,
  WEEKDAY_SHORT_ZH,
  WEEKDAY_ZH,
  clockToMinutes,
  formatDate,
  formatDateTime,
  formatDateWithWeekday,
  formatDurationZh,
  formatNumber,
  formatRelativeZh,
  formatSigned,
  formatWeekday,
  minutesToClock,
  pad2,
  shortId,
  toDate,
  truncate,
} from './format';

// ---------------------------------------------------------------------------
// 日期差 / 日期加减
// ---------------------------------------------------------------------------
export {
  calculateAge,
  dayOfRange,
  diffDates,
  diffInDays,
  diffInHours,
  diffInMinutes,
  diffInMonths,
  diffInWholeDays,
  diffInWeeks,
  diffInYears,
} from './dateDiff';
export type { DateDiffOptions } from './dateDiff';

export {
  QUICK_ADD_PRESETS,
  QUICK_SUBTRACT_PRESETS,
  addDays,
  addDuration,
  addDurationChain,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  addYears,
  alignTo,
  applyDuration,
  describeAddResult,
  subtractDuration,
} from './dateAdd';
export type { DateAddResult, QuickAddPreset } from './dateAdd';

// ---------------------------------------------------------------------------
// 时间差 / 时间加减
// ---------------------------------------------------------------------------
export {
  MINUTES_PER_DAY,
  diffDateTimes,
  diffTimes,
  midpointTime,
  overnightHint,
  parseTimeToMinutes,
  timeDiffEquivalents,
} from './timeDiff';
export type { TimeDiffOptions } from './timeDiff';

export {
  addToTime,
  addToTimeChain,
  parseClock,
  subtractFromTime,
  timeRange,
} from './timeAdd';
export type { TimeAddMode, TimeAddResult } from './timeAdd';

// ---------------------------------------------------------------------------
// 工作日 / 节假日
// ---------------------------------------------------------------------------
export {
  DEFAULT_WEEKEND,
  addWorkdays,
  countCalendarDays,
  countHolidays,
  countWeekendDays,
  countWorkdays,
  dayKey,
  isWeekend,
  isWorkday,
  listWorkdays,
  nextWorkday,
  previousWorkday,
  splitHolidayEntries,
  toKeySet,
} from './workdays';
export type { WorkdayOptions } from './workdays';

export {
  HOLIDAY_REGIONS,
  REGION_WEEKEND,
  computeChineseHolidays,
  computeJPHolidays,
  computeUKHolidays,
  computeUSHolidays,
  easterSunday,
  getHolidaySet,
  getHolidays,
  getHolidaysInRange,
  isHoliday,
  isOfficial,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  upcomingHolidays,
} from './holidays';

// ---------------------------------------------------------------------------
// 农历 / 节气
// ---------------------------------------------------------------------------
export {
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  SOLAR_TERMS,
  formatLunar,
  ganzhiOf,
  leapDays,
  leapMonth,
  lunarDayText,
  lunarFestival,
  lunarMonthDays,
  lunarMonthText,
  lunarToSolar,
  lunarYearDays,
  lunarYearLabel,
  lunarYearText,
  solarTermDay,
  solarTermOf,
  solarTermsOfYear,
  solarToLunar,
  zodiacOf,
} from './lunar';

// ---------------------------------------------------------------------------
// 时区
// ---------------------------------------------------------------------------
export {
  DEFAULT_BOARD_ZONES,
  ZONES,
  convertInstant,
  convertWallClock,
  dateInZone,
  findZone,
  formatInZone,
  formatOffset,
  getLocalZone,
  hourDifference,
  instantFromWallClock,
  isValidTimeZone,
  makeZoneInfo,
  overlappingWorkHours,
  searchZones,
  timeInZone,
  wallClockOf,
  zoneAbbr,
  zoneBoard,
  zoneOffsetMinutes,
} from './timezone';

// ---------------------------------------------------------------------------
// Unix 时间戳
// ---------------------------------------------------------------------------
export {
  EPOCH_UNIT_LABELS,
  convertEpoch,
  dateToEpochs,
  detectEpochUnit,
  epochToMs,
  nowEpoch,
  parseEpochInput,
  toEpoch,
} from './unix';
export type { EpochUnit, UnixConversion } from './unix';

// ---------------------------------------------------------------------------
// 日历导出
// ---------------------------------------------------------------------------
export {
  buildICS,
  escapeICSText,
  eventFromCountdown,
  eventToVEvent,
  foldLine,
  isValidICS,
  parseICSSummary,
  suggestICSFilename,
  toICSDate,
  toICSDateTimeUtc,
} from './ics';
export type { ICSOptions } from './ics';

// ---------------------------------------------------------------------------
// 倒计时
// ---------------------------------------------------------------------------
export {
  COUNTDOWN_PRESETS,
  countdownDigits,
  countdownProgress,
  describeCountdown,
  endOfToday,
  endOfWeek,
  nextHour,
  snapshot as countdownSnapshot,
  startOfTomorrow,
} from './countdown';

// ---------------------------------------------------------------------------
// 自然语言
// ---------------------------------------------------------------------------
export {
  NATURAL_EXAMPLES,
  describeIntent,
  detectSign,
  extractChineseDates,
  extractDurations,
  extractTimeOfDay,
  normalizeText,
  parseNatural,
  parseNaturalDetailed,
} from './natural';
export type { NaturalDebug, NaturalParseResult } from './natural';
