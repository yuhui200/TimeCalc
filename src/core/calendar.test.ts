import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  countWorkdays,
  isWeekend,
  isWorkday,
  listWorkdays,
  nextWorkday,
  previousWorkday,
} from './workdays';
import {
  computeUSHolidays,
  easterSunday,
  getHolidaySet,
  getHolidays,
  isHoliday,
  upcomingHolidays,
} from './holidays';
import {
  formatLunar,
  ganzhiOf,
  lunarFestival,
  lunarToSolar,
  solarTermOf,
  solarTermsOfYear,
  solarToLunar,
  zodiacOf,
} from './lunar';
import { convertInstant, convertWallClock, findZone, formatOffset, getLocalZone, hourDifference, zoneBoard, overlappingWorkHours } from './timezone';
import { buildICS, escapeICSText, foldLine, isValidICS, parseICSSummary } from './ics';
import { countdownProgress, snapshot as countdownSnapshot, endOfToday } from './countdown';

// 2026-09-14 是周一
const MON = '2026-09-14';
const FRI = '2026-09-18';
const SAT = '2026-09-19';
const SUN = '2026-09-20';

describe('workdays', () => {
  it('识别周末', () => {
    expect(isWeekend(SAT)).toBe(true);
    expect(isWeekend(SUN)).toBe(true);
    expect(isWeekend(MON)).toBe(false);
  });

  it('支持自定义周末（如周五+周六）', () => {
    expect(isWeekend('2026-09-18', [5, 6])).toBe(true);
    expect(isWeekend('2026-09-20', [5, 6])).toBe(false);
  });

  it('周一至周五含首尾共 5 个工作日', () => {
    expect(countWorkdays(MON, FRI)).toBe(5);
  });

  it('不含首尾时为 3 个', () => {
    expect(countWorkdays(MON, FRI, { inclusiveStart: false, inclusiveEnd: false })).toBe(3);
  });

  it('同一天若是工作日则为 1', () => {
    expect(countWorkdays(MON, MON)).toBe(1);
    expect(countWorkdays(SAT, SAT)).toBe(0);
  });

  it('调休上班日算作工作日', () => {
    expect(isWorkday(SAT)).toBe(false);
    expect(isWorkday(SAT, { extraWorkdays: [SAT] })).toBe(true);
  });

  it('节假日不算工作日', () => {
    expect(isWorkday(MON, { holidays: [MON] })).toBe(false);
    expect(countWorkdays(MON, FRI, { holidays: [MON, FRI] })).toBe(3);
  });

  it('加工作日跳过周末', () => {
    // 周五 + 1 个工作日 = 下周一
    expect(addWorkdays(FRI, 1).getDay()).toBe(1);
    // 周一 + 5 个工作日 = 下周一
    const r = addWorkdays(MON, 5);
    expect(r.getDay()).toBe(1);
    expect(r.getDate()).toBe(21);
  });

  it('减工作日往前跳过周末', () => {
    expect(addWorkdays(MON, -1).getDay()).toBe(5); // 上周五
  });

  it('n = 0 时顺延到最近的工作日', () => {
    expect(addWorkdays(SAT, 0).getDay()).toBe(1); // 周一
    expect(addWorkdays(MON, 0).getDay()).toBe(1); // 原地
  });

  it('next / previous 严格不含当天', () => {
    expect(nextWorkday(FRI).getDay()).toBe(1);
    expect(previousWorkday(MON).getDay()).toBe(5);
  });

  it('列出区间内工作日', () => {
    expect(listWorkdays(MON, SUN)).toHaveLength(5);
  });
});

describe('holidays', () => {
  it('美国独立日在 7 月 4 日', () => {
    const july4 = computeUSHolidays(2026).find((h) => h.name === 'Independence Day');
    expect(july4?.date).toBe('2026-07-03'); // 2026-07-04 是周六，observed 提前到周五
  });

  it('感恩节是 11 月第四个周四', () => {
    const t = computeUSHolidays(2026).find((h) => h.name === 'Thanksgiving Day');
    expect(new Date(t!.date).getDay()).toBe(4);
    expect(new Date(t!.date).getMonth()).toBe(10);
  });

  it('复活节算法（已知年份）', () => {
    // 用本地日期部分断言：算法返回的是本地零点的 Date，
    // 直接 toISOString 会因时区偏移而落到前一天
    const localISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    expect(localISO(easterSunday(2024))).toBe('2024-03-31');
    expect(localISO(easterSunday(2025))).toBe('2025-04-20');
    expect(localISO(easterSunday(2026))).toBe('2026-04-05');
  });

  it('中国官方数据含调休补班日', () => {
    const entries = getHolidays(2025, 'CN');
    expect(entries.some((e) => e.date === '2025-01-28' && e.kind === 'holiday')).toBe(true);
    expect(entries.some((e) => e.date === '2025-01-26' && e.kind === 'workday')).toBe(true);
    expect(entries.every((e) => !e.approximate)).toBe(true);
  });

  it('无官方数据时回退到推算并标记 approximate', () => {
    const entries = getHolidays(2030, 'CN');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.approximate)).toBe(true);
    // 春节必然落在 1 月下旬到 2 月中旬之间
    const spring = entries.find((e) => e.name === '春节');
    const month = new Date(spring!.date).getMonth();
    expect([0, 1]).toContain(month);
  });

  it('getHolidaySet 拆出两个集合', () => {
    const set = getHolidaySet('CN', [2025]);
    expect(set.holidays.has('2025-10-01')).toBe(true);
    expect(set.extraWorkdays.has('2025-09-28')).toBe(true);
  });

  it('NONE 地区不返回任何节假日', () => {
    expect(getHolidays(2026, 'NONE')).toEqual([]);
  });

  it('isHoliday 查询单日', () => {
    expect(isHoliday('2025-10-01', 'CN')?.name).toContain('国庆');
    expect(isHoliday('2025-10-09', 'CN')).toBeNull();
  });

  it('upcomingHolidays 返回未来的假期', () => {
    const list = upcomingHolidays('2025-01-01', 'CN', 3);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.date >= '2025-01-01').toBe(true);
  });
});

