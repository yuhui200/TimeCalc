/**
 * 时间加减面板。
 *
 * 需求：「时刻 ± 时长，并正确处理跨天」。
 *
 * 与「日期加减」的区别是这里的基准**可能没有日期**（纯时刻），
 * 因此必须显式决定跨天行为。核心层提供两种口径，面板把两种都显示出来：
 *   - **进位（wrap）**：22:00 + 3h → 次日 01:00，同时给出跨了几天
 *   - **当天（clamp）**：结果被夹在本日 00:00–23:59 之内
 * 排班场景要进位，闹钟场景可能要当天，让用户看到差别再选。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addToTime } from '../../core/timeAdd';
import { humanizeDuration } from '../../core/duration';
import { formatDateWithWeekday } from '../../core/format';
import type { Duration, DurationUnit } from '../../core/types';
import {
  Card,
  Chip,
  ChipRow,
  NumberField,
  ResultDisplay,
  Segmented,
  SelectField,
  Switch,
  TimeField,
} from '../../components';
import { useHistoryRecorder } from '../../hooks/useHistory';

type Unit = Extract<DurationUnit, 'hours' | 'minutes' | 'seconds'>;

const UNIT_OPTIONS: ReadonlyArray<{ value: Unit; label: string }> = [
  { value: 'hours', label: '小时' },
  { value: 'minutes', label: '分钟' },
  { value: 'seconds', label: '秒' },
];

/** 常见时长快捷芯片，点一下即累加 */
const QUICK: ReadonlyArray<{ label: string; duration: Duration }> = [
  { label: '5 分钟', duration: { minutes: 5 } },
  { label: '15 分钟', duration: { minutes: 15 } },
  { label: '30 分钟', duration: { minutes: 30 } },
  { label: '1 小时', duration: { hours: 1 } },
  { label: '2 小时', duration: { hours: 2 } },
  { label: '8 小时', duration: { hours: 8 } },
  { label: '12 小时', duration: { hours: 12 } },
];

