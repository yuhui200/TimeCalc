/**
 * 倒计时面板。
 *
 * 需求：「倒计时到某个日期」。
 *
 * 倒计时是唯一一个**结果会自己变**的面板，因此有三件事要处理好：
 *   1. 到点提醒只能尽力而为——浏览器关掉页面就没了，所以：
 *      - 前台：页内 toast + 系统通知（useCountdown 负责）
 *      - 移动端：提前把通知**排期**给系统（platform.notification.scheduleAt）
 *      权限没给也不影响倒计时本身，只是提醒降级，UI 必须说明这一点。
 *   2. 目标时刻要能一键导出到日历（.ics 兜底，原生日历能写就写）
 *   3. 过期之后不要显示负数倒计时，而是转成「已过去多久」
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COUNTDOWN_PRESETS,
  countdownDigits,
  countdownProgress,
  describeCountdown,
  snapshot as takeSnapshot,
} from '../../core/countdown';
import { buildICS, eventFromCountdown, suggestICSFilename } from '../../core/ics';
import { DATETIME_SEC_FMT, formatDateTime, formatRelativeZh } from '../../core/format';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  CopyButton,
  DateTimeField,
  ResultDisplay,
  StatList,
  StatRow,
  Switch,
  TextField,
} from '../../components';
import { useCountdown } from '../../hooks/useCountdown';
import { useHistoryRecorder } from '../../hooks/useHistory';
import { usePlatform } from '../../hooks/usePlatform';
import { useToast } from '../../hooks/useToast';
import type { NotificationPermissionState } from '../../platform/types';

/** 把 Date 转成 datetime-local 需要的本地字符串 */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const PERMISSION_LABEL: Record<NotificationPermissionState, string> = {
  granted: '已授权',
  denied: '已拒绝',
  default: '未询问',
  unsupported: '当前平台不支持',
};

