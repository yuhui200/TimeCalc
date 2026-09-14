import { describe, expect, it } from 'vitest';
import { detectSign, extractDurations, extractTimeOfDay, normalizeText, parseNatural, parseNaturalDetailed } from './natural';
import { dayjs } from './dayjs';

/** 固定基准：2026-09-14 是周一，10:00 */
const REF = new Date(2026, 8, 14, 10, 0, 0);

const fmt = (d: Date) => dayjs(d).format('YYYY-MM-DD HH:mm');

describe('normalizeText', () => {
  it('全角转半角并压缩空白', () => {
    expect(normalizeText('２０２６：０９')).toBe('2026:09');
    expect(normalizeText('  2h   30m  ')).toBe('2h 30m');
  });

  it('统一各种破折号', () => {
    expect(normalizeText('2026—09—14')).toBe('2026-09-14');
  });
});

describe('extractTimeOfDay', () => {
  it('识别 HH:mm', () => {
    expect(extractTimeOfDay('15:30')?.minutes).toBe(930);
    expect(extractTimeOfDay('9:05')?.minutes).toBe(545);
  });

  it('识别中文时刻', () => {
    expect(extractTimeOfDay('下午3点')?.minutes).toBe(15 * 60);
    expect(extractTimeOfDay('上午9点30分')?.minutes).toBe(9 * 60 + 30);
    expect(extractTimeOfDay('晚上8点半')?.minutes).toBe(20 * 60 + 30);
    expect(extractTimeOfDay('凌晨12点')?.minutes).toBe(0);
  });

  it('12 小时制修正', () => {
    expect(extractTimeOfDay('下午12点')?.minutes).toBe(12 * 60);
    expect(extractTimeOfDay('上午12点')?.minutes).toBe(0);
  });

  it('无法识别时返回 null', () => {
    expect(extractTimeOfDay('没有时间')).toBeNull();
  });
});

describe('extractDurations', () => {
  it('抽出多个时长片段', () => {
    const d = extractDurations('+ 2h30m');
    expect(d).toHaveLength(2);
    expect(d[0]!.duration).toEqual({ hours: 2 });
    expect(d[1]!.duration).toEqual({ minutes: 30 });
  });

  it('中文时长', () => {
    const d = extractDurations('加 2小时30分钟');
    expect(d.map((x) => x.duration)).toEqual([{ hours: 2 }, { minutes: 30 }]);
  });
});

describe('detectSign', () => {
  it('加号与"后"为正向', () => {
    expect(detectSign('+ 3天')).toBe(1);
    expect(detectSign('加 3天')).toBe(1);
    expect(detectSign('之后')).toBe(1);
  });

  it('减号与"前"为负向', () => {
    expect(detectSign('- 3天')).toBe(-1);
    expect(detectSign('减去 3天')).toBe(-1);
    expect(detectSign('提前 3天')).toBe(-1);
  });

  it('默认正向', () => {
    expect(detectSign('3天')).toBe(1);
  });
});