describe('lunar', () => {
  it('已知日期的农历换算', () => {
    // 2024-02-10 是农历甲辰年正月初一（春节）
    const l = solarToLunar(new Date(2024, 1, 10));
    expect(l?.month).toBe(1);
    expect(l?.day).toBe(1);
    expect(l?.isLeap).toBe(false);
    expect(l?.zodiac).toBe('龙');
  });

  it('春节往返一致', () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      const solar = lunarToSolar(year, 1, 1);
      expect(solar).not.toBeNull();
      const back = solarToLunar(solar!);
      expect(back?.month).toBe(1);
      expect(back?.day).toBe(1);
    }
  });

  it('农历日中文名', () => {
    const l = solarToLunar(new Date(2024, 1, 10));
    expect(l?.text).toContain('正月初一');
  });

  it('干支与生肖', () => {
    expect(ganzhiOf(2024)).toBe('甲辰');
    expect(zodiacOf(2024)).toBe('龙');
    expect(ganzhiOf(2026)).toBe('丙午');
    expect(zodiacOf(2026)).toBe('马');
  });

  it('二十四节气总数正确，清明在 4 月', () => {
    const terms = solarTermsOfYear(2026);
    expect(terms).toHaveLength(24);
    const qingming = terms.find((t) => t.name === '清明');
    expect(qingming?.month).toBe(4);
    expect([4, 5]).toContain(qingming?.day);
  });

  it('solarTermOf 命中当天', () => {
    const qingming = solarTermsOfYear(2026).find((t) => t.name === '清明')!;
    expect(solarTermOf(qingming.date)).toBe('清明');
    expect(solarTermOf(new Date(2026, 5, 1))).toBeNull();
  });

  it('农历节日识别', () => {
    const springFestival = lunarToSolar(2026, 1, 1)!;
    expect(lunarFestival(springFestival)).toBe('春节');
    const midAutumn = lunarToSolar(2026, 8, 15)!;
    expect(lunarFestival(midAutumn)).toBe('中秋节');
  });

  it('超出数据范围返回 null', () => {
    expect(solarToLunar(new Date(1850, 0, 1))).toBeNull();
  });

  it('formatLunar 输出中文描述', () => {
    expect(formatLunar(new Date(2024, 1, 10))).toContain('正月初一');
  });
});

