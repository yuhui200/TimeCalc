/**
 * 时区换算面板。
 *
 * 需求：「北京 / 纽约 / 伦敦 / 东京 / UTC 等时区互转」。
 *
 * 这个面板承载三件事，用分段控件切换：
 *   1. **换算**：一个时刻从一个时区换到另一个
 *   2. **世界时钟**：常驻若干个城市的当前时间
 *   3. **会议规划**：找出几地都在工作时间的重叠区间
 *
 * 「正在使用哪个时区」这件事必须一直可见——时区算错往往不是算错，
 * 而是用户以为在用别的时区。因此源时区默认取本机时区并显著标注。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ZONES,
  convertWallClock,
  findZone,
  formatInZone,
  formatOffset,
  getLocalZone,
  hourDifference,
  overlappingWorkHours,
  searchZones,
  zoneBoard,
} from '../../core/timezone';
import type { TimeZoneId } from '../../core/types';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  DateTimeField,
  EmptyState,
  ResultDisplay,
  Segmented,
  SelectField,
  StatList,
  StatRow,
} from '../../components';
import { useSettings } from '../../hooks/useSettings';
import { useHistoryRecorder } from '../../hooks/useHistory';
import { useNow } from '../../hooks/useCountdown';

type Mode = 'convert' | 'board' | 'meeting';

/** 当前本地时间的 datetime-local 值 */
function nowLocalInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

