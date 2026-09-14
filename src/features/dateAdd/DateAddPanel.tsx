/**
 * 日期加减面板。
 *
 * 需求：「加/减 N 天、周、月、年，并提供 +1天/+7天/+30天/+1月 快捷按钮」。
 *
 * 交互设计上区分了两种「加」：
 *   - **快捷芯片**是**累加**的：点三次「+1 天」得到 +3 天，符合「快速试算」的心智；
 *   - **时长输入 + 执行按钮**是一次性的确定操作。
 * 如果快捷芯片也做替换而非累加，用户点第二下时会发现值没变，很困惑。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  QUICK_ADD_PRESETS,
  QUICK_SUBTRACT_PRESETS,
  addDuration,
  subtractDuration,
  type DateAddResult,
} from '../../core/dateAdd';
import { addDurations, humanizeDuration, normalizeDuration } from '../../core/duration';
import { formatDate, formatDateWithWeekday, WEEKDAY_ZH } from '../../core/format';
import { formatLunar } from '../../core/lunar';
import type { Duration } from '../../core/types';
import {
  Card,
  Chip,
  ChipRow,
  DateField,
  NumberField,
  ResultDisplay,
  Segmented,
  SelectField,
  Switch,
} from '../../components';
import { useHistoryRecorder } from '../../hooks/useHistory';

type Unit = 'days' | 'weeks' | 'months' | 'years' | 'hours' | 'minutes';

const UNIT_OPTIONS: ReadonlyArray<{ value: Unit; label: string }> = [
  { value: 'days', label: '天' },
  { value: 'weeks', label: '周' },
  { value: 'months', label: '月' },
  { value: 'years', label: '年' },
  { value: 'hours', label: '小时' },
  { value: 'minutes', label: '分钟' },
];

/** 需要精确时刻（而不是整天）的单位 */
const TIME_UNITS: readonly Unit[] = ['hours', 'minutes'];

function today(): string {
  return formatDate(new Date());
}

