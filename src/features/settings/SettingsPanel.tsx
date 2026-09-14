/**
 * 设置面板。
 *
 * 需求里分散提到的一堆可配置项（主题、键盘、周起始日…）都在这里收口。
 *
 * 两条原则：
 *   1. **改完立即生效，没有「保存」按钮**。设置项都是即时反馈型的
 *      （切主题当场能看到），加保存按钮只会制造「我改了没生效？」的疑惑。
 *   2. **平台没有的能力不显示开关**。浏览器里没有全局快捷键，
 *      就不要放一个打开也没用的开关——那是在骗用户。
 */
import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type ContrastMode,
  type HolidayRegion,
  type ThemeMode,
} from '../../db/settings';
import { ZONES } from '../../core/timezone';
import { WEEKDAY_ZH } from '../../core/format';
import { HISTORY_LIMIT, clearHistory, historyCount } from '../../db/history';
import type { DurationUnit } from '../../core/types';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Dialog,
  Segmented,
  SelectField,
  StatList,
  StatRow,
  Switch,
  TextField,
} from '../../components';
import { useSettings } from '../../hooks/useSettings';
import { useTheme } from '../../hooks/useTheme';
import { usePlatform } from '../../hooks/usePlatform';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useNavigation } from '../../hooks/useNavigation';
import { useToast } from '../../hooks/useToast';
import { formatAccelerator } from '../../hooks/useHotkeys';

const REGION_OPTIONS: ReadonlyArray<{ value: HolidayRegion; label: string }> = [
  { value: 'CN', label: '中国大陆（含调休）' },
  { value: 'US', label: '美国' },
  { value: 'UK', label: '英国' },
  { value: 'JP', label: '日本' },
  { value: 'NONE', label: '不显示节假日' },
];

const UNIT_OPTIONS: ReadonlyArray<{ value: DurationUnit; label: string }> = [
  { value: 'years', label: '年' },
  { value: 'months', label: '月' },
  { value: 'weeks', label: '周' },
  { value: 'days', label: '天' },
  { value: 'hours', label: '小时' },
  { value: 'minutes', label: '分钟' },
  { value: 'seconds', label: '秒' },
];

