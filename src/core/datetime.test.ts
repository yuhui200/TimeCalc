import { describe, expect, it } from 'vitest';
import { diffDates, diffInWholeDays, calculateAge, dayOfRange } from './dateDiff';
import { addDuration, addDays, addMonths, alignTo, QUICK_ADD_PRESETS, subtractDuration } from './dateAdd';
import { addToTime, parseClock, subtractFromTime, timeRange } from './timeAdd';
import { diffTimes, timeDiffEquivalents, midpointTime } from './timeDiff';
import { convertEpoch, dateToEpochs, detectEpochUnit, parseEpochInput, toEpoch } from './unix';

describe('dateDiff', () => {
  it('同日返回全零', () => {
    const r = diffDates('2026-09-14', '2026-09-14');
    expect(r?.sign).toBe(0);
    expect(r?.calendar).toEqual({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('方向由 sign 表示，分量随方向取负', () => {
    const forward = diffDates('2026-01-01', '2026-03-15');
    const backward = diffDates('2026-03-15', '2026-01-01');
    expect(forward?.sign).toBe(1);
    expect(backward?.sign).toBe(-1);
    // 反向调用的每个分量都是正向的相反数（-0 与 0 视为相等，故用 toEqual 前先归一）
    expect(backward?.calendar.months).toBe(-forward!.calendar.months);
    expect(backward?.calendar.days).toBe(-forward!.calendar.days);
    expect(backward?.total.days).toBeCloseTo(-forward!.total.days, 6);
  });

  it('日历分解：跨月跨年', () => {
    const r = diffDates('2026-01-31', '2026-03-01');
    // 1/31 + 1 月 = 2/28，再 + 1 天 = 3/1
    expect(r?.calendar.years).toBe(0);
    expect(r?.calendar.months).toBe(1);
    expect(r?.calendar.days).toBe(1);
  });

  it('日历分解含时分秒', () => {
    const r = diffDates('2026-09-14 10:00:00', '2026-09-16 13:45:30');
    expect(r?.calendar).toEqual({ years: 0, months: 0, days: 2, hours: 3, minutes: 45, seconds: 30 });
  });

  it('calendarDays 含首尾，spanDays 不含', () => {
    const r = diffDates('2026-09-14', '2026-09-16');
    expect(r?.calendarDays).toBe(3);
    expect(r?.spanDays).toBe(2);
  });

  it('total.days 保留小数', () => {
    const r = diffDates('2026-09-14 00:00', '2026-09-15 12:00');
    expect(r?.total.days).toBeCloseTo(1.5, 6);
    expect(r?.calendarDays).toBe(2);
  });

  it('自动统计工作日与周末', () => {
    // 2026-09-14 是周一，09-20 是周日，整周 7 天含 5 个工作日
    const r = diffDates('2026-09-14', '2026-09-20');
    expect(r?.workdays).toBe(5);
    expect(r?.weekendDays).toBe(2);
    expect(r?.calendarDays).toBe(7);
  });

  it('非法输入返回 null', () => {
    expect(diffDates('不是日期', '2026-01-01')).toBeNull();
  });

  it('diffInWholeDays 按自然日截断', () => {
    expect(diffInWholeDays('2026-01-01', '2026-01-02')).toBe(1);
  });
});

describe('calculateAge', () => {
  it('生日当天返回整年', () => {
    expect(calculateAge('2000-05-20', '2026-05-20')).toMatchObject({ years: 26, months: 0, days: 0 });
  });

  it('生日前后跨月', () => {
    expect(calculateAge('2000-05-20', '2026-08-25')).toMatchObject({ years: 26, months: 3, days: 5 });
  });

  it('未出生返回 null', () => {
    expect(calculateAge('2030-01-01', '2026-01-01')).toBeNull();
  });
});

describe('dayOfRange', () => {
  it('计算区间进度', () => {
    const r = dayOfRange('2026-01-05', '2026-01-01', '2026-01-10');
    expect(r?.index).toBe(5);
    expect(r?.total).toBe(10);
    expect(r?.remaining).toBe(5);
    expect(r?.percent).toBe(50);
  });
});

describe('dateAdd', () => {
  it('月份溢出回退到月末', () => {
    expect(addMonths('2026-01-31', 1).getDate()).toBe(28);
    expect(addMonths('2024-01-31', 1).getDate()).toBe(29); // 闰年
  });

  it('加天数跨月', () => {
    expect(addDays('2026-01-30', 3).getMonth()).toBe(1); // 2 月
    expect(addDays('2026-01-30', 3).getDate()).toBe(2);
  });

  it('applyDuration 按 年→月→周→天→时 顺序施加', () => {
    const r = addDuration('2026-01-01', { years: 1, months: 2, days: 3 });
    expect(r?.label.startsWith('2027-03-04')).toBe(true);
  });

  it('减去时长', () => {
    const r = subtractDuration('2026-03-01', { months: 1 });
    expect(r?.sign).toBe(-1);
    expect(r?.output.getMonth()).toBe(1); // 2 月
  });

  it('返回日偏移与星期', () => {
    const r = addDuration('2026-09-14', { days: 7 });
    expect(r?.dayShift).toBe(7);
    expect(r?.weekday).toBe(1); // 周一
  });

  it('快捷预设包含需求里指定的四个', () => {
    const labels = QUICK_ADD_PRESETS.map((p) => p.label);
    expect(labels).toContain('+1 天');
    expect(labels).toContain('+7 天');
    expect(labels).toContain('+30 天');
    expect(labels).toContain('+1 月');
  });

  it('alignTo 对齐到边界', () => {
    expect(alignTo('2026-09-14', 'month', 'start').getDate()).toBe(1);
    expect(alignTo('2026-09-14', 'year', 'end').getMonth()).toBe(11);
    expect(alignTo('2026-09-14', 'quarter', 'start').getMonth()).toBe(6); // Q3 从 7 月开始
  });
});

describe('timeAdd', () => {
  it('解析时刻', () => {
    expect(parseClock('15:30')).toEqual({ minutes: 930, date: null });
    expect(parseClock('09:05')?.minutes).toBe(545);
  });

  it('简单相加', () => {
    expect(addToTime('15:30', { duration: { hours: 2, minutes: 30 } })?.clock).toBe('18:00');
  });

  it('跨午夜自动回绕并报告天偏移', () => {
    const r = addToTime('22:00', { duration: { hours: 3 } });
    expect(r?.clock).toBe('01:00');
    expect(r?.dayOffset).toBe(1);
  });

  it('相减跨到前一天', () => {
    const r = addToTime('01:00', { duration: { hours: -3 } });
    expect(r?.clock).toBe('22:00');
    expect(r?.dayOffset).toBe(-1);
  });

  it('带日期时结果日期同步推进', () => {
    const r = addToTime('2026-09-14 15:30', { duration: { hours: 9 } });
    expect(r?.clock).toBe('00:30');
    expect(r?.date?.getDate()).toBe(15);
  });

  it('clamp 模式不跨天', () => {
    const r = addToTime('23:00', { duration: { hours: 3 }, mode: 'clamp' });
    expect(r?.clock).toBe('23:59');
  });

  it('subtractFromTime 是加法的逆', () => {
    expect(subtractFromTime('18:00', { hours: 2, minutes: 30 })?.clock).toBe('15:30');
  });

  it('timeRange 生成等距时刻', () => {
    expect(timeRange('09:00', '11:00', 60)).toEqual(['09:00', '10:00', '11:00']);
  });
});

describe('timeDiff', () => {
  it('同日内的差', () => {
    const r = diffTimes('09:00', '17:30');
    expect(r?.hours).toBe(8);
    expect(r?.minutes).toBe(30);
    expect(r?.overnight).toBe(false);
    expect(r?.human).toBe('8 小时 30 分钟');
  });

  it('跨夜按次日计算', () => {
    const r = diffTimes('22:00', '01:30');
    expect(r?.overnight).toBe(true);
    expect(r?.hours).toBe(3);
    expect(r?.minutes).toBe(30);
  });

  it('signed 模式保留负值', () => {
    const r = diffTimes('17:30', '09:00', { whenReversed: 'signed' });
    expect(r?.diffMinutes).toBeLessThan(0);
    expect(r?.hours).toBe(8);
  });

  it('相同时刻差为 0', () => {
    expect(diffTimes('09:00', '09:00')?.diffMinutes).toBe(0);
  });

  it('非法输入返回 null', () => {
    expect(diffTimes('25:00', '09:00')).toBeNull();
    expect(diffTimes('abc', '09:00')).toBeNull();
  });

  it('单位换算', () => {
    const e = timeDiffEquivalents(150);
    expect(e.hours).toBe(2.5);
    expect(e.clock).toBe('02:30');
  });

  it('中点', () => {
    expect(midpointTime('09:00', '17:00')).toBe('13:00');
  });
});

describe('unix', () => {
  it('自动识别秒 / 毫秒 / 微秒 / 纳秒', () => {
    expect(detectEpochUnit(1_757_836_800)).toBe('seconds');
    expect(detectEpochUnit(1_757_836_800_000)).toBe('milliseconds');
    expect(detectEpochUnit(1_757_836_800_000_000)).toBe('microseconds');
    expect(detectEpochUnit(1_757_836_800_000_000_000)).toBe('nanoseconds');
  });

  it('秒与毫秒指向同一时刻', () => {
    const a = convertEpoch(1_757_836_800, 'seconds');
    const b = convertEpoch(1_757_836_800_000, 'milliseconds');
    expect(a?.epochMs).toBe(b?.epochMs);
  });

  it('往返转换保持一致', () => {
    const d = new Date('2026-09-14T15:30:00+08:00');
    const seconds = toEpoch(d, 'seconds');
    expect(convertEpoch(seconds, 'seconds')?.epochMs).toBe(d.getTime() - (d.getTime() % 1000));
  });

  it('dateToEpochs 一次给出四种单位', () => {
    const r = dateToEpochs('2026-09-14T15:30:00+08:00');
    expect(r?.milliseconds).toBe(r!.seconds * 1000);
    expect(r?.microseconds).toBe(r!.milliseconds * 1000);
  });

  it('parseEpochInput 支持后缀与关键字', () => {
    expect(parseEpochInput('1757836800')).toEqual({ value: 1757836800, unit: 'auto' });
    expect(parseEpochInput('1757836800000ms')).toEqual({ value: 1757836800000, unit: 'milliseconds' });
    expect(parseEpochInput('now')?.unit).toBe('milliseconds');
    expect(parseEpochInput('不是数字')).toBeNull();
  });

  it('非法数字返回 null', () => {
    expect(convertEpoch(Number.NaN)).toBeNull();
  });
});
