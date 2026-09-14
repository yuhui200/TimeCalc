/**
 * 时区转换。
 *
 * 两个核心概念必须分清：
 *   - 绝对时刻（instant）：地球上唯一的时间点，用 epochMs 表示，与观察者无关
 *   - 墙上时钟（wall clock）：某个时区里钟表显示的数字
 *
 * `convertInstant`   —— 把一个绝对时刻渲染到两个时区
 * `convertWallClock` —— 把「A 时区的钟表读数」换算成「B 时区会是几点」
 *
 * 夏令时（DST）由 IANA 数据库自动处理；春季跳变导致的「不存在的时刻」
 * 会被 dayjs 规整到跳变后的第一个有效时刻。
 */
import dayjs from './dayjs';
import { DATE_FMT, DATETIME_FMT, DATETIME_SEC_FMT, TIME_FMT } from './format';
import type { DateInput, TimeZoneConversion, TimeZoneId, ZoneInfo } from './types';

/**
 * 常用时区表。任何 IANA 标识符都能直接传给 dayjs，
 * 这张表只是为了给 UI 提供中文名与搜索别名。
 */
export const ZONES: readonly ZoneInfo[] = [
  { id: 'UTC', label: '协调世界时', labelEn: 'UTC', emoji: 'UTC', aliases: ['utc', 'gmt', '世界时', '格林威治', '格林尼治'] },

  { id: 'Asia/Shanghai', label: '北京', labelEn: 'Beijing', emoji: 'CN', aliases: ['beijing', 'shanghai', '北京', '上海', '中国', 'china', 'cst'] },
  { id: 'Asia/Hong_Kong', label: '香港', labelEn: 'Hong Kong', emoji: 'HK', aliases: ['hongkong', 'hong kong', '香港', 'hkt'] },
  { id: 'Asia/Taipei', label: '台北', labelEn: 'Taipei', emoji: 'TW', aliases: ['taipei', '台北', '台湾'] },
  { id: 'Asia/Tokyo', label: '东京', labelEn: 'Tokyo', emoji: 'JP', aliases: ['tokyo', '东京', '日本', 'japan', 'jst'] },
  { id: 'Asia/Seoul', label: '首尔', labelEn: 'Seoul', emoji: 'KR', aliases: ['seoul', '首尔', '韩国', 'korea', 'kst'] },
  { id: 'Asia/Singapore', label: '新加坡', labelEn: 'Singapore', emoji: 'SG', aliases: ['singapore', '新加坡', 'sgt'] },
  { id: 'Asia/Bangkok', label: '曼谷', labelEn: 'Bangkok', emoji: 'TH', aliases: ['bangkok', '曼谷', '泰国'] },
  { id: 'Asia/Kolkata', label: '新德里', labelEn: 'New Delhi', emoji: 'IN', aliases: ['delhi', 'mumbai', 'india', '印度', '新德里', 'ist'] },
  { id: 'Asia/Dubai', label: '迪拜', labelEn: 'Dubai', emoji: 'AE', aliases: ['dubai', '迪拜', '阿联酋'] },
  { id: 'Asia/Jerusalem', label: '耶路撒冷', labelEn: 'Jerusalem', emoji: 'IL', aliases: ['israel', '以色列', '耶路撒冷'] },

  { id: 'Europe/London', label: '伦敦', labelEn: 'London', emoji: 'UK', aliases: ['london', '伦敦', '英国', 'uk', 'britain', 'gmt', 'bst'] },
  { id: 'Europe/Paris', label: '巴黎', labelEn: 'Paris', emoji: 'FR', aliases: ['paris', '巴黎', '法国'] },
  { id: 'Europe/Berlin', label: '柏林', labelEn: 'Berlin', emoji: 'DE', aliases: ['berlin', '柏林', '德国', 'frankfurt'] },
  { id: 'Europe/Amsterdam', label: '阿姆斯特丹', labelEn: 'Amsterdam', emoji: 'NL', aliases: ['amsterdam', '荷兰'] },
  { id: 'Europe/Madrid', label: '马德里', labelEn: 'Madrid', emoji: 'ES', aliases: ['madrid', '西班牙'] },
  { id: 'Europe/Moscow', label: '莫斯科', labelEn: 'Moscow', emoji: 'RU', aliases: ['moscow', '莫斯科', '俄罗斯'] },
  { id: 'Europe/Istanbul', label: '伊斯坦布尔', labelEn: 'Istanbul', emoji: 'TR', aliases: ['istanbul', 'turkey', '土耳其'] },

  { id: 'America/New_York', label: '纽约', labelEn: 'New York', emoji: 'US', aliases: ['newyork', 'new york', '纽约', '美东', 'est', 'edt', 'boston', 'washington'] },
  { id: 'America/Chicago', label: '芝加哥', labelEn: 'Chicago', emoji: 'US', aliases: ['chicago', '芝加哥', '美中', 'cst', 'cdt', 'dallas'] },
  { id: 'America/Denver', label: '丹佛', labelEn: 'Denver', emoji: 'US', aliases: ['denver', '丹佛', 'mst', 'mdt'] },
  { id: 'America/Los_Angeles', label: '洛杉矶', labelEn: 'Los Angeles', emoji: 'US', aliases: ['losangeles', 'los angeles', '洛杉矶', '旧金山', 'sanfrancisco', '美西', 'pst', 'pdt', 'seattle'] },
  { id: 'America/Vancouver', label: '温哥华', labelEn: 'Vancouver', emoji: 'CA', aliases: ['vancouver', '温哥华', '加拿大'] },
  { id: 'America/Toronto', label: '多伦多', labelEn: 'Toronto', emoji: 'CA', aliases: ['toronto', '多伦多'] },
  { id: 'America/Mexico_City', label: '墨西哥城', labelEn: 'Mexico City', emoji: 'MX', aliases: ['mexico', '墨西哥'] },
  { id: 'America/Sao_Paulo', label: '圣保罗', labelEn: 'Sao Paulo', emoji: 'BR', aliases: ['saopaulo', 'brazil', '巴西', '圣保罗'] },
  { id: 'America/Argentina/Buenos_Aires', label: '布宜诺斯艾利斯', labelEn: 'Buenos Aires', emoji: 'AR', aliases: ['argentina', '阿根廷'] },

  { id: 'Australia/Sydney', label: '悉尼', labelEn: 'Sydney', emoji: 'AU', aliases: ['sydney', '悉尼', '澳大利亚', 'aest'] },
  { id: 'Australia/Perth', label: '珀斯', labelEn: 'Perth', emoji: 'AU', aliases: ['perth', '珀斯'] },
  { id: 'Pacific/Auckland', label: '奥克兰', labelEn: 'Auckland', emoji: 'NZ', aliases: ['auckland', '奥克兰', '新西兰'] },

  { id: 'Africa/Cairo', label: '开罗', labelEn: 'Cairo', emoji: 'EG', aliases: ['cairo', '埃及', '开罗'] },
  { id: 'Africa/Johannesburg', label: '约翰内斯堡', labelEn: 'Johannesburg', emoji: 'ZA', aliases: ['johannesburg', '南非'] },
  { id: 'Africa/Lagos', label: '拉各斯', labelEn: 'Lagos', emoji: 'NG', aliases: ['lagos', '尼日利亚'] },
] as const;

