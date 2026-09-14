/**
 * Unix 时间戳面板。
 *
 * 需求：「时间戳与日期互转」。
 *
 * 最容易出错的地方是**单位**：同一个 1757836800 是秒，1757836800000 是毫秒，
 * 用户往往不知道自己在哪一边。因此这里：
 *   - 自动探测单位，但把探测结果**显式说出来**，并允许手动覆盖；
 *   - 秒 / 毫秒 / 微秒 / 纳秒四个结果全部列出，用户直接对照取用；
 *   - 提供一个实时跳动的「当前时间戳」，方便做日志对时。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EPOCH_UNIT_LABELS,
  convertEpoch,
  dateToEpochs,
  detectEpochUnit,
  nowEpoch,
  parseEpochInput,
  type EpochUnit,
} from '../../core/unix';
import { ISO_LOCAL_FMT, formatDateTime } from '../../core/format';
import { formatInZone } from '../../core/timezone';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  DateTimeField,
  ResultDisplay,
  Segmented,
  SelectField,
  StatList,
  StatRow,
  TextField,
} from '../../components';
import { useSettings } from '../../hooks/useSettings';
import { useHistoryRecorder } from '../../hooks/useHistory';
import { useNow } from '../../hooks/useCountdown';

/** 用户可以手动指定的单位；'auto' 交给核心层探测 */
type UnitChoice = 'auto' | 'seconds' | 'milliseconds';

const UNIT_OPTIONS: ReadonlyArray<{ value: UnitChoice; label: string }> = [
  { value: 'auto', label: '自动识别' },
  { value: 'seconds', label: '秒（10 位）' },
  { value: 'milliseconds', label: '毫秒（13 位）' },
];

/** 常用参照时刻，帮助用户确认单位与口径 */
const ANCHORS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: 'Unix 纪元', seconds: 0 },
  { label: 'Y2K 2000-01-01', seconds: 946_684_800 },
  { label: '2038 问题', seconds: 2_145_916_497 },
];

