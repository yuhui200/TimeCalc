/**
 * 自然语言面板——本应用的主入口。
 *
 * 需求里的示例「下周五 15:00 + 2h30m」「2026-01-01 到 2026-09-14 多少个工作日」
 * 都在这里落地。设计上只做三件事：
 *   1. 一个大输入框（移动端自动聚焦，减少输入成本）
 *   2. 一排「示例」芯片，点一下就能看到它怎么工作——比写文档有效
 *   3. 把 parseNatural 的判别联合结果翻译成人话
 *
 * 所有计算都在核心层完成，这里**不含任何日期算术**。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseNatural } from '../../core/natural';
import { countWorkdays } from '../../core/workdays';
import { diffDates } from '../../core/dateDiff';
import { applyDuration } from '../../core/dateAdd';
import { diffTimes, midpointTime } from '../../core/timeDiff';
import { convertWallClock, formatInZone } from '../../core/timezone';
import { convertEpoch } from '../../core/unix';
import { humanizeDuration } from '../../core/duration';
import { formatDate, formatDateTime, formatWeekday, WEEKDAY_ZH } from '../../core/format';
import { getHolidaySet } from '../../core/holidays';
import type { HolidayRegion, NaturalParse } from '../../core/types';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  CopyButton,
  EmptyState,
  ResultDisplay,
  StatList,
  StatRow,
  TextAreaField,
} from '../../components';
import { useSettings } from '../../hooks/useSettings';
import { useHistoryRecorder } from '../../hooks/useHistory';

/** 示例文案直接取自需求，用户点一下就知道能做什么 */
const EXAMPLES = [
  '下周五 15:00 + 2h30m',
  '2026-01-01 到 2026-09-14 多少个工作日',
  '今天 +30 天',
  '北京时间 2026-09-14 15:00 转纽约',
  '9:00 到 18:30 差多久',
  '时间戳 1757836800',
  '明天 9:00 到 18:30',
  '2026年3月1日 加 1个月',
] as const;