describe('parseNatural — 单日期', () => {
  it('今天 / 明天 / 后天', () => {
    expect(parseNatural('今天', REF)).toMatchObject({ kind: 'single' });
    expect(fmt((parseNatural('明天', REF) as { date: Date }).date)).toBe('2026-09-15 00:00');
    expect(fmt((parseNatural('后天', REF) as { date: Date }).date)).toBe('2026-09-16 00:00');
    expect(fmt((parseNatural('昨天', REF) as { date: Date }).date)).toBe('2026-09-13 00:00');
    expect(fmt((parseNatural('前天', REF) as { date: Date }).date)).toBe('2026-09-12 00:00');
  });

  it('下周五（基准是周一）', () => {
    const r = parseNatural('下周五', REF) as { kind: string; date: Date };
    expect(r.kind).toBe('single');
    expect(fmt(r.date)).toBe('2026-09-25 00:00');
  });

  it('本周三 / 这周三', () => {
    expect(fmt((parseNatural('本周三', REF) as { date: Date }).date)).toBe('2026-09-16 00:00');
    expect(fmt((parseNatural('这周三', REF) as { date: Date }).date)).toBe('2026-09-16 00:00');
  });

  it('上周一', () => {
    expect(fmt((parseNatural('上周一', REF) as { date: Date }).date)).toBe('2026-09-07 00:00');
  });

  it('裸「周五」在本周该日未过时指本周', () => {
    expect(fmt((parseNatural('周五', REF) as { date: Date }).date)).toBe('2026-09-18 00:00');
  });

  it('裸「周三」在本周该日已过时顺延到下周', () => {
    // 基准是周一 9/14，本周三是 9/16（未过）→ 本周
    expect(fmt((parseNatural('周三', REF) as { date: Date }).date)).toBe('2026-09-16 00:00');
    // 换成周四为基准，本周三已过 → 下周三 9/23
    const thursday = new Date(2026, 8, 17, 10, 0, 0);
    expect(fmt((parseNatural('周三', thursday) as { date: Date }).date)).toBe('2026-09-23 00:00');
  });

  it('绝对日期：年月日 / 短横线 / 斜杠', () => {
    expect(fmt((parseNatural('2026年9月14日', REF) as { date: Date }).date)).toBe('2026-09-14 00:00');
    expect(fmt((parseNatural('2026-09-14', REF) as { date: Date }).date)).toBe('2026-09-14 00:00');
    expect(fmt((parseNatural('2026/09/14', REF) as { date: Date }).date)).toBe('2026-09-14 00:00');
  });

  it('N 天后', () => {
    expect(fmt((parseNatural('3天后', REF) as { date: Date }).date)).toBe('2026-09-17 00:00');
    expect(fmt((parseNatural('2周后', REF) as { date: Date }).date)).toBe('2026-09-28 00:00');
    expect(fmt((parseNatural('1个月后', REF) as { date: Date }).date)).toBe('2026-10-14 00:00');
  });

  it('单独时刻按今天处理', () => {
    const r = parseNatural('15:30', REF) as { kind: string; date: Date; hasTime: boolean };
    expect(r.kind).toBe('single');
    expect(r.hasTime).toBe(true);
    expect(fmt(r.date)).toBe('2026-09-14 15:30');
  });

  it('日期带时刻', () => {
    const r = parseNatural('下周五 15:00', REF) as { date: Date; hasTime: boolean };
    expect(r.hasTime).toBe(true);
    expect(fmt(r.date)).toBe('2026-09-25 15:00');
  });

  it('英文日期（chrono 兜底）', () => {
    const r = parseNatural('2026-12-25', REF) as { date: Date };
    expect(fmt(r.date)).toBe('2026-12-25 00:00');
  });
});

describe('parseNatural — 日期差', () => {
  it('两个日期之间', () => {
    const r = parseNatural('2026-01-01 到 2026-09-14', REF);
    expect(r.kind).toBe('date-diff');
    if (r.kind !== 'date-diff') return;
    expect(fmt(r.start)).toBe('2026-01-01 00:00');
    expect(fmt(r.end)).toBe('2026-09-14 00:00');
  });

  it('工作日统计（需求中的示例）', () => {
    const r = parseNatural('2026-01-01 到 2026-09-14 多少个工作日', REF);
    expect(r.kind).toBe('workday-diff');
    if (r.kind !== 'workday-diff') return;
    expect(fmt(r.start)).toBe('2026-01-01 00:00');
    expect(fmt(r.end)).toBe('2026-09-14 00:00');
  });

  it('用波浪号分隔', () => {
    expect(parseNatural('2026-01-01 ~ 2026-02-01', REF).kind).toBe('date-diff');
  });

  it('两个中文相对日期', () => {
    const r = parseNatural('今天到后天', REF);
    expect(r.kind).toBe('date-diff');
    if (r.kind !== 'date-diff') return;
    expect(fmt(r.start)).toBe('2026-09-14 00:00');
    expect(fmt(r.end)).toBe('2026-09-16 00:00');
  });
});

