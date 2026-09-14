import { describe, expect, it } from 'vitest';
import {
  DATETIME_FMT,
  DATETIME_SEC_FMT,
  DATE_FMT,
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

/**
 * 测试环境时区固定为 Asia/Shanghai（见 src/test/setup.ts），
 * 因此所有字面量日期的解析结果都是确定的。
 * 上海无夏令时，日期加减也不会出现 23/25 小时的边界。
 */

describe('格式常量', () => {
  it('模式字符串符合文档约定', () => {
    expect(DATE_FMT).toBe('YYYY-MM-DD');
    expect(TIME_FMT).toBe('HH:mm');
    expect(DATETIME_FMT).toBe('YYYY-MM-DD HH:mm');
    expect(DATETIME_SEC_FMT).toBe('YYYY-MM-DD HH:mm:ss');
    expect(ISO_LOCAL_FMT).toBe('YYYY-MM-DDTHH:mm:ssZ');
  });

  it('星期表覆盖 0-6 且中文标签正确', () => {
    expect(WEEKDAY_ZH).toHaveLength(7);
    expect(WEEKDAY_SHORT_ZH).toHaveLength(7);
    expect(WEEKDAY_ZH[0]).toBe('周日');
    expect(WEEKDAY_ZH[1]).toBe('周一');
    expect(WEEKDAY_ZH[6]).toBe('周六');
    expect(WEEKDAY_SHORT_ZH[1]).toBe('一');
  });
});

describe('pad2', () => {
  it('一位数补零，两位数不动', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(5)).toBe('05');
    expect(pad2(9)).toBe('09');
    expect(pad2(10)).toBe('10');
    expect(pad2(59)).toBe('59');
  });
});

describe('toDate', () => {
  it('Date 实例原样返回（保持引用同一性）', () => {
    const d = new Date('2026-09-14T10:00:00+08:00');
    expect(toDate(d)).toBe(d);
  });

  it('字符串与时间戳转成 Date', () => {
    expect(toDate('2026-09-14').getFullYear()).toBe(2026);
    expect(toDate(0).getTime()).toBe(0);
  });
});

describe('formatDate', () => {
  it('按默认模式格式化', () => {
    expect(formatDate('2026-09-14T15:30:00+08:00')).toBe('2026-09-14');
  });

  it('支持自定义模式', () => {
    expect(formatDate('2026-09-14T15:30:45+08:00', DATETIME_SEC_FMT)).toBe('2026-09-14 15:30:45');
    expect(formatDate('2026-09-14T15:30:45+08:00', TIME_FMT)).toBe('15:30');
  });

  it('null / undefined / 空串返回占位符', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('非法日期返回占位符而不是 Invalid Date', () => {
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate(new Date(Number.NaN))).toBe('—');
  });

  it('时间戳 0 是合法输入，不能被当成空值', () => {
    // 这里刻意用显式 null/undefined/'' 判断而不是 falsy 判断，
    // 否则 1970-01-01 会被误显示成占位符。
    expect(formatDate(0)).toBe('1970-01-01');
  });
});

describe('formatDateTime', () => {
  it('默认使用 DATETIME_FMT', () => {
    expect(formatDateTime('2026-09-14T15:30:45+08:00')).toBe('2026-09-14 15:30');
  });

  it('非法输入同样返回占位符', () => {
    expect(formatDateTime('nope')).toBe('—');
  });
});

describe('formatDateWithWeekday / formatWeekday', () => {
  it('拼接日期与中文星期', () => {
    expect(formatDateWithWeekday('2026-09-14')).toBe('2026-09-14 周一');
    expect(formatDateWithWeekday('2026-09-19')).toBe('2026-09-19 周六');
  });

  it('单独取星期', () => {
    expect(formatWeekday('2026-09-14')).toBe('周一');
    expect(formatWeekday('2026-01-01')).toBe('周四');
    expect(formatWeekday('2024-02-29')).toBe('周四');
  });

  it('非法输入返回占位符', () => {
    expect(formatDateWithWeekday('nope')).toBe('—');
    expect(formatWeekday('nope')).toBe('—');
  });
});