/** UI 上默认展示在「世界时钟」面板的时区 */
export const DEFAULT_BOARD_ZONES: readonly TimeZoneId[] = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

const ZONE_BY_ID = new Map<string, ZoneInfo>(ZONES.map((z) => [z.id, z]));

/** 判断字符串是否是浏览器/Node 认可的合法 IANA 时区 */
export function isValidTimeZone(id: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/** 为任意 IANA id 合成一个 ZoneInfo（表里没有时使用） */
export function makeZoneInfo(id: string): ZoneInfo {
  const known = ZONE_BY_ID.get(id);
  if (known) return known;
  const city = id.split('/').pop() ?? id;
  return {
    id,
    label: city.replace(/_/g, ' '),
    labelEn: city.replace(/_/g, ' '),
    emoji: id.split('/')[0]?.slice(0, 2).toUpperCase() ?? 'TZ',
    aliases: [id.toLowerCase(), city.toLowerCase().replace(/_/g, ' ')],
  };
}

/** 按 id / 中文名 / 英文名 / 别名查找时区 */
export function findZone(query: string): ZoneInfo | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = ZONES.find(
    (z) =>
      z.id.toLowerCase() === q ||
      z.label.toLowerCase() === q ||
      z.labelEn.toLowerCase() === q ||
      z.aliases.some((a) => a.toLowerCase() === q),
  );
  if (exact) return exact;

  const partial = ZONES.find(
    (z) =>
      z.id.toLowerCase().includes(q) ||
      z.label.includes(query.trim()) ||
      z.labelEn.toLowerCase().includes(q) ||
      z.aliases.some((a) => a.toLowerCase().includes(q)),
  );
  if (partial) return partial;

  // 直接当 IANA id 试试
  if (isValidTimeZone(query.trim())) return makeZoneInfo(query.trim());
  return null;
}