describe('timezone', () => {
  it('按中文名 / 英文名 / 别名查找时区', () => {
    expect(findZone('北京')?.id).toBe('Asia/Shanghai');
    expect(findZone('newyork')?.id).toBe('America/New_York');
    expect(findZone('东京')?.id).toBe('Asia/Tokyo');
    expect(findZone('不存在的地方')).toBeNull();
  });

  it('北京比纽约快 12 或 13 小时，取决于夏令时', () => {
    // hourDifference(from, to) 的符号是 to - from，纽约在北京西边故为负
    const winter = hourDifference('Asia/Shanghai', 'America/New_York', new Date('2026-01-15T00:00:00Z'));
    const summer = hourDifference('Asia/Shanghai', 'America/New_York', new Date('2026-07-15T00:00:00Z'));
    expect(winter).toBe(-13); // 纽约 EST
    expect(summer).toBe(-12); // 纽约 EDT

    // 反向即为正
    expect(hourDifference('America/New_York', 'Asia/Shanghai', new Date('2026-01-15T00:00:00Z'))).toBe(13);
  });

  it('同一绝对时刻在两个时区墙上时钟不同', () => {
    const instant = new Date('2026-09-14T07:00:00Z'); // 北京时间 15:00
    const c = convertInstant(instant, 'Asia/Shanghai', 'America/New_York');
    expect(c?.from.formatted.startsWith('2026-09-14 15:00:00')).toBe(true);
    expect(c?.to.formatted.startsWith('2026-09-14 03:00:00')).toBe(true);
    expect(c?.offsetDeltaHours).toBe(-12);
    expect(c?.epochMs).toBe(instant.getTime());
  });

  it('墙上时钟换算跨日提示', () => {
    const c = convertWallClock('2026-09-14 15:00', 'Asia/Shanghai', 'America/New_York');
    expect(c?.to.formatted.startsWith('2026-09-14 03:00')).toBe(true);
    expect(c?.dayShift).toBe(0);

    const late = convertWallClock('2026-09-14 23:00', 'Asia/Shanghai', 'America/New_York');
    expect(late?.dayShift).toBe(0); // 23:00 北京 -> 11:00 纽约，同日
  });

  it('UTC 与北京相差 8 小时', () => {
    expect(hourDifference('UTC', 'Asia/Shanghai', new Date('2026-09-14T00:00:00Z'))).toBe(8);
  });

  it('偏移量格式化', () => {
    expect(formatOffset(480)).toBe('UTC+08:00');
    expect(formatOffset(-300)).toBe('UTC-05:00');
    expect(formatOffset(330)).toBe('UTC+05:30'); // 印度
    expect(formatOffset(345)).toBe('UTC+05:45'); // 尼泊尔
  });

  it('世界时钟面板', () => {
    const board = zoneBoard(new Date('2026-09-14T07:00:00Z'), ['Asia/Shanghai', 'UTC']);
    expect(board).toHaveLength(2);
    expect(board[0]!.time).toBe('15:00');
    expect(board[1]!.time).toBe('07:00');
    expect(board[0]!.isDaytime).toBe(true);
  });

  it('工作时间重叠区间', () => {
    const ranges = overlappingWorkHours(new Date('2026-09-14T00:00:00Z'), ['Asia/Shanghai', 'Asia/Tokyo']);
    // 北京与东京相差 1 小时，9-18 点重叠应为 9:00–17:00（以北京时间为准）
    expect(ranges[0]).toEqual({ startHour: 9, endHour: 17 });
  });

  it('getLocalZone 返回合法时区', () => {
    const z = getLocalZone();
    expect(typeof z.id).toBe('string');
    expect(z.id.length).toBeGreaterThan(0);
  });
});

describe('ics', () => {
  const event = {
    title: '项目评审',
    description: '讨论 Q4 排期',
    start: new Date('2026-09-21T06:00:00Z'),
    end: new Date('2026-09-21T07:30:00Z'),
    uid: 'test-uid-1',
    reminderMinutes: 15,
  };

  it('输出结构完整', () => {
    const ics = buildICS([event], { now: new Date('2026-09-14T00:00:00Z') });
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:test-uid-1');
    expect(ics).toContain('DTSTAMP:20260914T000000Z');
    expect(ics).toContain('DTSTART:20260921T060000Z');
    expect(ics).toContain('DTEND:20260921T073000Z');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(isValidICS(ics)).toBe(true);
  });

  it('使用 CRLF 换行', () => {
    const ics = buildICS([event]);
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('转义特殊字符', () => {
    expect(escapeICSText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('长行折行且续行以空格开头', () => {
    const long = 'SUMMARY:' + '中'.repeat(60);
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('全天事件用 DATE 值类型且结束日不含', () => {
    const ics = buildICS([{ ...event, allDay: true }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260921');
    expect(ics).toContain('DTEND;VALUE=DATE:20260922');
  });

  it('可解析回摘要', () => {
    const ics = buildICS([event], { now: new Date('2026-09-14T00:00:00Z') });
    const parsed = parseICSSummary(ics);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.summary).toBe('项目评审');
  });
});

describe('countdown', () => {
  it('计算剩余时间', () => {
    const now = new Date('2026-09-14T10:00:00');
    const s = countdownSnapshot('2026-09-16T12:30:45', now);
    expect(s?.expired).toBe(false);
    expect(s?.days).toBe(2);
    expect(s?.hours).toBe(2);
    expect(s?.minutes).toBe(30);
    expect(s?.seconds).toBe(45);
    expect(s?.human).toContain('还剩');
  });

  it('已过期时 remainingMs 为负', () => {
    const s = countdownSnapshot('2026-09-13T00:00:00', new Date('2026-09-14T00:00:00'));
    expect(s?.expired).toBe(true);
    expect(s?.remainingMs).toBeLessThan(0);
    expect(s?.human).toContain('已过去');
  });

  it('进度 0–1', () => {
    expect(countdownProgress('2026-01-01', '2026-01-11', '2026-01-06')).toBeCloseTo(0.5, 5);
    expect(countdownProgress('2026-01-01', '2026-01-11', '2025-01-01')).toBe(0);
    expect(countdownProgress('2026-01-01', '2026-01-11', '2027-01-01')).toBe(1);
  });

  it('endOfToday 在当天 23:59', () => {
    const e = endOfToday(new Date('2026-09-14T10:00:00'));
    expect(e.getDate()).toBe(14);
    expect(e.getHours()).toBe(23);
  });
});