export function TimezonePanel() {
  const { settings, update } = useSettings();
  const record = useHistoryRecorder();

  const [mode, setMode] = useState<Mode>('convert');
  const [wallClock, setWallClock] = useState(nowLocalInput);
  const [fromZone, setFromZone] = useState<TimeZoneId>(() => getLocalZone().id as TimeZoneId);
  const [toZone, setToZone] = useState<TimeZoneId>(settings.defaultToZone as TimeZoneId);
  const [query, setQuery] = useState('');

  // 世界时钟需要每秒刷新
  const now = useNow(mode !== 'convert');

  const zoneOptions = useMemo(() => {
    const list = query.trim() ? searchZones(query) : ZONES;
    return list.map((zone) => ({
      value: zone.id,
      label: `${zone.label}（${zone.id}）`,
    }));
  }, [query]);

  const conversion = useMemo(() => {
    if (!wallClock || !fromZone || !toZone) return null;
    // datetime-local 的值是 'YYYY-MM-DDTHH:mm'，核心层接受空格分隔
    const normalized = wallClock.replace('T', ' ');
    return convertWallClock(normalized, fromZone, toZone);
  }, [wallClock, fromZone, toZone]);

  useEffect(() => {
    if (!conversion || mode !== 'convert') return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'timezone',
        input: `${wallClock.replace('T', ' ')} ${fromZone} → ${toZone}`,
        output: conversion.to.formatted.slice(0, 16),
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [conversion, wallClock, fromZone, toZone, mode, record]);

  const swap = useCallback(() => {
    setFromZone(toZone);
    setToZone(fromZone);
  }, [fromZone, toZone]);

  const localZone = useMemo(() => getLocalZone(), []);

  /** 把当前设置里的常驻时区作为世界时钟列表 */
  const pinnedZones = useMemo(
    () => settings.pinnedZones.filter((id): id is TimeZoneId => Boolean(findZone(id))),
    [settings.pinnedZones],
  );

  const addPinned = useCallback(
    (id: string) => {
      if (settings.pinnedZones.includes(id)) return;
      update({ pinnedZones: [...settings.pinnedZones, id] });
    },
    [settings.pinnedZones, update],
  );

  const removePinned = useCallback(
    (id: string) => {
      const next = settings.pinnedZones.filter((zone) => zone !== id);
      // 至少保留一个，否则世界时钟会空掉
      if (next.length === 0) return;
      update({ pinnedZones: next });
    },
    [settings.pinnedZones, update],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card title="时区换算" description={`本机时区：${localZone.label}（${localZone.id}）`}>
        <Segmented
          label="模式"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'convert', label: '换算' },
            { value: 'board', label: '世界时钟' },
            { value: 'meeting', label: '会议规划' },
          ]}
        />

        {mode === 'convert' ? (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DateTimeField
                label="时刻"
                value={wallClock}
                onChange={(event) => setWallClock(event.target.value)}
                action={
                  <Chip onClick={() => setWallClock(nowLocalInput())}>现在</Chip>
                }
                hint="按源时区的墙上时间理解"
              />
              <div className="flex items-end">
                <Chip onClick={swap} className="w-full">
                  ⇄ 交换源与目标时区
                </Chip>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectField
                label="源时区"
                value={fromZone}
                onChange={(event) => setFromZone(event.target.value as TimeZoneId)}
                options={zoneOptions}
                hint={fromZone === localZone.id ? '与本机时区一致' : '注意：不是本机时区'}
              />
              <SelectField
                label="目标时区"
                value={toZone}
                onChange={(event) => setToZone(event.target.value as TimeZoneId)}
                options={zoneOptions}
              />
            </div>

            <div className="mt-3">
              <ChipRow label="常用时区">
                {['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].map(
                  (id) => (
                    <Chip
                      key={id}
                      active={toZone === id}
                      onClick={() => setToZone(id as TimeZoneId)}
                    >
                      {findZone(id)?.label ?? id}
                    </Chip>
                  ),
                )}
              </ChipRow>
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <label className="text-xs font-medium text-muted" htmlFor="zone-search">
                搜索时区（支持中文名、英文名、缩写）
              </label>
              <input
                id="zone-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="如：纽约 / newyork / PST"
                className="mt-1.5 w-full min-h-tap rounded-xl border-2 border-[var(--tc-line)] bg-[var(--tc-surface-2)] px-3 text-base text-ink placeholder:text-muted focus:border-[var(--tc-accent)] focus:outline-none"
              />
            </div>
          </>
        ) : null}

        {mode === 'board' ? (
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-muted">
              常驻时区（点击下方按钮添加，点标签上的 × 移除）
            </p>
            <ChipRow label="常驻时区">
              {pinnedZones.map((id) => (
                <Chip key={id} onClick={() => removePinned(id)} title="点击移除">
                  {findZone(id)?.label ?? id} ✕
                </Chip>
              ))}
            </ChipRow>

            <div className="mt-3">
              <SelectField
                label="添加时区"
                value=""
                onChange={(event) => {
                  if (event.target.value) addPinned(event.target.value);
                }}
                options={[
                  { value: '', label: '选择要添加的时区…' },
                  ...ZONES.filter((zone) => !settings.pinnedZones.includes(zone.id)).map((zone) => ({
                    value: zone.id,
                    label: `${zone.label}（${zone.id}）`,
                  })),
                ]}
              />
            </div>
          </div>
        ) : null}
      </Card>

      {mode === 'convert' ? (
        <ResultDisplay
          ready={Boolean(conversion)}
          primary={conversion ? conversion.to.formatted.slice(0, 16) : ''}
          primaryHint={conversion ? `${findZone(toZone)?.label ?? toZone} 当地时间` : undefined}
          copyText={conversion ? conversion.to.formatted.slice(0, 16) : ''}
          rows={
            conversion
              ? [
                  {
                    label: `${findZone(fromZone)?.label ?? fromZone}`,
                    value: conversion.from.formatted.slice(0, 19),
                    hint: formatOffset(conversion.from.offsetMinutes),
                  },
                  {
                    label: `${findZone(toZone)?.label ?? toZone}`,
                    value: conversion.to.formatted.slice(0, 19),
                    hint: formatOffset(conversion.to.offsetMinutes),
                    emphasis: true,
                  },
                  {
                    label: '时差',
                    value: `${conversion.offsetDeltaHours >= 0 ? '+' : ''}${conversion.offsetDeltaHours} 小时`,
                  },
                  {
                    label: 'UTC',
                    value: formatInZone(conversion.epochMs, 'UTC', 'YYYY-MM-DD HH:mm:ss'),
                  },
                  { label: 'Unix 时间戳', value: String(Math.floor(conversion.epochMs / 1000)) },
                ]
              : undefined
          }
          footnote={
            conversion
              ? conversion.dayShift === 0
                ? '两地处于同一天。'
                : `目标时区日期比源时区${conversion.dayShift > 0 ? '晚' : '早'} ${Math.abs(conversion.dayShift)} 天。`
              : '夏令时切换日可能出现 23 小时或 25 小时的一天，换算结果以 IANA 时区数据库为准。'
          }
          error={!conversion && wallClock ? '换算失败，请检查时区与时刻格式' : undefined}
        />
      ) : null}

      {mode === 'board' ? <WorldClockBoard now={now} zones={pinnedZones} /> : null}

      {mode === 'meeting' ? (
        <MeetingPlanner now={now} zones={pinnedZones} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 世界时钟                                                            */
/* ------------------------------------------------------------------ */

function WorldClockBoard({ now, zones }: { now: number; zones: TimeZoneId[] }) {
  const board = useMemo(() => zoneBoard(new Date(now), zones), [now, zones]);

  if (board.length === 0) {
    return (
      <Card flush>
        <EmptyState
          icon="🌍"
          title="还没有常驻时区"
          description="在上方「世界时钟」里添加城市，这里会显示它们的当前时间。"
          compact
        />
      </Card>
    );
  }

  return (
    <Card title="世界时钟" description="每秒刷新；昼夜用图标区分">
      <ul className="grid gap-2 sm:grid-cols-2">
        {board.map((entry) => (
          <li
            key={entry.zone.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-[var(--tc-surface-2)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                <span aria-hidden="true">{entry.isDaytime ? '☀️' : '🌙'}</span>
                {entry.zone.label}
              </p>
              <p className="truncate text-xs text-muted">
                {entry.zone.id} · {formatOffset(entry.offsetMinutes)}
                {entry.dayShift !== 0 ? (
                  <span className="ml-1 text-[var(--tc-warn)]">
                    {entry.dayShift > 0 ? `+${entry.dayShift}` : entry.dayShift} 天
                  </span>
                ) : null}
              </p>
            </div>
            <p className="tnum shrink-0 text-lg font-semibold text-ink">{entry.time}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-snug text-muted">
        ☀️ 表示当地时间在 06:00–18:00 之间。跨日提示表示该城市与前一天/后一天不同日。
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 会议规划                                                            */
/* ------------------------------------------------------------------ */

function MeetingPlanner({ now, zones }: { now: number; zones: TimeZoneId[] }) {
  const ranges = useMemo(
    () => (zones.length >= 2 ? overlappingWorkHours(new Date(now), zones) : []),
    [now, zones],
  );

  if (zones.length < 2) {
    return (
      <Card flush>
        <EmptyState
          icon="🤝"
          title="至少需要两个时区"
          description="在「世界时钟」里添加第二个城市，就能计算共同的工作时间。"
          compact
        />
      </Card>
    );
  }

  // 以第一个时区（通常是本机时区）为参照展示重叠区间
  const reference = findZone(zones[0] as string);

  return (
    <Card
      title="会议时间重叠"
      description={`以「${reference?.label ?? zones[0]}」时间为准，各方都在 09:00–18:00 内的区间`}
    >
      {ranges.length === 0 ? (
        <EmptyState
          icon="😴"
          title="没有共同的工作时间"
          description="这些时区跨度太大，任何时刻都至少有一方在休息。"
          compact
        />
      ) : (
        <StatList>
          {ranges.map((range, index) => (
            <StatRow
              key={index}
              label={`重叠区间 ${index + 1}`}
              value={`${String(range.startHour).padStart(2, '0')}:00 – ${String(range.endHour).padStart(2, '0')}:00`}
              emphasis
            />
          ))}
        </StatList>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium text-muted">各城市与参照时区的时差</p>
        <StatList>
          {zones.map((id) => {
            const zone = findZone(id);
            const delta = hourDifference(zones[0] as string, id, new Date(now));
            return (
              <StatRow
                key={id}
                label={
                  <span className="flex items-center gap-2">
                    {zone?.label ?? id}
                    {delta === 0 ? <Badge tone="accent">同区</Badge> : null}
                  </span>
                }
                value={`${delta >= 0 ? '+' : ''}${delta} 小时`}
              />
            );
          })}
        </StatList>
      </div>
    </Card>
  );
}