/** 时区搜索（供命令面板使用） */
export function searchZones(query: string, limit = 8): ZoneInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return ZONES.slice(0, limit);

  const scored = ZONES.map((z) => {
    let score = 0;
    if (z.id.toLowerCase() === q) score = 100;
    else if (z.label.includes(query.trim())) score = 90;
    else if (z.labelEn.toLowerCase() === q) score = 85;
    else if (z.aliases.some((a) => a.toLowerCase() === q)) score = 80;
    else if (z.id.toLowerCase().includes(q)) score = 50;
    else if (z.aliases.some((a) => a.toLowerCase().includes(q))) score = 40;
    return { z, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.z);
}

/** 本机时区（浏览器 / Tauri / Capacitor 均可用） */
export function getLocalZone(): ZoneInfo {
  const id = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return makeZoneInfo(id);
}

/** 某个绝对时刻在指定时区的 UTC 偏移（分钟） */
export function zoneOffsetMinutes(instant: DateInput, zone: TimeZoneId): number {
  const d = dayjs(instant).tz(zone);
  return d.isValid() ? d.utcOffset() : 0;
}

/** 把偏移分钟数格式化为 'UTC+08:00' */
export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

/**
 * 时区缩写（CST / EST / PDT …）。
 * 从 Intl 的 timeZoneName: 'short' 取，取不到时回落到 'UTC+08:00'。
 */
export function zoneAbbr(instant: DateInput, zone: TimeZoneId): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(dayjs(instant).toDate());
    const name = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (name) return name;
  } catch {
    /* 退回到偏移量表示 */
  }
  return formatOffset(zoneOffsetMinutes(instant, zone));
}

/** 某个绝对时刻在指定时区的墙上时钟 */
export function wallClockOf(instant: DateInput, zone: TimeZoneId): Date {
  const d = dayjs(instant).tz(zone);
  return d.isValid() ? d.toDate() : dayjs(instant).toDate();
}

/** 在指定时区格式化 */
export function formatInZone(instant: DateInput, zone: TimeZoneId, pattern = DATETIME_FMT): string {
  const d = dayjs(instant).tz(zone);
  return d.isValid() ? d.format(pattern) : '—';
}

/** 'HH:mm' */
export function timeInZone(instant: DateInput, zone: TimeZoneId): string {
  return formatInZone(instant, zone, TIME_FMT);
}

/** 'YYYY-MM-DD' */
export function dateInZone(instant: DateInput, zone: TimeZoneId): string {
  return formatInZone(instant, zone, DATE_FMT);
}

/** 由「某时区的墙上时钟」求出绝对时刻 */
export function instantFromWallClock(wallClock: string, zone: TimeZoneId): Date | null {
  const d = dayjs.tz(wallClock, zone);
  return d.isValid() ? d.toDate() : null;
}

/**
 * 核心：把绝对时刻同时渲染到两个时区。
 *
 *   convertInstant(new Date(), 'Asia/Shanghai', 'America/New_York')
 */