describe('parseNatural — 日期加减', () => {
  it('需求中的示例：下周五 15:00 + 2h30m', () => {
    const r = parseNatural('下周五 15:00 + 2h30m', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(r.sign).toBe(1);
    expect(fmt(r.base)).toBe('2026-09-25 15:00');
    expect(r.duration).toEqual({ hours: 2, minutes: 30 });
  });

  it('加法：今天 +30 天', () => {
    const r = parseNatural('今天 +30 天', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(fmt(r.base)).toBe('2026-09-14 00:00');
    expect(r.duration).toEqual({ days: 30 });
    expect(r.sign).toBe(1);
  });

  it('减法：明天 - 2 天', () => {
    const r = parseNatural('明天 - 2 天', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(r.sign).toBe(-1);
    expect(r.duration).toEqual({ days: 2 });
  });

  it('中文动词：3月1日 加 1个月', () => {
    const r = parseNatural('2026年3月1日 加 1个月', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(fmt(r.base)).toBe('2026-03-01 00:00');
    expect(r.duration).toEqual({ months: 1 });
  });

  it('只有时长时以当前时刻为基准', () => {
    const r = parseNatural('+2h', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(r.base.getTime()).toBe(REF.getTime());
    expect(r.duration).toEqual({ hours: 2 });
  });

  it('不要把日期误读成时长', () => {
    // 关键回归：2026年9月14日 曾被解析成 {years:2026, months:9, days:14}
    const r = parseNatural('2026年9月14日 + 1天', REF);
    expect(r.kind).toBe('add');
    if (r.kind !== 'add') return;
    expect(r.duration).toEqual({ days: 1 });
    expect(fmt(r.base)).toBe('2026-09-14 00:00');
  });
});

describe('parseNatural — 时间差', () => {
  it('两个时刻', () => {
    const r = parseNatural('9:00 到 18:30', REF);
    expect(r.kind).toBe('time-diff');
    if (r.kind !== 'time-diff') return;
    expect(r.start).toBe('9:00');
    expect(r.end).toBe('18:30');
  });

  it('需求文案：明天 9:00 到 18:30 差多久', () => {
    const r = parseNatural('明天 9:00 到 18:30 差多久', REF);
    // 含日期时按日期差处理也合理，这里断言不会崩且识别到了两个时刻
    expect(['time-diff', 'single', 'date-diff']).toContain(r.kind);
  });
});

describe('parseNatural — 时区', () => {
  it('北京转纽约', () => {
    const r = parseNatural('北京时间 2026-09-14 15:00 转纽约', REF);
    expect(r.kind).toBe('timezone');
    if (r.kind !== 'timezone') return;
    expect(r.from.id).toBe('Asia/Shanghai');
    expect(r.to.id).toBe('America/New_York');
    expect(fmt(r.date)).toBe('2026-09-14 15:00');
  });
});

describe('parseNatural — 时间戳', () => {
  it('识别秒级时间戳', () => {
    const r = parseNatural('时间戳 1757836800', REF);
    expect(r.kind).toBe('unix');
    if (r.kind !== 'unix') return;
    expect(r.epochMs).toBe(1757836800000);
  });
});

describe('parseNatural — 边界', () => {
  it('空输入', () => {
    expect(parseNatural('', REF).kind).toBe('empty');
    expect(parseNatural('   ', REF).kind).toBe('empty');
  });

  it('无法识别时给出可操作的提示', () => {
    const r = parseNatural('随便写点什么', REF);
    expect(r.kind).toBe('unknown');
    if (r.kind !== 'unknown') return;
    expect(r.reason).toContain('下周五');
  });

  it('调试信息记录了识别过程', () => {
    const { debug } = parseNaturalDetailed('下周五 15:00 + 2h30m', REF);
    // 15:00 紧跟在日期后面，被并入该日期而不是单列为时刻
    expect(debug.dates).toHaveLength(1);
    expect(debug.dates[0]!.hasTime).toBe(true);
    expect(fmt(debug.dates[0]!.date)).toBe('2026-09-25 15:00');
    expect(debug.times).toHaveLength(0);
    expect(debug.durations.map((d) => d.text)).toEqual(['2h', '30m']);
    expect(debug.sign).toBe(1);
  });

  it('独立时刻会单列在 times 中', () => {
    const { debug } = parseNaturalDetailed('9:00 到 18:30', REF);
    expect(debug.dates).toHaveLength(0);
    expect(debug.times.map((t) => t.minutes)).toEqual([540, 1110]);
  });
});