export function CountdownPanel() {
  const platform = usePlatform();
  const toast = useToast();
  const record = useHistoryRecorder();

  const [title, setTitle] = useState('倒计时');
  const [targetInput, setTargetInput] = useState(() => toLocalInput(COUNTDOWN_PRESETS[0]!.resolve()));
  const [notify, setNotify] = useState(true);
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [exporting, setExporting] = useState(false);

  const target = useMemo(() => {
    if (!targetInput) return null;
    const date = new Date(targetInput.replace('T', ' '));
    return Number.isNaN(date.getTime()) ? null : date;
  }, [targetInput]);

  const { snapshot, fired } = useCountdown({
    target,
    title,
    notifyOnFinish: notify,
    tag: 'timecalc-countdown',
  });

  /** 目标时刻的起点：用于进度条。以「设置目标的那一刻」为起点最符合直觉 */
  const [origin, setOrigin] = useState(() => new Date());
  useEffect(() => {
    setOrigin(new Date());
  }, [targetInput]);

  const progress = useMemo(
    () => (target ? countdownProgress(origin, target) : 0),
    [origin, target],
  );

  useEffect(() => {
    void platform.notification.permission().then(setPermission);
  }, [platform]);

  useEffect(() => {
    if (!snapshot || !target) return;
    const timer = window.setTimeout(() => {
      void record({
        kind: 'countdown',
        input: `${title} @ ${formatDateTime(target, DATETIME_SEC_FMT)}`,
        output: snapshot.human,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [snapshot, target, title, record]);

  const requestPermission = useCallback(async () => {
    const next = await platform.notification.requestPermission();
    setPermission(next);
    if (next === 'granted') toast.success('已开启通知提醒');
    else if (next === 'denied') toast.warning('通知被拒绝，到点只会在页面内提示');
  }, [platform, toast]);

  /** 导出到日历：能写系统日历就写，否则下载 .ics */
  const exportToCalendar = useCallback(async () => {
    if (!target) return;
    setExporting(true);
    try {
      const event = eventFromCountdown(title, target, `由 TimeCalc 创建 · ${snapshot?.human ?? ''}`);

      const written = await platform.calendar.addEvent({
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end ?? new Date(target.getTime() + 30 * 60_000),
        reminderMinutes: event.reminderMinutes,
      });

      if (written.ok) {
        toast.success('已写入系统日历');
        return;
      }

      // 浏览器写不了系统日历是常态，静默降级为 .ics 而不是报错
      const text = buildICS([event], { calendarName: 'TimeCalc 倒计时' });
      const saved = await platform.file.saveText({
        filename: suggestICSFilename(),
        content: text,
        mime: 'text/calendar',
      });

      if (saved.ok) {
        toast.success(`已导出日历文件（${saved.value}）`);
      } else if (saved.reason === 'unsupported') {
        toast.error('当前环境无法保存文件，请改用「复制」手动保存');
      } else {
        toast.error('导出失败，请重试');
      }
    } finally {
      setExporting(false);
    }
  }, [target, title, snapshot, platform, toast]);

  const applyPreset = useCallback((resolve: () => Date) => {
    setTargetInput(toLocalInput(resolve()));
  }, []);

  const digits = snapshot ? countdownDigits(snapshot) : null;
  const expired = snapshot?.expired ?? false;

  return (
    <div className="flex flex-col gap-4">
      <Card title="倒计时目标" description="选一个目标时刻，页面打开时会实时跳动。">
        <TextField
          label="名称"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="如：项目截止、发布会"
          maxLength={40}
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DateTimeField
            label="目标时刻"
            value={targetInput}
            onChange={(event) => setTargetInput(event.target.value)}
            hint="按本机时区理解"
            action={<Chip onClick={() => setTargetInput(toLocalInput(new Date()))}>现在</Chip>}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">目标是否合理</span>
            <div className="flex min-h-tap items-center rounded-xl border-2 border-line bg-[var(--tc-surface-2)] px-3 text-sm">
              {target ? (
                <span className={expired ? 'text-[var(--tc-warn)]' : 'text-ink'}>
                  {formatRelativeZh(target)}
                  {expired ? ' · 已过期' : ''}
                </span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <ChipRow label="快捷目标">
            {COUNTDOWN_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                active={targetInput === toLocalInput(preset.resolve())}
                onClick={() => applyPreset(() => preset.resolve())}
              >
                {preset.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </Card>

      {/* 大字号倒计时：需求里「结果用大字号」的核心体现 */}
      {snapshot && digits ? (
        <div
          className="rounded-card border border-line bg-surface p-4 sm:p-5"
          aria-live="off"
          role="timer"
          aria-label={`距离${title}${expired ? '已过去' : '还剩'}${snapshot.days}天${snapshot.hours}小时${snapshot.minutes}分${snapshot.seconds}秒`}
        >
          <p className="text-sm font-medium text-muted">
            {expired ? '已过去' : '距离'}
            <span className="ml-1 text-ink">{title || '目标'}</span>
            {expired ? '' : '还有'}
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            {snapshot.days > 0 ? (
              <span className="flex items-end gap-1">
                <span className="tnum text-4xl font-semibold leading-none text-ink sm:text-5xl">
                  {digits.days}
                </span>
                <span className="pb-0.5 text-sm text-muted">天</span>
              </span>
            ) : null}
            <span className="flex items-end gap-1">
              <span className="tnum text-4xl font-semibold leading-none text-ink sm:text-5xl">
                {digits.hours}
              </span>
              <span className="pb-0.5 text-sm text-muted">时</span>
            </span>
            <span className="flex items-end gap-1">
              <span className="tnum text-4xl font-semibold leading-none text-ink sm:text-5xl">
                {digits.minutes}
              </span>
              <span className="pb-0.5 text-sm text-muted">分</span>
            </span>
            <span className="flex items-end gap-1">
              <span className="tnum text-4xl font-semibold leading-none text-ink sm:text-5xl">
                {digits.seconds}
              </span>
              <span className="pb-0.5 text-sm text-muted">秒</span>
            </span>
          </div>

          <p className="mt-2 text-sm text-muted">{snapshot.human}</p>

          {/* 进度条：用原生 progress 而不是自绘 div，屏幕阅读器会念出百分比 */}
          {!expired ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>已走过</span>
                <span className="tnum">{(progress * 100).toFixed(1)}%</span>
              </div>
              <progress
                className="mt-1 h-2 w-full overflow-hidden rounded-pill"
                value={Math.round(progress * 100)}
                max={100}
                aria-label="倒计时进度"
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <CopyButton
              text={`${title}：${formatDateTime(target!, DATETIME_SEC_FMT)}（${snapshot.human}）`}
              label="复制"
              variant="secondary"
              size="md"
            />
            <Button
              variant="secondary"
              size="md"
              onClick={() => void exportToCalendar()}
              disabled={exporting}
            >
              {exporting ? '导出中…' : '加入日历'}
            </Button>
            {fired ? <Badge tone="ok">已提醒</Badge> : null}
          </div>
        </div>
      ) : (
        <ResultDisplay ready={false} primary="" placeholder="设置一个合法的目标时刻后开始倒计时" />
      )}

      <Card title="到点提醒" description="倒计时结束时通知你。">
        <Switch
          checked={notify}
          onChange={setNotify}
          label="结束时提醒"
          description="页面在后台时依赖系统通知；移动端会提前向系统排期"
        />

        <StatList className="mt-2 border-t border-line pt-1">
          <StatRow
            label="通知权限"
            value={
              <span className="flex items-center gap-2">
                <Badge
                  tone={
                    permission === 'granted' ? 'ok' : permission === 'default' ? 'warn' : 'danger'
                  }
                >
                  {PERMISSION_LABEL[permission]}
                </Badge>
              </span>
            }
            hint={
              platform.notification.supported
                ? undefined
                : '当前平台不支持系统通知，到点只会在页面内提示'
            }
          />
          <StatRow
            label="后台排期"
            value={platform.info.target === 'capacitor' ? '支持' : '不支持'}
            hint={
              platform.info.target === 'capacitor'
                ? 'App 被切到后台甚至关闭后，系统仍会按时弹出'
                : '页面关闭后无法提醒，这是浏览器的限制'
            }
          />
          <StatRow label="目标时刻" value={target ? formatDateTime(target, DATETIME_SEC_FMT) : '—'} />
          {snapshot ? <StatRow label="状态描述" value={describeCountdown(snapshot)} /> : null}
        </StatList>

        {permission === 'default' && platform.notification.supported ? (
          <div className="mt-3">
            <Button variant="primary" size="md" block onClick={() => void requestPermission()}>
              开启通知权限
            </Button>
          </div>
        ) : null}

        {platform.info.target === 'web' ? (
          <p className="mt-3 text-xs leading-snug text-muted">
            提示：浏览器页面被关闭后，任何网页都无法再提醒你。需要长期可靠的提醒，
            建议把它「加入日历」，交给系统日历应用负责。
          </p>
        ) : null}
      </Card>
    </div>
  );
}