const DEFAULT_PLACEHOLDER = '1757836800';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 当前本地时间的 datetime-local 值 */
function nowLocalInput(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

export function UnixPanel() {
  const { settings, update } = useSettings();
  const record = useHistoryRecorder();

  const [raw, setRaw] = useState('');
  const [unitChoice, setUnitChoice] = useState<UnitChoice>('auto');
  const [dateInput, setDateInput] = useState(nowLocalInput);

  // 只在用户没在输入时间戳时才让秒表跑，避免打断他正在看的数字。
  // 毫秒模式下需要更快的节拍，否则末三位看起来像卡住了。
  const live = useNow(raw.trim() === '', settings.epochUnit === 'ms' ? 100 : 1000);

  /** 输入被解析成的数字与「用户没指定时的探测单位」 */
  const parsedInput = useMemo(() => {
    const text = raw.trim();
    if (!text) return null;
    return parseEpochInput(text);
  }, [raw]);

  /** 实际使用的单位：手动优先，否则用探测结果（'auto' 时核心层再探一次） */
  const resolvedUnit = useMemo<Exclude<EpochUnit, 'auto'> | 'auto'>(() => {
    if (unitChoice !== 'auto') return unitChoice;
    if (!parsedInput) return 'auto';
    // parseEpochInput 可能已从后缀（如 '1700000000ms'）给出确定单位
    return parsedInput.unit === 'auto' ? 'auto' : parsedInput.unit;
  }, [unitChoice, parsedInput]);

  const conversion = useMemo(() => {
    if (!parsedInput) return null;
    return convertEpoch(parsedInput.value, resolvedUnit);
  }, [parsedInput, resolvedUnit]);

  /** 日期 → 时间戳方向 */
  const dateEpochs = useMemo(() => {
    if (!dateInput) return null;
    return dateToEpochs(dateInput.replace('T', ' '));
  }, [dateInput]);

  useEffect(() => {
    if (!conversion || !parsedInput) return;
    const timer = window.setTimeout(() => {
      void record({ kind: 'unix', input: String(parsedInput.value), output: conversion.local });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [conversion, parsedInput, record]);

  const fillNow = useCallback(() => {
    setRaw(String(nowEpoch(settings.epochUnit === 'ms' ? 'milliseconds' : 'seconds')));
  }, [settings.epochUnit]);

  /**
   * 探测说明。
   * 单位猜错是这类工具最常见的坑，所以把「我按什么读的」明写出来，
   * 而不是让用户对着一个离谱的日期自己猜。
   */
  const unitNote = useMemo(() => {
    if (!parsedInput) return '粘贴时间戳即可，非数字字符会被自动过滤';
    if (unitChoice !== 'auto') {
      return `已按你指定的「${EPOCH_UNIT_LABELS[unitChoice]}」解读`;
    }
    const unit = conversion?.unit ?? detectEpochUnit(parsedInput.value);
    return `已按「${EPOCH_UNIT_LABELS[unit]}」解读（${raw.trim().length} 个字符）`;
  }, [parsedInput, unitChoice, conversion, raw]);

  const error = raw.trim() !== '' && !conversion ? '无法识别为时间戳，请输入纯数字' : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card title="时间戳 → 日期" description="支持秒 / 毫秒 / 微秒 / 纳秒，默认自动识别。">
        <TextField
          label="Unix 时间戳"
          value={raw}
          // 顺手过滤掉千分位逗号、空格等粘贴时常见的杂质
          onChange={(event) => setRaw(event.target.value.replace(/[^\d.-]/g, ''))}
          placeholder={DEFAULT_PLACEHOLDER}
          inputMode="numeric"
          mono
          spellCheck={false}
          autoComplete="off"
          hint={unitNote}
          error={error}
          action={<Chip onClick={fillNow}>当前</Chip>}
        />

        <div className="mt-3">
          <Segmented label="单位" value={unitChoice} onChange={setUnitChoice} options={UNIT_OPTIONS} />
          <p className="mt-1.5 text-xs leading-snug text-muted">
            自动识别规则：|v| &lt; 10¹¹ 视为秒，&lt; 10¹⁴ 视为毫秒，&lt; 10¹⁷ 视为微秒，
            再大按纳秒。也可以直接写后缀，如 1757836800ms。结果不对时请手动指定单位。
          </p>
        </div>

        <div className="mt-3">
          <ChipRow label="参照时刻">
            {ANCHORS.map((anchor) => (
              <Chip key={anchor.label} onClick={() => setRaw(String(anchor.seconds))}>
                {anchor.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </Card>

      <ResultDisplay
        ready={Boolean(conversion)}
        primary={conversion ? conversion.local : ''}
        primaryHint={
          conversion
            ? `本地时间（${localZoneName()}）· 按${EPOCH_UNIT_LABELS[conversion.unit]}解读`
            : undefined
        }
        copyText={conversion ? conversion.local : ''}
        rows={
          conversion
            ? [
                { label: '本地时间', value: conversion.local, emphasis: true },
                {
                  label: 'UTC',
                  value: formatInZone(conversion.epochMs, 'UTC', 'YYYY-MM-DD HH:mm:ss'),
                  hint: 'UTC+00:00',
                },
                {
                  label: '北京时间',
                  value: formatInZone(conversion.epochMs, 'Asia/Shanghai', 'YYYY-MM-DD HH:mm:ss'),
                  hint: 'UTC+08:00',
                },
                { label: 'ISO 8601', value: conversion.iso },
                { label: '相对现在', value: conversion.relative },
                { label: '秒', value: String(Math.floor(conversion.seconds)) },
                { label: '毫秒', value: String(conversion.milliseconds) },
                { label: '微秒', value: String(Math.floor(conversion.epochMs * 1e3)) },
                { label: '纳秒', value: String(Math.floor(conversion.epochMs * 1e6)) },
              ]
            : undefined
        }
        footnote="时间戳是 UTC 的绝对时刻，本身与时区无关；上面各时区只是同一时刻的不同写法。"
        error={error}
        placeholder="输入时间戳，或用下方的「日期 → 时间戳」"
      />

      <Card title="日期 → 时间戳" description="反方向换算，四种精度一次给全。">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateTimeField
            label="日期时间"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            hint="按本机时区理解"
            action={<Chip onClick={() => setDateInput(nowLocalInput())}>现在</Chip>}
          />
          <SelectField
            label="默认单位"
            value={settings.epochUnit}
            onChange={(event) => update({ epochUnit: event.target.value as 's' | 'ms' })}
            options={[
              { value: 's', label: '秒（10 位）' },
              { value: 'ms', label: '毫秒（13 位）' },
            ]}
            hint="决定「当前」按钮填入的位数"
          />
        </div>

        {dateEpochs ? (
          <StatList className="mt-4 border-t border-line pt-1">
            <StatRow label="秒" value={String(dateEpochs.seconds)} emphasis />
            <StatRow label="毫秒" value={String(dateEpochs.milliseconds)} />
            <StatRow label="微秒" value={String(dateEpochs.microseconds)} />
            <StatRow label="纳秒" value={String(dateEpochs.nanoseconds)} />
            <StatRow
              label="ISO 8601（本地）"
              value={formatDateTime(dateInput.replace('T', ' '), ISO_LOCAL_FMT)}
            />
          </StatList>
        ) : (
          <p className="mt-3 text-sm text-muted">请输入合法的日期时间。</p>
        )}
      </Card>

      <Card title="实时时间戳" description="可直接用于日志对时。">
        <div className="flex flex-wrap items-center gap-3">
          <p className="tnum text-2xl font-semibold text-ink sm:text-3xl">
            {settings.epochUnit === 'ms' ? live : Math.floor(live / 1000)}
          </p>
          <Badge tone="accent">{settings.epochUnit === 'ms' ? '毫秒' : '秒'}</Badge>
          <Chip
            className="ml-auto"
            onClick={() => update({ epochUnit: settings.epochUnit === 'ms' ? 's' : 'ms' })}
          >
            切换单位
          </Chip>
        </div>
        <p className="mt-2 text-xs leading-snug text-muted">
          本地 {formatDateTime(new Date(live), 'YYYY-MM-DD HH:mm:ss')} · UTC{' '}
          {formatInZone(new Date(live), 'UTC', 'YYYY-MM-DD HH:mm:ss')}
        </p>
        <div className="mt-2">
          <ChipRow label="复制当前时间戳">
            <Chip
              onClick={() => {
                setRaw(String(Math.floor(live / 1000)));
              }}
            >
              填入秒
            </Chip>
            <Chip onClick={() => setRaw(String(live))}>填入毫秒</Chip>
          </ChipRow>
        </div>
      </Card>
    </div>
  );
}

/** Intl 拿不到时（极老的 WebView）回退到泛称 */
function localZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本机时区';
  } catch {
    return '本机时区';
  }
}
