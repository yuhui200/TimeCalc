/**
 * 时间差面板。
 *
 * 需求：「计算两个时刻相差多少小时/分钟」。
 *
 * 核心歧义是**跨天**：「23:00 → 01:00」到底是 2 小时还是 22 小时？
 * 这里给出一个显式开关而不是替用户决定，并在结果里说明当前口径——
 * 排班、值班表这类场景两种答案都有人要。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { diffTimes, midpointTime, timeDiffEquivalents } from '../../core/timeDiff';
import {
  Card,
  Chip,
  ChipRow,
  ResultDisplay,
  Segmented,
  StatList,
  StatRow,
  Switch,
  TimeField,
} from '../../components';
import { useHistoryRecorder } from '../../hooks/useHistory';

type Mode = 'same-day' | 'overnight';

/** 常用班次，一键填入 */
const SHIFTS: ReadonlyArray<{ label: string; start: string; end: string }> = [
  { label: '标准班 9–18', start: '09:00', end: '18:00' },
  { label: '上午 9–12', start: '09:00', end: '12:00' },
  { label: '下午 13–18', start: '13:00', end: '18:00' },
  { label: '早班 6–14', start: '06:00', end: '14:00' },
  { label: '晚班 14–22', start: '14:00', end: '22:00' },
  { label: '夜班 22–06', start: '22:00', end: '06:00' },
];

export function TimeDiffPanel() {
  const record = useHistoryRecorder();

  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [mode, setMode] = useState<Mode>('same-day');
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [showBreak, setShowBreak] = useState(false);

  const result = useMemo(
    () =>
      diffTimes(start, end, {
        whenReversed: mode === 'overnight' ? 'overnight' : 'signed',
      }),
    [start, end, mode],
  );

  // 扣除休息时长后的净时长。取绝对值是因为「当天之内」口径下 diffMinutes 可能为负，
  // 而「扣除休息后还剩多久」与方向无关。
  const netMinutes = result ? Math.max(0, Math.abs(result.diffMinutes) - breakMinutes) : 0;

  const equivalents = useMemo(
    () => (result ? timeDiffEquivalents(netMinutes) : null),
    [result, netMinutes],
  );

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'time-diff',
        input: `${start} → ${end}`,
        output: result.human,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [result, start, end, record]);

  const swap = useCallback(() => {
    setStart(end);
    setEnd(start);
  }, [start, end]);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="时间差"
        description="只比较时刻本身，不涉及日期。"
        actions={
          <Chip onClick={swap} title="交换起止时刻">
            ⇄ 交换
          </Chip>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeField
            label="开始时刻"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <TimeField
            label="结束时刻"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>

        <div className="mt-3">
          <Segmented
            label="跨天处理"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'same-day', label: '当天之内' },
              { value: 'overnight', label: '按跨天计' },
            ]}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted">
            {mode === 'same-day'
              ? '结束早于开始时结果为负数，例如 23:00 → 01:00 得 −22 小时。'
              : '结束早于开始时按次日处理，例如 23:00 → 01:00 得 2 小时。'}
          </p>
        </div>

        <div className="mt-3">
          <ChipRow label="常用班次">
            {SHIFTS.map((shift) => (
              <Chip
                key={shift.label}
                active={start === shift.start && end === shift.end}
                onClick={() => {
                  setStart(shift.start);
                  setEnd(shift.end);
                  // 夜班自动切到跨天口径，否则答案会差 16 小时
                  setMode(shift.end < shift.start ? 'overnight' : 'same-day');
                }}
              >
                {shift.label}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="mt-3 border-t border-line pt-2">
          <Switch
            checked={showBreak}
            onChange={(next) => {
              setShowBreak(next);
              if (!next) setBreakMinutes(0);
              else if (breakMinutes === 0) setBreakMinutes(60);
            }}
            label="扣除休息时长"
            description="如午休 60 分钟，用于计算实际工时"
          />
          {showBreak ? (
            <div className="mt-1">
              <ChipRow label="常用休息时长">
                {[30, 45, 60, 90, 120].map((minutes) => (
                  <Chip
                    key={minutes}
                    active={breakMinutes === minutes}
                    onClick={() => setBreakMinutes(minutes)}
                  >
                    {minutes} 分钟
                  </Chip>
                ))}
              </ChipRow>
            </div>
          ) : null}
        </div>
      </Card>

      <ResultDisplay
        ready={Boolean(result)}
        primary={result ? (showBreak ? formatMinutes(netMinutes) : result.human) : ''}
        primaryHint={
          result
            ? `${start} → ${end}${showBreak && breakMinutes > 0 ? `（已扣除 ${breakMinutes} 分钟休息）` : ''}`
            : undefined
        }
        copyText={result ? formatMinutes(showBreak ? netMinutes : result.diffMinutes) : ''}
        rows={
          result
            ? [
                {
                  label: '净时长',
                  value: formatMinutes(netMinutes),
                  emphasis: true,
                  hint: breakMinutes > 0 ? `扣休息 ${breakMinutes} 分钟` : undefined,
                },
                { label: '总分钟', value: `${netMinutes} 分钟` },
                { label: '总小时', value: `${(netMinutes / 60).toFixed(2)} 小时` },
                { label: '时钟表示', value: equivalents?.clock ?? '—' },
                { label: '中点', value: midpointTime(start, end) ?? '—' },
                {
                  label: '占一天',
                  value: `${(equivalents?.percentOfDay ?? 0).toFixed(1)} %`,
                },
                {
                  label: '占 8 小时工作制',
                  value: `${(equivalents?.percentOfWorkday ?? 0).toFixed(1)} %`,
                },
              ]
            : undefined
        }
        footnote={
          result?.overnight
            ? '结束时刻早于开始时刻，已按跨天（+24 小时）处理。'
            : '同一天内的两个时刻之差。若跨过午夜请切换到「按跨天计」。'
        }
        error={!result && start && end ? '时刻格式无法识别，请使用 HH:mm' : undefined}
        placeholder="填写两个时刻后自动计算"
      />

      {result ? (
        <Card title="按时长换算" flush>
          <StatList className="px-4 pb-2 sm:px-5">
            <StatRow label="秒" value={`${netMinutes * 60} s`} />
            <StatRow label="天（按 8 小时工作制）" value={`${(netMinutes / 480).toFixed(2)} 个工作日`} />
            <StatRow label="周（按 40 小时工作制）" value={`${(netMinutes / 2400).toFixed(3)} 周`} />
          </StatList>
        </Card>
      ) : null}
    </div>
  );
}

/** 把分钟数格式化成「X 小时 Y 分钟」 */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} 分钟`;
  if (minutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${minutes} 分钟`;
}