export function NaturalPanel() {
  const { settings } = useSettings();
  const record = useHistoryRecorder();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 解析是同步的纯函数，useMemo 足够；输入变化时结果立刻更新
  const parsed = useMemo<NaturalParse | null>(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    return parseNatural(trimmed);
  }, [text]);

  const view = useMemo(
    () => (parsed ? buildView(parsed, settings.holidayRegion, settings.weekend) : null),
    [parsed, settings.holidayRegion, settings.weekend],
  );

  // 解析成功后记一笔历史。用 debounce 是因为用户边打字边算，
  // 每个中间态都记会让历史被 "2026-01-0" 这类半成品塞满。
  useEffect(() => {
    if (!view || !text.trim()) return;
    const timer = window.setTimeout(() => {
      void record({ kind: 'natural', input: text.trim(), output: view.summary });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [view, text, record]);

  const applyExample = useCallback((example: string) => {
    setText(example);
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="自然语言输入"
        description="用日常说法描述你要算什么，支持中文与英文。"
      >
        <TextAreaField
          ref={inputRef}
          label="输入"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="例如：下周五 15:00 + 2h30m"
          rows={2}
          autoComplete="off"
          // 移动端用句首大写会让中文输入法行为怪异，显式关掉
          autoCapitalize="off"
          spellCheck={false}
          inputClassName="text-lg"
          hint="支持：日期差、工作日统计、日期加减、时间差、时区转换、Unix 时间戳"
        />

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">点一下试试</p>
          <ChipRow label="示例">
            {EXAMPLES.map((example) => (
              <Chip key={example} onClick={() => applyExample(example)}>
                {example}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {text ? (
          <div className="mt-3 flex justify-end">
            <Chip tone="danger" onClick={() => setText('')}>
              清空
            </Chip>
          </div>
        ) : null}
      </Card>

      {view ? (
        <ResultDisplay
          ready
          primary={view.primary}
          primaryHint={view.primaryHint}
          copyText={view.copyText}
          rows={view.rows}
          footnote={view.footnote}
          error={view.error}
        />
      ) : (
        <Card flush>
          <EmptyState
            icon="💬"
            title="还没有输入"
            description="试试点上面的示例，或直接输入「下周五 15:00 + 2h30m」。"
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 把判别联合翻译成可展示的视图模型                                     */
/* ------------------------------------------------------------------ */

interface ResultView {
  primary: string;
  primaryHint?: string;
  copyText: string;
  rows?: Array<{ label: string; value: string; hint?: string; emphasis?: boolean }>;
  footnote?: string;
  error?: string;
  /** 写进历史的一行摘要 */
  summary: string;
}

function buildView(
  parsed: NaturalParse,
  region: HolidayRegion,
  weekend: number[],
): ResultView {
  switch (parsed.kind) {
    case 'empty':
      return { primary: '', copyText: '', summary: '' };

    case 'unknown':
      return {
        primary: '无法识别',
        copyText: '',
        error: parsed.reason,
        summary: `无法识别：${parsed.raw}`,
      };

    case 'single': {
      const date = parsed.date;
      const label = parsed.hasTime ? formatDateTime(date) : formatDate(date);
      return {
        primary: label,
        primaryHint: `${formatWeekday(date)}${parsed.hasTime ? '' : '（当日 00:00）'}`,
        copyText: label,
        rows: [
          { label: '相对今天', value: relativeLabel(date) },
          { label: 'ISO 8601', value: toLocalIso(date) },
        ],
        footnote: parsed.hasTime
          ? '输入中包含具体时刻，已按该时刻解析。'
          : '输入中只有日期，时间部分按当日 00:00 处理。',
        summary: label,
      };
    }

    case 'date-diff': {
      const diff = diffDates(parsed.start, parsed.end, { weekendDays: weekend });
      // diffDates 只在日期非法时返回 null；能走到这里说明已经解析成功，
      // 但仍要给出可读的错误而不是崩溃
      if (!diff) {
        return {
          primary: '无法计算',
          copyText: '',
          error: '日期区间无效，请检查输入。',
          summary: '日期差计算失败',
        };
      }
      const start = formatDate(parsed.start);
      const end = formatDate(parsed.end);
      // 精确天数带小数，展示时收敛到 2 位，避免出现 256.99999999
      const exactDays = Number(diff.total.days.toFixed(2));
      return {
        primary: `${exactDays} 天`,
        primaryHint: `${start} → ${end}`,
        copyText: `${start} 到 ${end}：${exactDays} 天`,
        rows: [
          { label: '相差天数（精确）', value: `${exactDays} 天`, emphasis: true },
          { label: '日历天数（含首尾）', value: `${diff.calendarDays} 天` },
          {
            label: '日历分解',
            value: humanizeDuration(diff.calendar, { maxUnits: 3, showSign: true }),
          },
          { label: '整周', value: `${Math.floor(diff.total.weeks)} 周` },
          { label: '整月', value: `${Math.floor(diff.total.months)} 个月` },
          {
            label: '工作日',
            value: `${diff.workdays} 天`,
            hint: diff.holidays > 0 ? `已扣除 ${diff.holidays} 天节假日` : undefined,
          },
          { label: '周末天数', value: `${diff.weekendDays} 天` },
        ],
        footnote:
          '「相差天数」是精确值（不含首尾）；「日历天数」把首尾两天都算进去，因此比前者多 1。',
        summary: `${start} → ${end}：${exactDays} 天`,
      };
    }

    case 'workday-diff': {
      const set = getHolidaySet(region, [parsed.start.getFullYear(), parsed.end.getFullYear()]);
      const workdays = countWorkdays(parsed.start, parsed.end, {
        weekendDays: weekend,
        holidays: set.holidays,
        extraWorkdays: set.extraWorkdays,
      });
      const start = formatDate(parsed.start);
      const end = formatDate(parsed.end);
      const total = diffDates(parsed.start, parsed.end, {
        weekendDays: weekend,
        holidays: set.holidays,
        extraWorkdays: set.extraWorkdays,
      });
      return {
        primary: `${workdays} 个工作日`,
        primaryHint: `${start} → ${end}（含首尾）`,
        copyText: `${start} 到 ${end} 共 ${workdays} 个工作日`,
        rows: [
          { label: '工作日', value: `${workdays} 天`, emphasis: true },
          { label: '日历天数（含首尾）', value: `${total?.calendarDays ?? 0} 天` },
          { label: '周末天数', value: `${total?.weekendDays ?? 0} 天` },
          {
            label: '节假日',
            value: `${total?.holidays ?? 0} 天`,
            hint: region === 'NONE' ? '未启用节假日' : undefined,
          },
        ],
        footnote:
          region === 'NONE'
            ? '当前设置未启用节假日地区，工作日只扣除周末。可在设置中启用。'
            : `已按「${REGION_LABEL[region]}」节假日计算，含调休补班日。未公布的年份为推算值。`,
        summary: `${start} → ${end}：${workdays} 个工作日`,
      };
    }

    case 'add': {
      const result = applyDuration(parsed.base, parsed.duration, parsed.sign);
      const base = parsed.hasTime ? formatDateTime(parsed.base) : formatDate(parsed.base);
      const target = parsed.hasTime ? formatDateTime(result) : formatDate(result);
      const op = parsed.sign === 1 ? '+' : '−';
      const span = humanizeDuration(parsed.duration, { maxUnits: 3 });
      return {
        primary: target,
        primaryHint: `${base} ${op} ${span}`,
        copyText: target,
        rows: [
          { label: '基准', value: base },
          { label: parsed.sign === 1 ? '加上' : '减去', value: span },
          { label: '结果', value: target, emphasis: true },
          { label: '星期', value: WEEKDAY_ZH[result.getDay()] ?? '' },
        ],
        footnote:
          '月份与年份按**自然月**推进（1 月 31 日 + 1 个月 = 2 月 28/29 日），不是按 30 天折算。',
        summary: `${base} ${op} ${span} = ${target}`,
      };
    }

    case 'time-diff': {
      const diff = diffTimes(parsed.start, parsed.end);
      if (!diff) {
        return {
          primary: '无法计算',
          copyText: '',
          error: '两个时刻的格式无法识别，请使用 HH:mm 或「下午 3 点」这类写法。',
          summary: '时间差解析失败',
        };
      }
      return {
        primary: diff.human,
        primaryHint: `${parsed.start} → ${parsed.end}`,
        copyText: `${parsed.start} 到 ${parsed.end}：${diff.human}`,
        rows: [
          { label: '总分钟', value: `${diff.diffMinutes} 分钟` },
          { label: '总小时', value: `${(diff.diffMinutes / 60).toFixed(2)} 小时` },
          { label: '时分', value: `${diff.hours} 小时 ${diff.minutes} 分钟`, emphasis: true },
          { label: '中点', value: midpointTime(parsed.start, parsed.end) ?? '—' },
        ],
        footnote: diff.overnight
          ? '结束时刻早于开始时刻，已按跨天（+24 小时）处理。'
          : '同一天内的两个时刻之差。',
        summary: `${parsed.start} → ${parsed.end}：${diff.human}`,
      };
    }

    case 'timezone': {
      const wall = formatDateTime(parsed.date, 'YYYY-MM-DD HH:mm');
      const conversion = convertWallClock(wall, parsed.from.id, parsed.to.id);
      if (!conversion) {
        return {
          primary: '换算失败',
          copyText: '',
          error: '时区换算失败，请检查时区标识是否有效。',
          summary: '时区换算失败',
        };
      }
      const target = conversion.to.formatted.slice(0, 16);
      return {
        primary: target,
        primaryHint: `${parsed.to.label}（${parsed.to.id}）`,
        copyText: target,
        rows: [
          { label: parsed.from.label, value: conversion.from.formatted.slice(0, 16) },
          { label: parsed.to.label, value: target, emphasis: true },
          { label: '时差', value: `${conversion.offsetDeltaHours >= 0 ? '+' : ''}${conversion.offsetDeltaHours} 小时` },
          { label: 'UTC 时刻', value: formatInZone(conversion.epochMs, 'UTC', 'YYYY-MM-DD HH:mm') },
        ],
        footnote:
          conversion.dayShift === 0
            ? '两地处于同一天。'
            : `目标时区比源时区${conversion.dayShift > 0 ? '晚' : '早'} ${Math.abs(conversion.dayShift)} 天。`,
        summary: `${wall} ${parsed.from.label} = ${target} ${parsed.to.label}`,
      };
    }

    case 'unix': {
      // 传入的是毫秒，因此显式声明单位为 milliseconds，
      // 不让 detectEpochUnit 去猜（猜测对 1970 年前后的值会误判）
      const conversion = convertEpoch(parsed.epochMs, 'milliseconds');
      if (!conversion) {
        return {
          primary: '换算失败',
          copyText: '',
          error: '时间戳超出可表示范围。',
          summary: '时间戳换算失败',
        };
      }
      const seconds = Math.floor(parsed.epochMs / 1000);
      return {
        primary: conversion.local,
        primaryHint: `本地时间（${localZoneName()}）`,
        copyText: String(seconds),
        rows: [
          { label: '本地', value: conversion.local, emphasis: true },
          { label: 'UTC', value: conversion.utc },
          { label: 'ISO 8601', value: conversion.iso },
          { label: '秒级时间戳', value: String(seconds) },
          { label: '毫秒级时间戳', value: String(parsed.epochMs) },
          { label: '相对现在', value: conversion.relative },
        ],
        footnote: '输入被识别为秒级时间戳，已按此换算。',
        summary: `${conversion.local}（${seconds}）`,
      };
    }

    default: {
      // 穷尽性检查：新增 kind 时这里会编译报错
      const exhaustive: never = parsed;
      return { primary: '', copyText: '', summary: String(exhaustive) };
    }
  }
}

const REGION_LABEL: Record<string, string> = {
  CN: '中国',
  US: '美国',
  UK: '英国',
  JP: '日本',
  NONE: '未启用',
};

/** 当前本地时区的 IANA 名，取不到时退回空串而不是抛异常 */
function localZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
  } catch {
    return '本地时区';
  }
}

/** 相对今天的自然语言描述 */
function relativeLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  if (days === -1) return '昨天';
  if (days === -2) return '前天';
  return days > 0 ? `${days} 天后` : `${Math.abs(days)} 天前`;
}

/**
 * 转成本地时区的 ISO 字符串。
 * 不能直接用 toISOString()——它输出 UTC，东八区会差 8 小时，
 * 用户看到「2026-09-13T16:00:00Z」会以为算错了。
 */
function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
