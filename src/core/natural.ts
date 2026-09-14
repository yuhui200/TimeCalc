/**
 * 自然语言时间解析。
 *
 * 处理流程（每一步都在原文上「挖空」已识别的片段，避免重复匹配）：
 *   1. 归一化：全角转半角、统一分隔符
 *   2. 中文相对日期：今天 / 下周五 / 3 天后 / 2026年9月14日 …
 *   3. 剩余文本交给 chrono-node（zh + en）兜底，覆盖英文与复杂表述
 *   4. 时刻：15:00 / 下午 3 点 / 中午
 *   5. 时长：2h30m / 2 小时 30 分钟 / 3d
 *   6. 运算符：+ - 加 减 后 前
 *   7. 判定意图并组装结果
 *
 * 关键点：必须在提取时长**之前**把日期片段挖掉，否则
 * 「2026年9月14日」会被时长解析器读成 {years:2026, months:9, days:14}。
 */
import * as chrono from 'chrono-node';
import dayjs from './dayjs';
import { compactDuration, UNIT_ALIASES, UNIT_ALIASES_BY_LENGTH } from './duration';
import { convertWallClock, findZone } from './timezone';
import { convertEpoch, parseEpochInput } from './unix';
import type { Duration, NaturalParse, ZoneInfo } from './types';

// ---------------------------------------------------------------------------
// 归一化
// ---------------------------------------------------------------------------

const FULLWIDTH_MAP: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '：': ':', '＋': '+', '－': '-', '～': '~', '〜': '~',
  '（': '(', '）': ')', '，': ',', '　': ' ',
};

