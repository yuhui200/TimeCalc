/**
 * TimeCalc 核心类型定义。
 *
 * 本目录（src/core）为纯 TypeScript 计算内核：
 *   - 不 import React / DOM / 平台 API
 *   - 不产生副作用（除模块级 dayjs 插件注册）
 *   - 可被 Web / Tauri / Capacitor 三端以及 Node 测试环境直接复用
 */

/** 'YYYY-MM-DD' */
export type ISODate = string;
/** 'YYYY-MM-DDTHH:mm:ssZ' 或 'YYYY-MM-DD HH:mm' */
export type ISODateTime = string;
/**
 * 任意可被 dayjs 解析的输入。
 * 显式包含 Dayjs，方便 core 内部把中间结果直接传给下游函数。
 */
export type DateInput = Date | number | string | import('dayjs').Dayjs;

/** 时区标识符（IANA），如 'Asia/Shanghai'、'UTC' */
export type TimeZoneId = string;

/**
 * 日历感知的时长。
 *
 * 语义：各字段按「日历单位」生效后累加，顺序为
 * years → months → weeks → days → hours → minutes → seconds → milliseconds。
 * 例如 { months: 1 } 表示「加一个自然月」（1/31 + 1 月 = 2/28 或 2/29），
 * 而不是 30 天。这与 dayjs.add 的行为一致。
 *
 * 若需要标量时长（"大约多少毫秒"），使用 `durationToMs()`，
 * 它按 1 月 = 30.436875 天、1 年 = 365.2425 天的平均值折算。
 */
export interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/** 时长单位字面量联合 */
export type DurationUnit = keyof Required<Duration>;

/** 可被解析为 Duration 的输入 */
export type DurationInput = Duration | string | number;

/** 单个时区条目 */
export interface ZoneInfo {
  /** IANA 标识符 */
  id: TimeZoneId;
  /** 中文显示名 */
  label: string;
  /** 英文显示名 */
  labelEn: string;
  /** 国旗 / 地区 emoji，用于紧凑 UI */
  emoji: string;
  /** 常用别名，供自然语言与搜索使用 */
  aliases: string[];
}

/** 时区换算结果 */
export interface TimeZoneConversion {
  /** 源时区的墙上时间 */
  from: { zone: ZoneInfo; date: Date; formatted: string; offsetMinutes: number };
  /** 目标时区的墙上时间 */
  to: { zone: ZoneInfo; date: Date; formatted: string; offsetMinutes: number };
  /** 绝对时刻（UTC ms），两端一致 */
  epochMs: number;
  /** to - from 的时差小时数（含半小时/45 分钟时区） */
  offsetDeltaHours: number;
  /** 目标日相对源日的日历差（-1 / 0 / 1，跨日提示） */
  dayShift: number;
}

/** 日期差结果 */
export interface DateDiffResult {
  start: Date;
  end: Date;
  /** 1 表示 end >= start，-1 表示反向，0 表示同一毫秒 */
  sign: -1 | 0 | 1;

  /** 日历分解：从 start 逐级加到 end 所需的分量 */
  calendar: {
    years: number;
    months: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };

  /** 标量总计 */
  total: {
    years: number;
    months: number;
    weeks: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
  };

  /** 按整天粒度统计（含首尾端点） */
  calendarDays: number;
  /** 自然日跨度（end 当天 - start 当天），不含首尾端点 */
  spanDays: number;
  /** 工作日数量（默认含首尾，自动排除周末与节假日） */
  workdays: number;
  /** 周末天数 */
  weekendDays: number;
  /** 命中的节假日天数 */
  holidays: number;
}

/** 时间差结果（同一天内的时刻差，或跨夜的时长） */
export interface TimeDiffResult {
  startMinutes: number;
  endMinutes: number;
  /** end - start，可为负 */
  diffMinutes: number;
  /** 时长绝对值分解 */
  hours: number;
  minutes: number;
  /** 是否跨过午夜（end < start 时按次日处理） */
  overnight: boolean;
  /** 人类可读，如 "2 小时 30 分钟" */
  human: string;
}

/** 周内工作日配置：0=周日 … 6=周六 */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 节假日条目 */
export interface HolidayEntry {
  /** 'YYYY-MM-DD' */
  date: ISODate;
  name: string;
  /** 'holiday' = 放假；'workday' = 调休补班 */
  kind: 'holiday' | 'workday';
  region: HolidayRegion;
  /** true 表示由规则推算（非官方公布），可能不含调休 */
  approximate?: boolean;
}

/** 支持的节假日地区 */
export type HolidayRegion = 'CN' | 'US' | 'UK' | 'JP' | 'NONE';

/** 农历日期 */
export interface LunarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-30 */
  day: number;
  /** 该月是否为闰月 */
  isLeap: boolean;
  /** 中文表示，如 "二〇二六年八月初三" */
  text: string;
  /** 生肖，如 "马" */
  zodiac: string;
  /** 干支纪年，如 "丙午" */
  ganzhi: string;
  /** 节气名（若当天恰为节气），否则为 null */
  solarTerm: string | null;
}

/** 自然语言解析结果 */
export type NaturalParse =
  | { kind: 'empty' }
  | { kind: 'unknown'; reason: string; raw: string }
  | {
      kind: 'single';
      date: Date;
      /** 是否包含显式时刻（否则为当日 00:00） */
      hasTime: boolean;
      raw: string;
    }
  | { kind: 'date-diff'; start: Date; end: Date; raw: string }
  | { kind: 'workday-diff'; start: Date; end: Date; raw: string }
  | {
      kind: 'add';
      base: Date;
      duration: Duration;
      /** 1 = 加，-1 = 减 */
      sign: 1 | -1;
      hasTime: boolean;
      raw: string;
    }
  | { kind: 'time-diff'; start: string; end: string; raw: string }
  | {
      kind: 'timezone';
      date: Date;
      from: ZoneInfo;
      to: ZoneInfo;
      raw: string;
    }
  | { kind: 'unix'; epochMs: number; raw: string };

/** 日历事件（用于 .ics 导出与系统日历写入） */
export interface CalendarEvent {
  uid?: string;
  title: string;
  description?: string;
  location?: string;
  /** 开始时刻 */
  start: Date;
  /** 结束时刻，缺省时按 start + duration 或 start + 1h */
  end?: Date;
  allDay?: boolean;
  /** 提前提醒分钟数，默认 10 */
  reminderMinutes?: number;
  url?: string;
}

/** 倒计时快照 */
export interface CountdownSnapshot {
  target: Date;
  /** 距离目标的毫秒数，已过期则为负 */
  remainingMs: number;
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 总小时 / 总分钟，便于"还剩 37 小时"这类表述 */
  totalHours: number;
  totalMinutes: number;
  human: string;
}
