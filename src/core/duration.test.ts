import { describe, expect, it } from 'vitest';
import {
  addDurations,
  compactDuration,
  durationToMs,
  humanizeDuration,
  isZeroDuration,
  msToClockParts,
  msToDuration,
  negateDuration,
  normalizeDuration,
  parseDuration,
  subtractDurations,
} from './duration';

describe('parseDuration', () => {
  it('解析紧凑英文写法', () => {
    expect(parseDuration('2h30m')).toEqual({ hours: 2, minutes: 30 });
    expect(parseDuration('1d2h')).toEqual({ days: 1, hours: 2 });
    expect(parseDuration('90m')).toEqual({ minutes: 90 });
  });

  it('解析中文写法', () => {
    expect(parseDuration('2小时30分钟')).toEqual({ hours: 2, minutes: 30 });
    expect(parseDuration('1年2个月3天')).toEqual({ years: 1, months: 2, days: 3 });
    expect(parseDuration('3天')).toEqual({ days: 3 });
  });

  it('区分 m（分钟）与 mo（月）', () => {
    expect(parseDuration('5m')).toEqual({ minutes: 5 });
    expect(parseDuration('5mo')).toEqual({ months: 5 });
  });

  it('不把 ms 误读成 m + s', () => {
    expect(parseDuration('500ms')).toEqual({ milliseconds: 500 });
  });

  it('解析 ISO 8601 Duration', () => {
    expect(parseDuration('P1DT2H30M')).toEqual({ days: 1, hours: 2, minutes: 30 });
    expect(parseDuration('PT45S')).toEqual({ seconds: 45 });
  });

  it('支持负数与空格', () => {
    expect(parseDuration('-3d')).toEqual({ days: -3 });
    expect(parseDuration('2h 30m')).toEqual({ hours: 2, minutes: 30 });
  });

  it('无单位的裸数字按分钟处理', () => {
    expect(parseDuration('45')).toEqual({ minutes: 45 });
  });

  it('无法解析时返回空对象', () => {
    expect(parseDuration('随便写点什么')).toEqual({});
  });
});

describe('normalizeDuration / compactDuration', () => {
  it('补齐所有字段', () => {
    expect(normalizeDuration({ hours: 1 })).toEqual({
      years: 0, months: 0, weeks: 0, days: 0,
      hours: 1, minutes: 0, seconds: 0, milliseconds: 0,
    });
  });

  it('丢弃 0 值字段', () => {
    expect(compactDuration({ hours: 1, minutes: 0, days: 0 })).toEqual({ hours: 1 });
  });

  it('接受数字与字符串', () => {
    expect(normalizeDuration(500).milliseconds).toBe(500);
    expect(normalizeDuration('2h').hours).toBe(2);
  });
});

describe('加减与取反', () => {
  it('同单位相加', () => {
    expect(addDurations({ hours: 2 }, { minutes: 30 })).toEqual({ hours: 2, minutes: 30 });
    expect(addDurations({ days: 1 }, { days: 2 })).toEqual({ days: 3 });
  });

  it('相减', () => {
    expect(subtractDurations({ days: 5 }, { days: 2 })).toEqual({ days: 3 });
  });

  it('取反', () => {
    expect(negateDuration({ hours: 2, minutes: 30 })).toEqual({ hours: -2, minutes: -30 });
  });

  it('零时长判定', () => {
    expect(isZeroDuration({})).toBe(true);
    expect(isZeroDuration({ seconds: 1 })).toBe(false);
  });
});

describe('durationToMs', () => {
  it('按平均长度折算月与年', () => {
    expect(durationToMs({ hours: 1 })).toBe(3_600_000);
    expect(durationToMs({ days: 1 })).toBe(86_400_000);
    expect(durationToMs({ weeks: 1 })).toBe(604_800_000);
    expect(durationToMs({ years: 1 })).toBeCloseTo(31_556_952_000, 0);
  });
});

describe('humanizeDuration', () => {
  it('中文默认输出', () => {
    expect(humanizeDuration({ hours: 2, minutes: 30 })).toBe('2 小时 30 分钟');
  });

  it('限制单位数量', () => {
    expect(humanizeDuration({ days: 1, hours: 2, minutes: 3 }, { maxUnits: 2 })).toBe('1 天 2 小时');
  });

  it('紧凑模式省略空格', () => {
    expect(humanizeDuration({ hours: 2, minutes: 30 }, { compact: true })).toBe('2时30分');
  });

  it('零时长有兜底文案', () => {
    expect(humanizeDuration({})).toBe('0 分钟');
    expect(humanizeDuration({}, { zeroText: '无' })).toBe('无');
  });

  it('英文输出', () => {
    expect(humanizeDuration({ hours: 1, minutes: 1 }, { locale: 'en' })).toBe('1 hour 1 minute');
  });
});

describe('msToClockParts / msToDuration', () => {
  it('拆分毫秒到天时分秒', () => {
    const parts = msToClockParts(90_000_000 + 3_600_000 + 60_000 + 1000);
    // 90,000,000 ms = 25 小时；再加 1 小时 = 26 小时 = 1 天 2 小时
    expect(parts.sign).toBe(1);
    expect(parts.days).toBe(1);
    expect(parts.hours).toBe(2);
    expect(parts.minutes).toBe(1);
    expect(parts.seconds).toBe(1);
  });

  it('负数保留符号', () => {
    const parts = msToClockParts(-3_600_000);
    expect(parts.sign).toBe(-1);
    expect(parts.hours).toBe(1);
  });

  it('msToDuration 的 maxUnit 指定最大单位，向下拆到底', () => {
    // 默认从「天」起拆：25 小时 = 1 天 1 小时
    expect(msToDuration(90_000_000)).toEqual({ days: 1, hours: 1 });
    // 指定从「小时」起拆：全部用小时表示
    expect(msToDuration(90_000_000, { maxUnit: 'hours' })).toEqual({ hours: 25 });
    // 指定从「分钟」起拆，余数继续拆到秒，不丢精度
    expect(msToDuration(3_661_000, { maxUnit: 'minutes' })).toEqual({ minutes: 61, seconds: 1 });
  });
});