export function DateAddPanel() {
  const record = useHistoryRecorder();

  const [base, setBase] = useState(today);
  const [operand, setOperand] = useState(1);
  const [unit, setUnit] = useState<Unit>('days');
  const [sign, setSign] = useState<'add' | 'subtract'>('add');
  /** 快捷芯片累加出来的「待应用」时长 */
  const [pending, setPending] = useState<Duration>({});
  const [showLunar, setShowLunar] = useState(true);

  /** 时间单位需要保留时刻，因此基准值要带 HH:mm */
  const needsTime = TIME_UNITS.includes(unit);

  const baseValue = useMemo(() => {
    if (!base) return null;
    // datetime-local 需要 'YYYY-MM-DDTHH:mm'；纯日期时补 00:00
    return needsTime ? `${base}T09:00` : base;
  }, [base, needsTime]);

  /** 手动输入那一次操作的时长 */
  const manualDuration = useMemo<Duration>(() => ({ [unit]: operand }), [unit, operand]);

  /** 手动结果：时长输入 + 执行按钮 */
  const manualResult = useMemo<DateAddResult | null>(() => {
    if (!baseValue) return null;
    return sign === 'add'
      ? addDuration(baseValue, manualDuration)
      : subtractDuration(baseValue, manualDuration);
  }, [baseValue, manualDuration, sign]);

  /** 快捷芯片结果：累加的 pending 时长 */
  const quickResult = useMemo<DateAddResult | null>(() => {
    if (!baseValue || Object.keys(pending).length === 0) return null;
    return addDuration(baseValue, pending);
  }, [baseValue, pending]);

  // 快捷结果优先展示：用户刚点了芯片，那才是他此刻关心的
  const result = quickResult ?? manualResult;
  const usingQuick = quickResult !== null;

  useEffect(() => {
    if (!result || !base) return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'date-add',
        input: `${base} ${result.sign === 1 ? '+' : '-'} ${humanizeDuration(result.duration)}`,
        output: formatDate(result.output),
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [result, base, record]);

  const applyQuick = useCallback((duration: Duration, isSubtract: boolean) => {
    setPending((prev) =>
      addDurations(prev, isSubtract ? negate(duration) : duration),
    );
  }, []);

  const reset = useCallback(() => {
    setPending({});
    setOperand(1);
  }, []);

  const lunar = useMemo(() => {
    if (!result || !showLunar) return null;
    try {
      return formatLunar(result.output);
    } catch {
      return null;
    }
  }, [result, showLunar]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="日期加减" description="选一个基准日期，再用快捷按钮或自定义时长推演。">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            label="基准日期"
            value={base}
            onChange={(event) => setBase(event.target.value)}
            action={
              <Chip onClick={() => setBase(today())}>
                今天
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
            hint={needsTime ? '以 09:00 为基准时刻推算' : '按自然月/自然年推进'}
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
          <p className="mb-1.5 text-xs font-medium text-muted">
            快捷累加（可连点，再次点击「重置」清空）
          </p>
          <ChipRow label="快捷加">
            {QUICK_ADD_PRESETS.map((preset) => (
              <Chip
                key={`add-${preset.id}`}
                onClick={() => applyQuick(preset.duration, false)}
                tone="default"
              >
                {preset.label}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="快捷减" className="mt-2">
            {QUICK_SUBTRACT_PRESETS.map((preset) => (
              <Chip
                key={`sub-${preset.id}`}
                onClick={() => applyQuick(preset.duration, true)}
                tone="danger"
              >
                {preset.label}
              </Chip>
            ))}
          </ChipRow>

          {Object.keys(pending).length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-[var(--tc-surface-2)] px-3 py-2">
              <span className="text-sm text-ink">
                待累加：<strong className="tnum">{humanizeDuration(pending, { showSign: true })}</strong>
              </span>
              <Chip onClick={reset} className="ml-auto">
                重置
              </Chip>
            </div>
          ) : null}
        </div>

        <div className="mt-3 border-t border-line pt-2">
          <Switch
            checked={showLunar}
            onChange={setShowLunar}
            label="显示农历与节气"
            description="结果附带农历日期、干支与当日节气"
          />
        </div>
      </Card>

      <ResultDisplay
        ready={Boolean(result)}
        primary={result ? formatDate(result.output) : ''}
        primaryHint={
          result
            ? `${formatDateWithWeekday(result.output)}${lunar ? ` · 农历${lunar}` : ''}`
            : undefined
        }
        copyText={result ? formatDate(result.output) : ''}
        rows={
          result
            ? [
                {
                  label: '计算式',
                  value: `${formatDate(result.input)} ${
                    result.sign === 1 ? '+' : '−'
                  } ${humanizeDuration(result.duration, { showSign: false })}`,
                },
                { label: '结果', value: formatDateWithWeekday(result.output), emphasis: true },
                { label: '星期', value: WEEKDAY_ZH[result.weekday] ?? '' },
                {
                  label: '相对基准',
                  value:
                    result.dayShift === 0
                      ? '同一天'
                      : `${Math.abs(result.dayShift)} 天${result.dayShift > 0 ? '后' : '前'}`,
                },
                { label: 'ISO 8601', value: toLocalIso(result.output) },
              ]
            : undefined
        }
        footnote={
          usingQuick
            ? '当前展示的是快捷累加的结果；继续点芯片会继续叠加。'
            : '月份按自然月推进：1 月 31 日 + 1 个月 = 2 月 28/29 日（自动收敛到月末）。'
        }
        placeholder="选择基准日期后即可看到结果"
      />
    </div>
  );
}

function negate(duration: Duration): Duration {
  const out: Duration = {};
  for (const [key, value] of Object.entries(normalizeDuration(duration))) {
    if (value !== 0) out[key as keyof Duration] = -value;
  }
  return out;
}

function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