export function TimeAddPanel() {
  const record = useHistoryRecorder();

  const [base, setBase] = useState(currentClock);
  const [operand, setOperand] = useState(1);
  const [unit, setUnit] = useState<Unit>('hours');
  const [sign, setSign] = useState<'add' | 'subtract'>('add');
  const [pending, setPending] = useState<Duration>({});
  /** 是否在结果里带上日期 */
  const [withDate, setWithDate] = useState(true);

  const usingQuick = Object.keys(pending).length > 0;

  /** 参与计算的时长：优先用累加的 pending，否则用手动输入 */
  const rawDuration = useMemo<Duration>(
    () => (usingQuick ? pending : { [unit]: operand }),
    [usingQuick, pending, unit, operand],
  );

  /** 按运算方向取号 */
  const signedDuration = useMemo<Duration>(() => {
    if (sign === 'add') return rawDuration;
    const out: Duration = {};
    for (const [key, value] of Object.entries(rawDuration) as Array<[DurationUnit, number]>) {
      out[key] = -value;
    }
    return out;
  }, [rawDuration, sign]);

  const wrapResult = useMemo(
    () => (base ? addToTime(base, { duration: signedDuration, mode: 'wrap' }) : null),
    [base, signedDuration],
  );

  const clampResult = useMemo(
    () => (base ? addToTime(base, { duration: signedDuration, mode: 'clamp' }) : null),
    [base, signedDuration],
  );

  useEffect(() => {
    if (!wrapResult) return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'time-add',
        input: `${base} ${sign === 'add' ? '+' : '-'} ${humanizeDuration(rawDuration)}`,
        output: wrapResult.clock,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [wrapResult, base, sign, rawDuration, record]);

  const reset = useCallback(() => setPending({}), []);

  const applyQuick = useCallback((duration: Duration, isSubtract: boolean) => {
    setPending((prev) => {
      const merged: Duration = { ...prev };
      for (const [key, value] of Object.entries(duration) as Array<[DurationUnit, number]>) {
        merged[key] = (merged[key] ?? 0) + (isSubtract ? -value : value);
      }
      return merged;
    });
  }, []);

  /** 结果字符串：带日期时用 core 给的日期标签 */
  const primary = wrapResult
    ? withDate
      ? `${wrapResult.date ? `${formatDateOnly(wrapResult.date)} ` : ''}${wrapResult.clock}`
      : wrapResult.clock
    : '';

  return (
    <div className="flex flex-col gap-4">
      <Card title="时间加减" description="时刻加上或减去一段时长，自动处理跨天。">
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeField
            label="基准时刻"
            value={base}
            onChange={(event) => setBase(event.target.value)}
            action={
              <Chip onClick={() => setBase(currentClock())}>
                现在
              </Chip>
            }
          />
          <NumberField
            label="数量"
            value={operand}
            min={0}
            step={1}
            onChange={(event) => setOperand(Number(event.target.value) || 0)}
            suffix={UNIT_OPTIONS.find((o) => o.value === unit)?.label}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="单位"
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            options={UNIT_OPTIONS}
            disabled={usingQuick}
            hint={usingQuick ? '当前使用快捷累加的时长' : undefined}
          />
          <Segmented
            label="运算"
            value={sign}
            onChange={setSign}
            options={[
              { value: 'add', label: '➕ 加' },
              { value: 'subtract', label: '➖ 减' },
            ]}
          />
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-muted">快捷累加（可连点，再点「重置」清空）</p>
          <ChipRow label="快捷加">
            {QUICK.map((item) => (
              <Chip key={item.label} onClick={() => applyQuick(item.duration, false)}>
                +{item.label}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="快捷减" className="mt-2">
            {QUICK.map((item) => (
              <Chip
                key={`minus-${item.label}`}
                tone="danger"
                onClick={() => applyQuick(item.duration, true)}
              >
                −{item.label}
              </Chip>
            ))}
          </ChipRow>

          {usingQuick ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-[var(--tc-surface-2)] px-3 py-2">
              <span className="text-sm text-ink">
                待累加：
                <strong className="tnum">{humanizeDuration(pending, { showSign: true })}</strong>
              </span>
              <Chip onClick={reset} className="ml-auto">
                重置
              </Chip>
            </div>
          ) : null}
        </div>

        <div className="mt-3 border-t border-line pt-2">
          <Switch
            checked={withDate}
            onChange={setWithDate}
            label="结果带日期"
            description="关闭后只看时刻；跨天信息仍会在明细里给出"
          />
        </div>
      </Card>

      <ResultDisplay
        ready={Boolean(wrapResult)}
        primary={primary}
        primaryHint={
          wrapResult
            ? `${base} ${sign === 'add' ? '+' : '−'} ${humanizeDuration(rawDuration, { showSign: false })}`
            : undefined
        }
        copyText={primary}
        rows={
          wrapResult
            ? [
                { label: '基准时刻', value: base },
                {
                  label: sign === 'add' ? '加上' : '减去',
                  value: humanizeDuration(rawDuration, { showSign: false }),
                },
                {
                  label: '进位口径',
                  value: wrapResult.clock,
                  hint:
                    wrapResult.dayOffset === 0
                      ? '未跨天'
                      : `跨 ${wrapResult.dayOffset > 0 ? '+' : ''}${wrapResult.dayOffset} 天`,
                  emphasis: true,
                },
                {
                  label: '当天口径',
                  value: clampResult?.clock ?? '—',
                  hint: '夹在本日 00:00–23:59 之间',
                },
                {
                  label: '结果日期',
                  value: wrapResult.date ? formatDateWithWeekday(wrapResult.date) : '—',
                },
                { label: '总偏移分钟', value: `${wrapResult.rawMinutes - wrapResult.startMinutes} 分钟` },
              ]
            : undefined
        }
        footnote="「进位口径」保留日期并在跨天时进位；「当天口径」把结果夹在同一天内，不会越界。"
        error={!wrapResult && base ? '时刻格式无法识别，请使用 HH:mm' : undefined}
        placeholder="填写基准时刻后自动计算"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** YYYY-MM-DD，用于拼「日期 + 时刻」的紧凑展示 */
function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
