import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_PRESETS,
  countdownDigits,
  countdownProgress,
  describeCountdown,
  endOfToday,
  endOfWeek,
  nextHour,
  snapshot,
  startOfTomorrow,
} from './countdown';

/** 测试时区固定为 Asia/Shanghai（见 src/test/setup.ts），且上海无夏令时 */
const NOW = new Date('2026-09-14T10:20:30'); // 周一

describe('snapshot', () => {
  it('拆出天/时/分/秒与总量', () => {
    const s = snapshot('2026-09-16T12:30:45', new Date('2026-09-14T10:00:00'));
    expect(s).not.toBeNull();
    expect(s!.days).toBe(2);
    expect(s!.hours).toBe(2);
    expect(s!.minutes).toBe(30);
    expect(s!.seconds).toBe(45);
    expect(s!.expired).toBe(false);
    expect(s!.remainingMs).toBe(181_845_000);
    // 总量是绝对值：便于「还剩 50 小时」这类表述
    expect(s!.totalHours).toBeCloseTo(50.5125, 4);
    expect(s!.totalMinutes).toBeCloseTo(3030.75, 4);
  });

  it('target 归一化成 Date 实例', () => {
    const s = snapshot('2026-09-16T12:30:45', NOW);
    expect(s!.target).toBeInstanceOf(Date);
    expect(s!.target.getTime()).toBe(new Date('2026-09-16T12:30:45').getTime());
  });

  it('未过期用「还剩」，已过期用「已过去」', () => {
    expect(snapshot('2026-09-16T12:30:45', NOW)!.human).toMatch(/^还剩 /);
    expect(snapshot('2026-09-01T00:00:00', NOW)!.human).toMatch(/^已过去 /);
  });

  it('过期后各字段取绝对值，remainingMs 保持负数', () => {
    const s = snapshot('2026-09-14T08:20:30', NOW)!; // 恰好早 2 小时
    expect(s.expired).toBe(true);
    expect(s.remainingMs).toBe(-7_200_000);
    expect(s.days).toBe(0);
    expect(s.hours).toBe(2);
    expect(s.minutes).toBe(0);
    expect(s.seconds).toBe(0);
    expect(s.totalHours).toBeCloseTo(2, 6);
  });

  it('到点的那一刻算已过期', () => {
    const s = snapshot(NOW, NOW)!;
    expect(s.remainingMs).toBe(0);
    expect(s.expired).toBe(true);
    expect(s.human).toBe('已过去 0 分钟');
  });

  it('非法输入返回 null', () => {
    expect(snapshot('nope', NOW)).toBeNull();
    expect(snapshot('2026-09-16', 'nope')).toBeNull();
  });
});

describe('countdownDigits', () => {
  it('时分秒补零到两位，天数不补', () => {
    const s = snapshot('2026-09-16T12:30:45', new Date('2026-09-14T10:00:00'))!;
    expect(countdownDigits(s)).toEqual({
      days: '2',
      hours: '02',
      minutes: '30',
      seconds: '45',
    });
  });

  it('大天数不截断', () => {
    const s = snapshot('2027-09-14T10:00:00', new Date('2026-09-14T10:00:00'))!;
    expect(countdownDigits(s).days).toBe('365');
  });

  it('个位数时分秒补成两位', () => {
    const s = snapshot('2026-09-14T10:20:39', NOW)!; // 9 秒后
    expect(countdownDigits(s)).toEqual({
      days: '0',
      hours: '00',
      minutes: '00',
      seconds: '09',
    });
  });
});

describe('countdownProgress', () => {
  it('起点为 0，终点为 1', () => {
    expect(countdownProgress('2026-01-01', '2026-01-11', '2026-01-01')).toBe(0);
    expect(countdownProgress('2026-01-01', '2026-01-11', '2026-01-11')).toBe(1);
  });

  it('超出区间会被夹到 0–1', () => {
    expect(countdownProgress('2026-01-01', '2026-01-11', '2025-12-01')).toBe(0);
    expect(countdownProgress('2026-01-01', '2026-01-11', '2026-03-01')).toBe(1);
  });

  it('起点与终点相同返回 0 而不是除零', () => {
    expect(countdownProgress('2026-01-01', '2026-01-01', '2026-06-01')).toBe(0);
  });

  it('非法输入返回 0', () => {
    expect(countdownProgress('nope', '2026-01-11', '2026-01-06')).toBe(0);
    expect(countdownProgress('2026-01-01', 'nope', '2026-01-06')).toBe(0);
  });
});

describe('预设目标时刻', () => {
  it('endOfToday 落在当天 23:59:59.999', () => {
    const d = endOfToday(NOW);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 9 月
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });

  it('nextHour 取下一个整点——整点当下也算「下一个」', () => {
    const d = nextHour(NOW);
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(0);
    // 正好在整点时不能返回当前这一小时，否则倒计时会瞬间归零
    expect(nextHour(new Date('2026-09-14T10:00:00')).getHours()).toBe(11);
  });

  it('startOfTomorrow 落在次日零点', () => {
    const d = startOfTomorrow(NOW);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('endOfWeek 按 ISO 周（周一至周日）', () => {
    // 2026-09-14 是周一，本 ISO 周结束于 2026-09-20 周日
    const d = endOfWeek(NOW);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(23);
    // 周日当天调用时，返回的就是当天结束
    expect(endOfWeek(new Date('2026-09-20T08:00:00')).getDate()).toBe(20);
  });

  it('默认参数是当前时间', () => {
    for (const fn of [endOfToday, nextHour, startOfTomorrow, endOfWeek]) {
      expect(fn()).toBeInstanceOf(Date);
    }
  });
});

describe('COUNTDOWN_PRESETS', () => {
  it('id 唯一且都带中文标签', () => {
    const ids = COUNTDOWN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of COUNTDOWN_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('每个预设的 resolve 与对应函数一致', () => {
    const byId = new Map(COUNTDOWN_PRESETS.map((p) => [p.id, p]));
    const at = (id: string) => byId.get(id)!.resolve(NOW).getTime();

    expect(at('today-end')).toBe(endOfToday(NOW).getTime());
    expect(at('tomorrow')).toBe(startOfTomorrow(NOW).getTime());
    expect(at('next-hour')).toBe(nextHour(NOW).getTime());
    expect(at('week-end')).toBe(endOfWeek(NOW).getTime());
  });

  it('明年元旦落在下一年 1 月 1 日零点', () => {
    const d = COUNTDOWN_PRESETS.find((p) => p.id === 'new-year')!.resolve(NOW);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it('resolve 不传参也能工作', () => {
    for (const p of COUNTDOWN_PRESETS) {
      expect(p.resolve()).toBeInstanceOf(Date);
    }
  });
});

describe('describeCountdown', () => {
  it('拼接格式化时刻与剩余描述', () => {
    const s = snapshot('2026-09-16T12:30:45', new Date('2026-09-14T10:00:00'))!;
    const text = describeCountdown(s);
    expect(text).toMatch(/^2026-09-16 12:30 · 还剩 /);
  });
});
