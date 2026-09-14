/**
 * 日期差面板。
 *
 * 需求：「计算两个日期相差多少天 / 周 / 月 / 工作日」。
 *
 * 面板默认就是「今天 → 今天」，并把常用区间做成一键芯片，
 * 目的是让用户**不用打字**就能得到答案。
 *
 * 「含首尾」这个歧义在这里被显式摊开：同一个 1 月 1 日到 1 月 3 日，
 * 相差天数是 2，日历天数是 3。两个都给出来，比替用户猜要诚实。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { diffDates } from '../../core/dateDiff';
import { getHolidaySet, getHolidays } from '../../core/holidays';
import { humanizeDuration } from '../../core/duration';
import { formatDate, formatDateWithWeekday } from '../../core/format';
import { addDays } from '../../core/dateAdd';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  DateField,
  ResultDisplay,
  Segmented,
  StatList,
  StatRow,
  Switch,
} from '../../components';
import { useSettings } from '../../hooks/useSettings';
import { useHistoryRecorder } from '../../hooks/useHistory';

/** 输入框里的日期字符串，空串表示「今天」 */
function today(): string {
  return formatDate(new Date());
}

type RangePreset = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'next30' | 'next90';

const PRESETS: ReadonlyArray<{ id: RangePreset; label: string; resolve: () => [string, string] }> = [
  { id: 'today', label: '今天', resolve: () => [today(), today()] },
  {
    id: 'thisWeek',
    label: '本周',
    resolve: () => {
      const now = new Date();
      // 以周一为一周起点（与设置默认一致；这里用固定值避免与设置的耦合）
      const dow = (now.getDay() + 6) % 7;
      return [formatDate(addDays(now, -dow)), formatDate(addDays(now, 6 - dow))];
    },
  },
  {
    id: 'thisMonth',
    label: '本月',
    resolve: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return [formatDate(first), formatDate(last)];
    },
  },
  {
    id: 'thisYear',
    label: '今年',
    resolve: () => {
      const y = new Date().getFullYear();
      return [`${y}-01-01`, `${y}-12-31`];
    },
  },
  { id: 'next30', label: '未来 30 天', resolve: () => [today(), formatDate(addDays(new Date(), 30))] },
  { id: 'next90', label: '未来 90 天', resolve: () => [today(), formatDate(addDays(new Date(), 90))] },
];