export function convertInstant(
  instant: DateInput,
  fromZone: TimeZoneId,
  toZone: TimeZoneId,
): TimeZoneConversion | null {
  const base = dayjs(instant);
  if (!base.isValid()) return null;

  const fromWall = base.tz(fromZone);
  const toWall = base.tz(toZone);
  if (!fromWall.isValid() || !toWall.isValid()) return null;

  const fromOffset = fromWall.utcOffset();
  const toOffset = toWall.utcOffset();

  return {
    from: {
      zone: makeZoneInfo(fromZone),
      date: fromWall.toDate(),
      formatted: fromWall.format(DATETIME_SEC_FMT),
      offsetMinutes: fromOffset,
    },
    to: {
      zone: makeZoneInfo(toZone),
      date: toWall.toDate(),
      formatted: toWall.format(DATETIME_SEC_FMT),
      offsetMinutes: toOffset,
    },
    epochMs: base.valueOf(),
    offsetDeltaHours: (toOffset - fromOffset) / 60,
    dayShift: toWall.startOf('day').diff(fromWall.startOf('day'), 'day'),
  };
}

/**
 * 把「A 时区的钟表读数」换算到 B 时区。
 *
 *   convertWallClock('2026-09-14 15:00', 'Asia/Shanghai', 'America/New_York')
 *     -> 纽约时间 2026-09-14 03:00（EDT，-12 小时）
 */
export function convertWallClock(
  wallClock: string,
  fromZone: TimeZoneId,
  toZone: TimeZoneId,
): TimeZoneConversion | null {
  const instant = instantFromWallClock(wallClock, fromZone);
  if (!instant) return null;
  return convertInstant(instant, fromZone, toZone);
}

/** 同一时刻在多时区的对照表（世界时钟面板） */
export function zoneBoard(
  instant: DateInput,
  zones: readonly TimeZoneId[] = DEFAULT_BOARD_ZONES,
): {
  zone: ZoneInfo;
  time: string;
  date: string;
  abbr: string;
  offsetMinutes: number;
  offsetLabel: string;
  isDaytime: boolean;
  dayShift: number;
}[] {
  const base = dayjs(instant);
  if (!base.isValid()) return [];
  const baseDate = base.tz(zones[0] ?? 'UTC').startOf('day');

  return zones.map((id) => {
    const d = base.tz(id);
    const zone = makeZoneInfo(id);
    const offsetMinutes = d.utcOffset();
    const hour = d.hour();
    return {
      zone,
      time: d.format(TIME_FMT),
      date: d.format(DATE_FMT),
      abbr: zoneAbbr(instant, id),
      offsetMinutes,
      offsetLabel: formatOffset(offsetMinutes),
      isDaytime: hour >= 7 && hour < 19,
      dayShift: d.startOf('day').diff(baseDate, 'day'),
    };
  });
}

/**
 * 找出重叠的工作时段。
 * 例：北京 9:00–18:00 与纽约 9:00–18:00，什么时候双方都在上班？
 * 返回以「第一个时区」的本地时间表示的时段列表。
 */
export function overlappingWorkHours(
  instant: DateInput,
  zones: readonly TimeZoneId[],
  workStartHour = 9,
  workEndHour = 18,
): { startHour: number; endHour: number }[] {
  const base = dayjs(instant);
  if (!base.isValid() || zones.length === 0) return [];

  const refZone = zones[0];
  const refStart = base.tz(refZone).startOf('day');

  const inWork = (hour: number): boolean =>
    zones.every((z) => {
      const local = refStart.add(hour, 'hour').tz(z);
      return local.hour() >= workStartHour && local.hour() < workEndHour;
    });

  const ranges: { startHour: number; endHour: number }[] = [];
  let runStart: number | null = null;

  for (let h = 0; h <= 24; h++) {
    const ok = h < 24 && inWork(h);
    if (ok && runStart === null) runStart = h;
    if (!ok && runStart !== null) {
      ranges.push({ startHour: runStart, endHour: h });
      runStart = null;
    }
  }
  return ranges;
}

/** 时区之间的小时差（to - from），保留半小时精度 */
export function hourDifference(fromZone: TimeZoneId, toZone: TimeZoneId, at: DateInput = new Date()): number {
  return (zoneOffsetMinutes(at, toZone) - zoneOffsetMinutes(at, fromZone)) / 60;
}

export { DATE_FMT, TIME_FMT, DATETIME_FMT, DATETIME_SEC_FMT };