describe('formatNumber', () => {
  it('默认保留至多 2 位小数并加千分位', () => {
    expect(formatNumber(1234567.891)).toBe('1,234,567.89');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(0)).toBe('0');
  });

  it('可调整小数位数', () => {
    expect(formatNumber(1234567.891, { maximumFractionDigits: 0 })).toBe('1,234,568');
    expect(formatNumber(1234567.891, { maximumFractionDigits: 3 })).toBe('1,234,567.891');
  });

  it('非有限数返回占位符', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});

describe('formatSigned', () => {
  it('正数带加号，负数与零不带', () => {
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(-2)).toBe('-2');
    expect(formatSigned(0)).toBe('0');
  });

  it('默认向零取整，但符号取自原值', () => {
    // 2.7 取整后是 2，可它仍然是正数，所以带加号——符号看的是原值而不是取整结果。
    expect(formatSigned(2.7)).toBe('+2');
    expect(formatSigned(-2.7)).toBe('-2');
    expect(formatSigned(0.4)).toBe('+0');
    // Math.trunc(-0.4) 得到 -0，而 String(-0) 就是 '0'，
    // 所以不足 1 的负数显示为 '0' 而不是 '-0'——这里记录实际行为。
    expect(formatSigned(-0.4)).toBe('0');
  });

  it('指定小数位时用 toFixed', () => {
    expect(formatSigned(3.14159, 2)).toBe('+3.14');
    expect(formatSigned(-3.14159, 2)).toBe('-3.14');
    expect(formatSigned(2, 2)).toBe('+2.00');
  });

  it('非有限数返回占位符', () => {
    expect(formatSigned(Number.NaN)).toBe('—');
    expect(formatSigned(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('minutesToClock', () => {
  it('常规换算', () => {
    expect(minutesToClock(0)).toBe('00:00');
    expect(minutesToClock(90)).toBe('01:30');
    expect(minutesToClock(1439)).toBe('23:59');
  });

  it('允许超过 24 小时——时长不是时刻', () => {
    expect(minutesToClock(1650)).toBe('27:30');
  });

  it('负数把符号放在最前面', () => {
    expect(minutesToClock(-90)).toBe('-01:30');
    expect(minutesToClock(-1)).toBe('-00:01');
  });

  it('四舍五入到整分钟', () => {
    expect(minutesToClock(90.6)).toBe('01:31');
    expect(minutesToClock(59.4)).toBe('00:59');
  });
});

describe('clockToMinutes', () => {
  it('解析 HH:mm 与 H:mm', () => {
    expect(clockToMinutes('09:30')).toBe(570);
    expect(clockToMinutes('9:30')).toBe(570);
  });

  it('忽略首尾空白', () => {
    expect(clockToMinutes('  09:30  ')).toBe(570);
  });

  it('解析带秒的写法，秒按小数分钟计', () => {
    expect(clockToMinutes('09:30:30')).toBe(570.5);
    expect(clockToMinutes('09:30:00')).toBe(570);
  });

  it('允许超过 24 小时，但小时数上限 99', () => {
    expect(clockToMinutes('24:00')).toBe(1440);
    expect(clockToMinutes('99:59')).toBe(5999);
    expect(clockToMinutes('100:00')).toBeNull();
  });

  it('分秒必须在 00-59 之间', () => {
    expect(clockToMinutes('09:60')).toBeNull();
    expect(clockToMinutes('09:30:60')).toBeNull();
  });

  it('格式非法返回 null', () => {
    expect(clockToMinutes('')).toBeNull();
    expect(clockToMinutes('abc')).toBeNull();
    expect(clockToMinutes('9')).toBeNull();
    expect(clockToMinutes('09-30')).toBeNull();
    expect(clockToMinutes('-09:30')).toBeNull();
  });

  it('与 minutesToClock 互为逆运算', () => {
    for (const minutes of [0, 1, 59, 60, 570, 1439, 1650]) {
      expect(clockToMinutes(minutesToClock(minutes))).toBe(minutes);
    }
  });
});

describe('formatDurationZh', () => {
  it('默认输出空格分隔的中文时长', () => {
    expect(formatDurationZh({ hours: 2, minutes: 30 })).toBe('2 小时 30 分钟');
  });

  it('compact 模式用短单位且无空格', () => {
    expect(formatDurationZh({ hours: 2, minutes: 30 }, true)).toBe('2时30分');
  });

  it('零时长有专门文案', () => {
    expect(formatDurationZh({})).toBe('0 分钟');
    expect(formatDurationZh({}, true)).toBe('0 分');
  });

  it('最多展示 4 个单位（比 humanizeDuration 默认的 3 多一个）', () => {
    const input = { years: 1, months: 2, days: 3, hours: 4, minutes: 5 };
    expect(formatDurationZh(input)).toBe('1 年 2 个月 3 天 4 小时');
  });
});

describe('formatRelativeZh', () => {
  const base = new Date('2026-09-14T12:00:00+08:00');
  const at = (offsetMs: number) => new Date(base.getTime() + offsetMs);

  it('45 秒以内算「刚刚」', () => {
    expect(formatRelativeZh(at(0), base)).toBe('刚刚');
    expect(formatRelativeZh(at(30_000), base)).toBe('刚刚');
    expect(formatRelativeZh(at(44_999), base)).toBe('刚刚');
    expect(formatRelativeZh(at(-44_999), base)).toBe('刚刚');
  });

  it('分钟级', () => {
    expect(formatRelativeZh(at(60_000), base)).toBe('1 分钟后');
    expect(formatRelativeZh(at(-120_000), base)).toBe('2 分钟前');
    expect(formatRelativeZh(at(45_000), base)).toBe('1 分钟后');
  });

  it('小时级', () => {
    expect(formatRelativeZh(at(3 * 3_600_000), base)).toBe('3 小时后');
    expect(formatRelativeZh(at(-5 * 3_600_000), base)).toBe('5 小时前');
    // 1.5 小时四舍五入成 2
    expect(formatRelativeZh(at(90 * 60_000), base)).toBe('2 小时后');
  });

  it('天级', () => {
    expect(formatRelativeZh(at(2 * 86_400_000), base)).toBe('2 天后');
    expect(formatRelativeZh(at(-20 * 86_400_000), base)).toBe('20 天前');
  });

  it('月级（按 30 天估）', () => {
    expect(formatRelativeZh(at(60 * 86_400_000), base)).toBe('2 个月后');
    expect(formatRelativeZh(at(-60 * 86_400_000), base)).toBe('2 个月前');
  });

  it('年级保留一位小数', () => {
    expect(formatRelativeZh(at(400 * 86_400_000), base)).toBe('1.1 年后');
    expect(formatRelativeZh(at(-800 * 86_400_000), base)).toBe('2.2 年前');
  });

  it('非法输入返回占位符', () => {
    expect(formatRelativeZh('nope', base)).toBe('—');
    expect(formatRelativeZh(base, 'nope')).toBe('—');
  });

  it('默认参照系是当前时间', () => {
    expect(formatRelativeZh(new Date())).toBe('刚刚');
  });
});

describe('shortId', () => {
  it('带上调用方给的前缀', () => {
    expect(shortId('evt-')).toMatch(/^evt-/);
    expect(shortId()).not.toMatch(/^-/);
  });

  it('连续调用不重复', () => {
    const ids = new Set(Array.from({ length: 500 }, () => shortId()));
    expect(ids.size).toBe(500);
  });

  it('只用 [0-9a-z] 字符，便于放进 URL 与文件名', () => {
    expect(shortId()).toMatch(/^[0-9a-z]+$/);
  });
});

describe('truncate', () => {
  it('未超长时原样返回', () => {
    expect(truncate('abc', 3)).toBe('abc');
    expect(truncate('ab', 3)).toBe('ab');
  });

  it('超长时截断并追加省略号，总长度等于上限', () => {
    expect(truncate('abcdef', 3)).toBe('ab…');
    expect(truncate('abcdef', 3)).toHaveLength(3);
  });

  it('默认上限 80', () => {
    const long = 'a'.repeat(200);
    expect(truncate(long)).toHaveLength(80);
    expect(truncate(long).endsWith('…')).toBe(true);
    expect(truncate('a'.repeat(80))).toBe('a'.repeat(80));
  });
});