export function DateDiffPanel() {
  const { settings } = useSettings();
  const record = useHistoryRecorder();

  // 默认「今天 → 今天」：需求要求「默认今天」，并且空态不应是空的
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [inclusive, setInclusive] = useState(true);
  const [useHolidays, setUseHolidays] = useState(true);

  const result = useMemo(() => {
    if (!start || !end) return null;

    // 提前算出区间涉及的年份，避免把 200 年的节假日表全load进来
    const y1 = new Date(start).getFullYear();
    const y2 = new Date(end).getFullYear();
    const years = Number.isFinite(y1) && Number.isFinite(y2) ? [y1, y2] : [new Date().getFullYear()];

    const set =
      useHolidays && settings.holidayRegion !== 'NONE'
        ? getHolidaySet(settings.holidayRegion, years)
        : { holidays: new Set<string>(), extraWorkdays: new Set<string>() };

    return diffDates(start, end, {
      weekendDays: settings.weekend,
      // 勾选「含首尾」时两端都计入，否则都不计——这是用户能理解的两种口径
      inclusiveStart: inclusive,
      inclusiveEnd: inclusive,
      holidays: set.holidays,
      extraWorkdays: set.extraWorkdays,
    });
  }, [start, end, inclusive, useHolidays, settings.holidayRegion, settings.weekend]);

  // 历史上只在结果稳定后记录一次，避免用户逐字输入日期时刷屏
  useEffect(() => {
    if (!result || !start || !end) return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'date-diff',
        input: `${start} → ${end}`,
        output: `${Number(result.total.days.toFixed(2))} 天`,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [result, start, end, record]);

  const applyPreset = useCallback((preset: RangePreset) => {
    const entry = PRESETS.find((p) => p.id === preset);
    if (!entry) return;
    const [from, to] = entry.resolve();
    setStart(from);
    setEnd(to);
  }, []);

  const swap = useCallback(() => {
    setStart(end);
    setEnd(start);
  }, [start, end]);

  const exactDays = result ? Number(result.total.days.toFixed(2)) : 0;
  const direction = result?.sign === -1 ? '（结束早于开始）' : '';

  // 区间内的节日名称，用于结果脚注
  const holidayNames = useMemo(() => {
    if (!result || !useHolidays || settings.holidayRegion === 'NONE') return [];
    const y1 = new Date(start).getFullYear();
    const y2 = new Date(end).getFullYear();
    const years = new Set<number>();
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) && years.size < 20; y += 1) years.add(y);
    const names = new Set<string>();
    for (const year of years) {
      for (const entry of getHolidays(year, settings.holidayRegion)) {
        if (entry.kind === 'holiday' && entry.date >= start && entry.date <= end) {
          names.add(entry.name);
        }
      }
    }
    return [...names];
  }, [result, start, end, useHolidays, settings.holidayRegion]);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="日期差"
        description="默认「今天 → 今天」，改任一端即时出结果。"
        actions={
          <Chip onClick={swap} title="交换起止日期">
            ⇄ 交换
          </Chip>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            label="开始日期"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            action={
              <Chip onClick={() => setStart(today())}>
                今天
              </Chip>
            }
          />
          <DateField
            label="结束日期"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            action={
              <Chip onClick={() => setEnd(today())}>
                今天
              </Chip>
            }
          />
        </div>

        <div className="mt-3">
          <ChipRow label="常用区间">
            {PRESETS.map((preset) => (
              <Chip key={preset.id} onClick={() => applyPreset(preset.id)}>
                {preset.label}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="mt-4 grid gap-1 border-t border-line pt-3 sm:grid-cols-2">
          <Switch
            checked={inclusive}
            onChange={setInclusive}
            label="首尾两天都算"
            description="关闭后为「相隔几天」的口径"
          />
          <Switch
            checked={useHolidays && settings.holidayRegion !== 'NONE'}
            onChange={setUseHolidays}
            label="扣除法定节假日"
            description={
              settings.holidayRegion === 'NONE'
                ? '当前未选择节假日地区（可在设置中启用）'
                : `按「${REGION_LABEL[settings.holidayRegion] ?? settings.holidayRegion}」计算`
            }
            disabled={settings.holidayRegion === 'NONE'}
          />
        </div>
      </Card>

      <ResultDisplay
        ready={Boolean(result)}
        primary={result ? `${exactDays} 天` : ''}
        primaryHint={
          result
            ? `${formatDateWithWeekday(result.start)} → ${formatDateWithWeekday(result.end)}${direction}`
            : undefined
        }
        copyText={result ? `${formatDate(result.start)} 到 ${formatDate(result.end)}：${exactDays} 天` : ''}
        rows={
          result
            ? [
                { label: '相差天数（精确）', value: `${exactDays} 天`, emphasis: true },
                { label: '日历天数', value: `${result.calendarDays} 天`, hint: inclusive ? '含首尾' : '不含首尾' },
                { label: '自然日跨度', value: `${result.spanDays} 天` },
                { label: '整周', value: `${Math.floor(result.total.weeks)} 周` },
                { label: '整月', value: `${Math.floor(result.total.months)} 个月` },
                {
                  label: '日历分解',
                  value: humanizeDuration(result.calendar, { maxUnits: 3, showSign: true }),
                },
                {
                  label: '工作日',
                  value: `${result.workdays} 天`,
                  hint: result.holidays > 0 ? `已扣除 ${result.holidays} 天节假日` : undefined,
                  emphasis: true,
                },
                { label: '周末', value: `${result.weekendDays} 天` },
                { label: '节假日', value: `${result.holidays} 天` },
                { label: '总小时', value: `${Math.round(result.total.hours)} 小时` },
              ]
            : undefined
        }
        footnote={
          holidayNames.length > 0
            ? `区间内包含：${holidayNames.slice(0, 6).join('、')}${holidayNames.length > 6 ? ' 等' : ''}`
            : '「相差天数」为精确值；「日历天数」按整天计数，勾选含首尾时比前者多 1。'
        }
        error={!start || !end ? '请填写完整的开始与结束日期' : undefined}
      />

      {settings.holidayRegion !== 'NONE' && useHolidays ? (
        <Card title="区间内的节假日" flush>
          <HolidayList start={start} end={end} region={settings.holidayRegion} />
        </Card>
      ) : null}
    </div>
  );
}

const REGION_LABEL: Record<string, string> = {
  CN: '中国',
  US: '美国',
  UK: '英国',
  JP: '日本',
  NONE: '未启用',
};

/** 区间内节假日明细；没有则显示一行提示 */
function HolidayList({
  start,
  end,
  region,
}: {
  start: string;
  end: string;
  region: 'CN' | 'US' | 'UK' | 'JP' | 'NONE';
}) {
  const rows = useMemo(() => {
    if (region === 'NONE' || !start || !end) return [];
    const y1 = new Date(start).getFullYear();
    const y2 = new Date(end).getFullYear();
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return [];

    const out: Array<{ date: string; name: string; approximate: boolean }> = [];
    const years = new Set<number>();
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) && years.size < 20; y += 1) years.add(y);

    for (const year of years) {
      for (const entry of getHolidays(year, region)) {
        if (entry.kind !== 'holiday') continue;
        if (entry.date < start || entry.date > end) continue;
        // HolidayEntry.approximate 是可选的，缺失时按「已确认」对待
        out.push({ date: entry.date, name: entry.name, approximate: entry.approximate === true });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [start, end, region]);

  if (rows.length === 0) {
    return <p className="px-4 py-4 text-sm text-muted sm:px-5">区间内没有法定节假日。</p>;
  }

  return (
    <StatList className="px-4 pb-2 sm:px-5">
      {rows.map((row) => (
        <StatRow
          key={`${row.date}-${row.name}`}
          label={
            <span className="flex items-center gap-2">
              {row.name}
              {row.approximate ? <Badge tone="warn">推算</Badge> : null}
            </span>
          }
          value={formatDateWithWeekday(row.date)}
        />
      ))}
    </StatList>
  );
}