export function SettingsPanel() {
  const { settings, update, reset } = useSettings();
  const { mode, contrast, setMode, setContrast } = useTheme();
  const platform = usePlatform();
  const install = useInstallPrompt();
  const { navigate } = useNavigation();
  const toast = useToast();

  const [confirmReset, setConfirmReset] = useState(false);
  const [clearing, setClearing] = useState(false);

  const zoneOptions = useMemo(
    () => ZONES.map((zone) => ({ value: zone.id, label: `${zone.label}（${zone.id}）` })),
    [],
  );

  const handleClearHistory = useCallback(async () => {
    setClearing(true);
    try {
      const removed = await clearHistory(true);
      const left = await historyCount();
      toast.success(`已清空 ${removed} 条，保留 ${left} 条收藏`);
    } catch {
      toast.error('清空失败，本地存储可能不可用');
    } finally {
      setClearing(false);
    }
  }, [toast]);

  const handleReset = useCallback(() => {
    reset();
    setConfirmReset(false);
    toast.success('已恢复默认设置');
  }, [reset, toast]);

  const isDefault = useMemo(
    () => JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS),
    [settings],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card title="外观" description="主题跟随系统时，会随操作系统的深浅色自动切换。">
        <Segmented
          label="主题"
          value={mode}
          onChange={(next: ThemeMode) => setMode(next)}
          options={[
            { value: 'system', label: '跟随系统' },
            { value: 'light', label: '☀️ 亮色' },
            { value: 'dark', label: '🌙 暗色' },
          ]}
        />
        <p className="mt-1.5 text-xs leading-snug text-muted">
          当前生效：{contrast === 'high' ? '高对比度 · ' : ''}
          {mode === 'system' ? '跟随系统' : mode === 'dark' ? '暗色' : '亮色'}。
          也可以用 <kbd className="font-mono">Ctrl/⌘ + Shift + L</kbd> 快速轮换。
        </p>

        <div className="mt-2">
          <Switch
            checked={contrast === 'high'}
            onChange={(next) => setContrast((next ? 'high' : 'normal') as ContrastMode)}
            label="高对比度模式"
            description="加粗边框、拉大前景与背景的明度差，为低视力用户准备"
          />
        </div>
      </Card>

      <Card title="日历" description="影响工作日计算、周末判定与可选的节假日库。">
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented
            label="一周从周几开始"
            value={String(settings.weekStart)}
            onChange={(next) => update({ weekStart: Number(next) === 0 ? 0 : 1 })}
            options={[
              { value: '1', label: '周一' },
              { value: '0', label: '周日' },
            ]}
          />
          <SelectField
            label="节假日地区"
            value={settings.holidayRegion}
            onChange={(event) => update({ holidayRegion: event.target.value as HolidayRegion })}
            options={REGION_OPTIONS}
            hint="中国节假日含国务院调休安排"
          />
        </div>

        <div className="mt-3">
          <p className="mb-1 text-sm font-medium text-ink">哪几天算周末</p>
          <ChipRow label="周末定义">
            {WEEKDAY_ZH.map((label, day) => {
              const active = settings.weekend.includes(day);
              return (
                <Chip
                  key={label}
                  active={active}
                  onClick={() => {
                    const next = active
                      ? settings.weekend.filter((d) => d !== day)
                      : [...settings.weekend, day].sort((a, b) => a - b);
                    update({ weekend: next });
                  }}
                >
                  {label}
                </Chip>
              );
            })}
          </ChipRow>
          <p className="mt-1.5 text-xs leading-snug text-muted">
            默认周六周日。中东等地区可改成周五周六；全部取消表示全年无休。
          </p>
        </div>
      </Card>

      <Card title="默认值" description="打开应用时的初始状态，减少每次都要改的重复操作。">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="默认源时区"
            value={settings.defaultFromZone}
            onChange={(event) => update({ defaultFromZone: event.target.value })}
            options={zoneOptions}
          />
          <SelectField
            label="默认目标时区"
            value={settings.defaultToZone}
            onChange={(event) => update({ defaultToZone: event.target.value })}
            options={zoneOptions}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="时间戳默认单位"
            value={settings.epochUnit}
            onChange={(event) => update({ epochUnit: event.target.value as 's' | 'ms' })}
            options={[
              { value: 's', label: '秒（10 位）' },
              { value: 'ms', label: '毫秒（13 位）' },
            ]}
          />
          <SelectField
            label="结果时长优先单位"
            value={settings.durationDisplayUnit}
            onChange={(event) =>
              update({ durationDisplayUnit: event.target.value as DurationUnit })
            }
            options={UNIT_OPTIONS}
          />
        </div>

        <div className="mt-3">
          <SelectField
            label="结果最多显示几个时长单位"
            value={String(settings.maxResultUnits)}
            onChange={(event) => update({ maxResultUnits: Number(event.target.value) })}
            options={[1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label: `${n} 个（如 ${n === 1 ? '3 天' : n === 2 ? '3 天 4 小时' : '3 天 4 小时 20 分'}）`,
            }))}
            hint="决定「1 天 2 小时」这类描述详细到什么程度"
          />
        </div>

        <div className="mt-2">
          <Switch
            checked={settings.toastOnCopy}
            onChange={(next) => update({ toastOnCopy: next })}
            label="复制后弹出提示"
            description="关闭后复制仍然生效，只是不再打扰"
          />
        </div>
      </Card>

      <Card title="历史记录" description={`最多保留 ${HISTORY_LIMIT} 条，收藏的条目永不被自动删除。`}>
        <Switch
          checked={settings.historyEnabled}
          onChange={(next) => update({ historyEnabled: next })}
          label="记录计算历史"
          description="只保存在本机浏览器 / 应用内，不会上传到任何服务器"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button variant="secondary" size="md" onClick={() => navigate('history')}>
            查看历史
          </Button>
          <Button
            variant="danger"
            size="md"
            loading={clearing}
            disabled={!settings.historyEnabled}
            onClick={() => void handleClearHistory()}
          >
            清空未收藏的记录
          </Button>
        </div>
      </Card>

      <Card
        title="快捷键与通知"
        description={
          platform.shortcut.global
            ? '桌面端支持全局快捷键，应用在后台时也能唤起。'
            : '浏览器里快捷键仅在页面有焦点时生效，这是平台的限制。'
        }
      >
        <Switch
          checked={settings.globalShortcutEnabled && platform.shortcut.global}
          onChange={(next) => update({ globalShortcutEnabled: next })}
          disabled={!platform.shortcut.global}
          label="启用全局快捷键"
          description={
            platform.shortcut.global
              ? '应用不在前台时也能用快捷键唤起'
              : '当前平台不支持（Web 无法注册全局快捷键）'
          }
        />

        <div className="mt-2">
          <TextField
            label="快捷键"
            value={settings.globalShortcutAccelerator}
            onChange={(event) => update({ globalShortcutAccelerator: event.target.value })}
            disabled={!platform.shortcut.global || !settings.globalShortcutEnabled}
            mono
            placeholder="CommandOrControl+Shift+T"
            hint={`当前生效写法：${formatAccelerator(
              settings.globalShortcutAccelerator,
              platform.info.os === 'macos',
            )}；详见「关于 → 键盘快捷键」`}
          />
        </div>

        <StatList className="mt-3 border-t border-line pt-1">
          <StatRow
            label="系统通知"
            value={
              <Badge tone={platform.notification.supported ? 'ok' : 'default'}>
                {platform.notification.supported ? '支持' : '不支持'}
              </Badge>
            }
          />
          <StatRow
            label="全局快捷键"
            value={
              <Badge tone={platform.shortcut.global ? 'ok' : 'default'}>
                {platform.shortcut.global ? '支持' : '仅页内'}
              </Badge>
            }
          />
        </StatList>
      </Card>

      {/* 安装引导：只有真的能装、且用户没说过「以后再说」时才出现 */}
      {platform.info.installable && !install.installed && !install.dismissed ? (
        <Card title="安装到设备" description="装成应用后可以离线使用，也有独立图标。">
          {install.canInstall ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                onClick={async () => {
                  const outcome = await install.promptInstall();
                  if (outcome === 'accepted') toast.success('正在安装…');
                }}
              >
                立即安装
              </Button>
              <Button variant="ghost" size="lg" onClick={install.dismiss}>
                以后再说
              </Button>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-ink">
              {install.needsManualHint ? (
                <>
                  在 iOS 上用 <strong>Safari</strong> 打开本页，点底部的「分享」按钮，
                  选择「添加到主屏幕」即可安装。
                </>
              ) : (
                <>
                  浏览器暂未提供安装入口。可以打开浏览器菜单，选择
                  「安装应用」或「添加到主屏幕」。
                </>
              )}
            </p>
          )}
        </Card>
      ) : null}

      <Card title="其它">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => navigate('about')}>
            关于 TimeCalc
          </Button>
          <Button
            variant="ghost"
            size="md"
            disabled={isDefault}
            onClick={() => setConfirmReset(true)}
          >
            恢复默认设置
          </Button>
        </div>
        <p className="mt-3 text-xs leading-snug text-muted">
          所有数据都保存在本机。清除浏览器数据会一并清除设置与历史，
          如需长期保存请使用「加入日历」或导出功能。
        </p>
      </Card>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="恢复默认设置"
        description="主题、周起始日、节假日地区等都会回到初始值。"
        size="sm"
      >
        <p className="text-sm leading-relaxed text-ink">
          历史记录<strong>不会</strong>被删除，只有设置项会重置。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" size="lg" block onClick={handleReset}>
            恢复默认
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => setConfirmReset(false)}>
            取消
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