export function normalizeText(input: string): string {
  return input
    .replace(/[０-９：＋－～〜（），　]/g, (c) => FULLWIDTH_MAP[c] ?? c)
    .replace(/[—–─]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 把 [start, end) 区间替换成等长空格，保持后续匹配的下标不变 */
function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

// ---------------------------------------------------------------------------
// 中文日期
// ---------------------------------------------------------------------------

interface Match {
  index: number;
  length: number;
  date: Date;
  hasTime: boolean;
  source: string;
}

const WEEKDAY_CN: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  日: 0, 天: 0, 七: 0, 末: 6,
};

const DAY_PERIOD: Record<string, number> = {
  凌晨: 0, 早上: 0, 早晨: 0, 上午: 0, 中午: 12, 正午: 12,
  下午: 12, 傍晚: 12, 晚上: 12, 夜里: 12, 夜晚: 12, 半夜: 0, 深夜: 0,
};

/** ISO 周：周一为一周之始 */
function isoWeekStart(ref: Date): dayjs.Dayjs {
  return dayjs(ref).startOf('isoWeek');
}

/** 把「周X」映射到某个基准周内的具体日期 */
function weekdayInWeek(base: dayjs.Dayjs, weekday: number): dayjs.Dayjs {
  return base.add(weekday === 0 ? 6 : weekday - 1, 'day');
}

/** 从文本中抽取「HH:mm」或「下午3点」形式的时刻，返回分钟数 */
export function extractTimeOfDay(text: string): { minutes: number; index: number; length: number; text: string } | null {
  // 1) HH:mm(:ss)
  const colon = text.match(/(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/);
  if (colon) {
    const h = Number(colon[1]);
    if (h <= 23) {
      return {
        minutes: h * 60 + Number(colon[2]),
        index: colon.index ?? 0,
        length: colon[0].length,
        text: colon[0],
      };
    }
  }

  // 2) 上午/下午 + N点(N分)
  const periodPattern = /(凌晨|早上|早晨|上午|中午|正午|下午|傍晚|晚上|夜里|夜晚|半夜|深夜)?\s*(\d{1,2})\s*(?:点|时|:|：)\s*(?:(\d{1,2})\s*分?|半)?/;
  const m = text.match(periodPattern);
  if (m && (m[2] !== undefined)) {
    const hasPeriod = Boolean(m[1]);
    const hasMarker = /点|时|分|半/.test(m[0]);
    if (hasPeriod || hasMarker) {
      let hour = Number(m[2]);
      const minute = m[3] !== undefined ? Number(m[3]) : /半/.test(m[0]) ? 30 : 0;
      if (minute > 59 || hour > 23) return null;

      const period = m[1] ? DAY_PERIOD[m[1]] : undefined;
      if (period !== undefined) {
        if (period === 12 && hour < 12) hour += 12; // 下午3点 -> 15
        if (period === 0 && hour === 12) hour = 0; // 凌晨12点 -> 00
      }
      if (hour > 23) return null;

      return {
        minutes: hour * 60 + minute,
        index: m.index ?? 0,
        length: m[0].length,
        text: m[0],
      };
    }
  }

  // 3) 中午 / 半夜 单独出现
  const bare = text.match(/(凌晨|早上|上午|中午|正午|下午|傍晚|晚上|半夜|深夜)/);
  if (bare) {
    const base = DAY_PERIOD[bare[1]] ?? 0;
    return {
      minutes: (bare[1] === '中午' || bare[1] === '正午' ? 12 : base) * 60,
      index: bare.index ?? 0,
      length: bare[0].length,
      text: bare[0],
    };
  }

  return null;
}

/**
 * 中文相对/绝对日期识别。
 * 返回按出现位置排序、互不重叠的匹配列表。
 */
export function extractChineseDates(text: string, ref: Date): Match[] {
  const out: Match[] = [];
  const base = dayjs(ref);

  const tryPush = (index: number, matched: string, date: dayjs.Dayjs, hasTime: boolean) => {
    if (out.some((m) => index < m.index + m.length && m.index < index + matched.length)) return;
    out.push({ index, length: matched.length, date: date.toDate(), hasTime, source: matched });
  };

  /**
   * granularity 决定结果是否截断到当天零点：
   *   'day'   —— 「下周五」「2026年9月14日」只关心日期，必须归零，
   *              否则会把参照时刻（如 10:00）带进结果
   *   'exact' —— 「3小时后」保留了时刻信息，不能归零
   */
  const patterns: {
    re: RegExp;
    granularity: 'day' | 'exact';
    build: (m: RegExpMatchArray, at: dayjs.Dayjs) => { date: dayjs.Dayjs; hasTime?: boolean } | null;
  }[] = [
    // 前天 / 昨天 / 今天 / 明天 / 后天 / 大后天
    {
      re: /(大后天|大前天|后天|前天|昨天|昨日|今天|今日|明天|明日|明儿)/g,
      granularity: 'day',
      build: (m, at) => {
        const map: Record<string, number> = {
          大后天: 3, 后天: 2, 明天: 1, 明日: 1, 明儿: 1,
          今天: 0, 今日: 0, 昨天: -1, 昨日: -1, 前天: -2, 大前天: -3,
        };
        const offset = map[m[1]];
        return offset === undefined ? null : { date: at.add(offset, 'day') };
      },
    },

    // 下周X / 下星期X / 下礼拜X
    {
      re: /(下|下个|下一|上|上个|上一|这|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天七末])/g,
      granularity: 'day',
      build: (m, at) => {
        const prefix = m[1] ?? '';
        const weekday = WEEKDAY_CN[m[2]];
        if (weekday === undefined) return null;

        let weekBase = isoWeekStart(at.toDate());
        let explicitWeek = true;

        if (prefix.startsWith('下')) weekBase = weekBase.add(1, 'week');
        else if (prefix.startsWith('上')) weekBase = weekBase.subtract(1, 'week');
        else if (prefix === '这' || prefix === '本') weekBase = weekBase;
        else explicitWeek = false;

        let date = weekdayInWeek(weekBase, weekday);

        // 没有周次前缀时（裸「周五」），若本周该日已过则顺延到下周，
        // 符合"约个时间"的口语直觉
        if (!explicitWeek && date.startOf('day').isBefore(at.startOf('day'))) {
          date = date.add(1, 'week');
        }
        return { date };
      },
    },

    // N 天后 / N 周后 / N 个月后 / N 年后（含"之后""以前"）
    {
      re: /(\d+(?:\.\d+)?)\s*(年|个月|月|周|星期|礼拜|天|日|小时|分钟)\s*(之后|以后|后|之前|以前|前)/g,
      // 日期单位归零，小时/分钟必须保留时刻
      granularity: 'exact',
      build: (m, at) => {
        const n = Number(m[1]);
        const unit = UNIT_ALIASES[m[2]];
        if (!unit || !Number.isFinite(n)) return null;
        const sign = /前/.test(m[3]) ? -1 : 1;
        const moved = at.add(sign * n, unit);
        const isDateUnit = ['years', 'months', 'weeks', 'days'].includes(unit);
        return { date: isDateUnit ? moved.startOf('day') : moved };
      },
    },

    // 2026年9月14日 / 2026年9月 / 9月14日 / 9月
    {
      re: /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?|(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g,
      granularity: 'day',
      build: (m, at) => {
        if (m[1]) {
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = m[3] ? Number(m[3]) : 1;
          if (month < 1 || month > 12 || day < 1 || day > 31) return null;
          return { date: dayjs(new Date(year, month - 1, day)) };
        }
        const month = Number(m[4]);
        const day = Number(m[5]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        let candidate = dayjs(new Date(at.year(), month - 1, day));
        // 「9月14日」在今年已过时，通常指明年
        if (candidate.startOf('day').isBefore(at.startOf('day'))) {
          candidate = dayjs(new Date(at.year() + 1, month - 1, day));
        }
        return { date: candidate };
      },
    },

    // 2026-09-14 / 2026/09/14 / 09-14
    {
      re: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g,
      granularity: 'day',
      build: (m) => {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return { date: dayjs(new Date(year, month - 1, day)) };
      },
    },

    // 9/14（无年份，月/日）
    {
      re: /(?<![\d-])(\d{1,2})\/(\d{1,2})(?![\d/])/g,
      granularity: 'day',
      build: (m, at) => {
        const month = Number(m[1]);
        const day = Number(m[2]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        let candidate = dayjs(new Date(at.year(), month - 1, day));
        if (candidate.startOf('day').isBefore(at.startOf('day'))) {
          candidate = dayjs(new Date(at.year() + 1, month - 1, day));
        }
        return { date: candidate };
      },
    },
  ];

  for (const { re, build, granularity } of patterns) {
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      const built = build(m, base);
      if (!built) continue;

      // 同一个日期表达式后面紧跟的时刻一并吃掉（"下周五 15:00"）
      const rest = text.slice(index + m[0].length);
      const time = extractTimeOfDay(rest.slice(0, 12));
      let date = granularity === 'day' ? built.date.startOf('day') : built.date;
      let length = m[0].length;
      let hasTime = false;

      if (time && time.index === 0) {
        date = built.date.startOf('day').add(time.minutes, 'minute');
        length += time.length;
        hasTime = true;
      } else if (time && /^\s/.test(rest) && rest.slice(0, time.index).trim() === '') {
        date = built.date.startOf('day').add(time.minutes, 'minute');
        length += time.index + time.length;
        hasTime = true;
      }

      tryPush(index, text.slice(index, index + length), date, hasTime);
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// chrono-node 兜底
// ---------------------------------------------------------------------------

function extractChronoDates(text: string, ref: Date): Match[] {
  const out: Match[] = [];
  const engines = [chrono.zh, chrono.en].filter(Boolean);

  for (const engine of engines) {
    let results: chrono.ParsedResult[] = [];
    try {
      results = engine.parse(text, ref, { forwardDate: true });
    } catch {
      continue;
    }

    for (const r of results) {
      const index = r.index;
      const length = r.text.length;
      if (out.some((m) => index < m.index + m.length && m.index < index + length)) continue;

      const date = r.start.date();
      if (!date || Number.isNaN(date.getTime())) continue;

      const hasTime = r.start.isCertain('hour');
      out.push({ index, length, date, hasTime, source: r.text });
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// 时长与运算符
// ---------------------------------------------------------------------------

/**
 * 从文本中抽取全部时长片段。
 *
 * 单位按长度降序排列在正则里，因此 'min' 不会被 'm' 抢先匹配。
 * 尾部前瞻只排除「后面还跟着字母」的情况（如 'min' 里的 'm'），
 * **不能**排除数字——否则 '2h30m' 里的 '2h' 会被误判为不完整而丢弃。
 */
export function extractDurations(text: string): { duration: Duration; index: number; length: number; text: string }[] {
  const units = UNIT_ALIASES_BY_LENGTH.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`([+-]?\\d+(?:\\.\\d+)?)\\s*(${units})(?![a-zA-Z])`, 'gi');

  const out: { duration: Duration; index: number; length: number; text: string }[] = [];
  for (const m of text.matchAll(re)) {
    const value = Number(m[1]);
    const unit = UNIT_ALIASES[m[2].toLowerCase()];
    if (!unit || !Number.isFinite(value)) continue;
    out.push({
      duration: { [unit]: value },
      index: m.index ?? 0,
      length: m[0].length,
      text: m[0],
    });
  }
  return out;
}

/** 判定加减方向 */
export function detectSign(text: string): 1 | -1 {
  if (/[-−]|减去|减掉|往前|向前|之前|以前|提前|前\b/.test(text)) return -1;
  if (/[+]|加上|加|之后|以后|往后|向后|推迟|延后|后\b/.test(text)) return 1;
  // 中文里"3天后"的"后"已被日期解析吃掉，这里只剩纯运算符场景
  if (/后|after|later/i.test(text)) return 1;
  if (/前|before|ago|earlier/i.test(text)) return -1;
  return 1;
}

// ---------------------------------------------------------------------------
// 时区识别
// ---------------------------------------------------------------------------

const ZONE_HINT_WORDS = ['时区', '时间', '转', '换算', '对应', '当地', '->', '→', 'to', 'timezone', 'tz'];

function extractZones(text: string): { zone: ZoneInfo; index: number }[] {
  const candidates: { zone: ZoneInfo; index: number }[] = [];
  const haystack = text.toLowerCase();

  // 按位置扫描，优先取靠前的匹配
  const zoneIds = new Set<string>();
  const probe = [
    'utc', 'gmt', '北京', '上海', '中国', '香港', '台北', '东京', '日本', '首尔', '韩国',
    '新加坡', '曼谷', '印度', '新德里', '迪拜', '伦敦', '英国', '巴黎', '法国', '柏林', '德国',
    '莫斯科', '俄罗斯', '伊斯坦布尔', '纽约', '美东', '芝加哥', '丹佛', '洛杉矶', '旧金山',
    '美西', '温哥华', '多伦多', '墨西哥', '圣保罗', '巴西', '悉尼', '珀斯', '奥克兰', '新西兰',
    '开罗', '埃及', 'beijing', 'shanghai', 'tokyo', 'london', 'newyork', 'new york',
    'losangeles', 'los angeles', 'paris', 'berlin', 'sydney', 'dubai', 'singapore',
  ];

  for (const token of probe) {
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(token, from);
      if (idx === -1) break;
      if (!zoneIds.has(token)) {
        const zone = findZone(token);
        if (zone) {
          candidates.push({ zone, index: idx });
          zoneIds.add(token);
        }
      }
      from = idx + token.length;
    }
  }

  // 去重同一个时区，按出现位置排序
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => a.index - b.index)
    .filter((c) => {
      if (seen.has(c.zone.id)) return false;
      seen.add(c.zone.id);
      return true;
    });
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export interface NaturalDebug {
  normalized: string;
  dates: Match[];
  times: { minutes: number; index: number; text: string }[];
  durations: { text: string; duration: Duration }[];
  sign: 1 | -1;
  zones: ZoneInfo[];
}

export interface NaturalParseResult {
  parse: NaturalParse;
  debug: NaturalDebug;
}

/** 带调试信息的完整解析，UI 可展示"我读到了什么" */
export function parseNaturalDetailed(rawInput: string, ref: Date = new Date()): NaturalParseResult {
  const normalized = normalizeText(rawInput);
  const empty: NaturalDebug = {
    normalized,
    dates: [],
    times: [],
    durations: [],
    sign: 1,
    zones: [],
  };

  if (!normalized) return { parse: { kind: 'empty' }, debug: empty };

  // 1) 中文日期（可能连带吃掉紧随其后的时刻，如「下周五 15:00」）
  let working = normalized;
  const cnDates = extractChineseDates(working, ref);
  for (const d of cnDates) working = blank(working, d.index, d.index + d.length);

  // 2) 时刻。必须在 chrono 之前：chrono 会把孤立的「15:00」也解析成一个日期，
  //    从而把「下周五 15:00 + 2h30m」污染成两个日期。
  const times: { minutes: number; index: number; length: number; text: string }[] = [];
  for (;;) {
    const t = extractTimeOfDay(working);
    if (!t) break;
    times.push(t);
    working = blank(working, t.index, t.index + t.length);
  }
  times.sort((a, b) => a.index - b.index);

  // 3) 运算符。必须在挖掉时长之前判定——正负号是时长片段的一部分
  const sign = detectSign(working);

  // 4) 时长。此时日期与时刻都已挖空，「2026年9月14日」不会被读成 {years:2026,...}
  const durations = extractDurations(working);
  for (const d of durations) working = blank(working, d.index, d.index + d.length);

  // 5) chrono 兜底：只剩没被日期/时刻/时长认领的散文（英文日期、复杂表述）
  const chronoDates = extractChronoDates(working, ref);
  const dates: Match[] = [...cnDates, ...chronoDates].sort((a, b) => a.index - b.index);

  // 6) 时区
  const zones = extractZones(normalized);

  const debug: NaturalDebug = {
    normalized,
    dates,
    times: times.map((t) => ({ minutes: t.minutes, index: t.index, text: t.text })),
    durations: durations.map((d) => ({ text: d.text, duration: d.duration })),
    sign,
    zones: zones.map((z) => z.zone),
  };

  const mergedDuration = compactDuration(
    durations.reduce<Duration>((acc, d) => {
      for (const [k, v] of Object.entries(d.duration) as [keyof Duration, number][]) {
        acc[k] = (acc[k] ?? 0) + v;
      }
      return acc;
    }, {}),
  );

  // ---- 意图判定 ----

  // A. Unix 时间戳
  if (/时间戳|timestamp|epoch|unix/i.test(normalized)) {
    const numberMatch = normalized.match(/-?\d{6,}/);
    if (numberMatch) {
      const parsed = parseEpochInput(numberMatch[0]);
      if (parsed) {
        const converted = convertEpoch(parsed.value, parsed.unit);
        if (converted) return { parse: { kind: 'unix', epochMs: converted.epochMs, raw: rawInput }, debug };
      }
    }
  }

  // B. 时区换算：至少两个时区 + 转换语气 + 至多一个日期
  if (zones.length >= 2 && dates.length <= 1) {
    const hasConversionTone =
      ZONE_HINT_WORDS.some((w) => normalized.toLowerCase().includes(w)) || zones.length >= 2;
    if (hasConversionTone) {
      const [from, to] = zones;
      const sourceDate = dates[0]?.date ?? ref;
      const hours = times[0]?.minutes ?? dayjs(sourceDate).hour() * 60 + dayjs(sourceDate).minute();
      const wall = dayjs(sourceDate).startOf('day').add(hours, 'minute');
      const wallText = wall.format('YYYY-MM-DD HH:mm');
      if (convertWallClock(wallText, from.zone.id, to.zone.id)) {
        return {
          parse: { kind: 'timezone', date: wall.toDate(), from: from.zone, to: to.zone, raw: rawInput },
          debug,
        };
      }
    }
  }

  // C. 工作日统计
  if (/工作日|business\s*days?/i.test(normalized) && dates.length >= 2) {
    return {
      parse: { kind: 'workday-diff', start: dates[0].date, end: dates[1].date, raw: rawInput },
      debug,
    };
  }

  // D. 日期加减：有日期 + 有时长
  if (dates.length >= 1 && !isEmptyDuration(mergedDuration)) {
    const base = dates[0];
    const withTime = applyTime(base.date, base.hasTime, times[0]?.minutes);
    return {
      parse: {
        kind: 'add',
        base: withTime,
        duration: mergedDuration,
        sign,
        hasTime: base.hasTime || times.length > 0,
        raw: rawInput,
      },
      debug,
    };
  }

  // E. 日期差：两个日期
  if (dates.length >= 2) {
    return { parse: { kind: 'date-diff', start: dates[0].date, end: dates[1].date, raw: rawInput }, debug };
  }

  // F. 时间差：两个时刻、无日期
  if (dates.length === 0 && times.length >= 2) {
    return {
      parse: { kind: 'time-diff', start: times[0].text, end: times[1].text, raw: rawInput },
      debug,
    };
  }

  // G. 单日期
  if (dates.length === 1) {
    const base = dates[0];
    return {
      parse: {
        kind: 'single',
        date: applyTime(base.date, base.hasTime, times[0]?.minutes),
        hasTime: base.hasTime || times.length > 0,
        raw: rawInput,
      },
      debug,
    };
  }

  // H. 只有时刻：按今天处理
  if (times.length === 1) {
    return {
      parse: {
        kind: 'single',
        date: dayjs(ref).startOf('day').add(times[0].minutes, 'minute').toDate(),
        hasTime: true,
        raw: rawInput,
      },
      debug,
    };
  }

  // I. 纯时长：无日期无时刻，视为"从现在起 +N"
  if (!isEmptyDuration(mergedDuration)) {
    return {
      parse: {
        kind: 'add',
        base: ref,
        duration: mergedDuration,
        sign,
        hasTime: true,
        raw: rawInput,
      },
      debug,
    };
  }

  return {
    parse: {
      kind: 'unknown',
      reason: '没有识别出日期、时刻或时长。可以试试「下周五 15:00 + 2h30m」或「2026-01-01 到 2026-09-14 多少个工作日」。',
      raw: rawInput,
    },
    debug,
  };
}

/** 便捷入口：只要结果，不要调试信息 */
export function parseNatural(rawInput: string, ref: Date = new Date()): NaturalParse {
  return parseNaturalDetailed(rawInput, ref).parse;
}

function isEmptyDuration(d: Duration): boolean {
  return Object.values(d).every((v) => !v);
}

function applyTime(date: Date, hasTime: boolean, minutes: number | undefined): Date {
  if (hasTime) return date; // 日期解析时已带上时刻
  const base = dayjs(date).startOf('day');
  return (minutes === undefined ? base : base.add(minutes, 'minute')).toDate();
}

// ---------------------------------------------------------------------------
// 示例与提示
// ---------------------------------------------------------------------------

export const NATURAL_EXAMPLES: readonly string[] = [
  '下周五 15:00 + 2h30m',
  '2026-01-01 到 2026-09-14 多少个工作日',
  '今天 +30 天',
  '3 天后是几号',
  '明天 9:00 到 18:30 差多久',
  '北京时间 2026-09-14 15:00 转纽约',
  '时间戳 1757836800',
  '2026年9月14日',
] as const;

/** 给出「意图」的中文名，供 UI 显示 */
export function describeIntent(parse: NaturalParse): string {
  switch (parse.kind) {
    case 'empty':
      return '等待输入';
    case 'single':
      return '日期解析';
    case 'date-diff':
      return '日期差';
    case 'workday-diff':
      return '工作日统计';
    case 'add':
      return parse.sign === 1 ? '日期加' : '日期减';
    case 'time-diff':
      return '时间差';
    case 'timezone':
      return '时区转换';
    case 'unix':
      return '时间戳';
    default:
      return '未识别';
  }
}
