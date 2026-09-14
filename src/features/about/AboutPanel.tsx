/**
 * 关于页。
 *
 * 它同时承担一个不那么显然的职责：**把平台能力的真实情况说清楚**。
 * 用户装了 PWA 却发现关掉页面后倒计时不响，会认为是 bug；
 * 这里明确列出「当前平台能做什么、不能做什么」，把预期提前对齐。
 *
 * 能力表的数据全部来自 `platform`，页面本身不做任何平台判断。
 */
import { useMemo, useState } from 'react';
import { LUNAR_MAX_YEAR, LUNAR_MIN_YEAR } from '../../core/lunar';
import { Badge, Button, Card, KeyboardHelp, StatList, StatRow } from '../../components';
import { usePlatform } from '../../hooks/usePlatform';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useNavigation } from '../../hooks/useNavigation';
import { PANELS } from '../registry';

export function AboutPanel() {
  const platform = usePlatform();
  const install = useInstallPrompt();
  const { navigate } = useNavigation();
  const [helpOpen, setHelpOpen] = useState(false);

  const { info } = platform;

  /** 能力清单：每项都带「为什么」的说明 */
  const capabilities = useMemo(
    () => [
      {
        label: '离线使用',
        ok: true,
        note: 'Service Worker 缓存了全部静态资源，断网也能算',
      },
      {
        label: '系统通知',
        ok: platform.notification.supported,
        note: platform.notification.supported
          ? info.target === 'capacitor'
            ? '支持提前排期，App 退到后台也会按时提醒'
            : '页面打开的期间可以提醒；关闭页面后无法提醒'
          : '当前环境没有通知能力，倒计时只在页面内提示',
      },
      {
        label: '写入系统日历',
        ok: platform.calendar.supported,
        note: platform.calendar.supported
          ? '可以直接把倒计时写进系统日历'
          : '浏览器普遍不允许，已自动改为导出 .ics 文件，双击即可导入',
      },
      {
        label: '全局快捷键',
        ok: platform.shortcut.global,
        note: platform.shortcut.global
          ? '应用在后台时也能用快捷键唤起'
          : '浏览器限制，快捷键仅在页面有焦点时生效',
      },
      {
        label: '安装到主屏幕 / 桌面',
        ok: info.installable,
        note: info.installable
          ? '可以像原生应用一样启动，有独立图标'
          : '当前环境不支持安装（如已在原生 App 内运行）',
      },
      {
        label: '保存文件',
        ok: true,
        note: info.target === 'tauri' ? '弹出系统保存对话框写入磁盘' : '通过下载 / 分享保存',
      },
    ],
    [platform, info],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="text-4xl leading-none">
            🧮
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">TimeCalc</h2>
            <p className="text-sm text-muted">时间计算器 · 版本 {info.version}</p>
          </div>
          <Badge tone="accent" className="ml-auto">
            {info.label}
          </Badge>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink">
          日期差、日期加减、时间差、时区换算、时间戳互转、自然语言一句话算时间。
          纯本地计算，不需要联网，也不收集任何数据。
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={() => setHelpOpen(true)}>
            键盘快捷键
          </Button>
          <Button variant="secondary" size="md" onClick={() => navigate('settings')}>
            打开设置
          </Button>
          {info.installable && !install.installed && install.canInstall ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                void install.promptInstall();
              }}
            >
              安装到设备
            </Button>
          ) : null}
        </div>
      </Card>

      <Card title="运行环境" description="同一套 core 与 UI，跑在不同外壳里。">
        <StatList>
          <StatRow label="应用版本" value={info.version} />
          <StatRow label="运行形态" value={info.label} hint={`target: ${info.target}`} />
          <StatRow label="操作系统" value={osLabel(info.os)} hint={`os: ${info.os}`} />
          <StatRow
            label="显示模式"
            value={info.standalone ? '独立窗口（已安装）' : '浏览器标签页'}
          />
        </StatList>
      </Card>

      <Card title="能力清单" description="不同平台能做的事不一样，这里如实列出。">
        <ul className="flex flex-col divide-y divide-line">
          {capabilities.map((item) => (
            <li key={item.label} className="flex items-start gap-3 py-2.5">
              <span aria-hidden="true" className="mt-0.5 text-base leading-none">
                {item.ok ? '✅' : '⚠️'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {item.label}
                  <Badge tone={item.ok ? 'ok' : 'warn'}>{item.ok ? '可用' : '受限'}</Badge>
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">{item.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="全部功能" description="点击任意一项直接跳转。">
        <ul className="grid gap-2 sm:grid-cols-2">
          {PANELS.map((panel) => (
            <li key={panel.id}>
              <button
                type="button"
                onClick={() => navigate(panel.id)}
                className="flex w-full min-h-tap items-start gap-3 rounded-xl border border-line bg-[var(--tc-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[var(--tc-line-strong)] hover:bg-surface"
              >
                <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
                  {panel.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{panel.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    {panel.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="数据与隐私">
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink">
          <li>· 所有计算都在本机完成，没有任何网络请求，也没有账号体系。</li>
          <li>· 历史记录存在浏览器的 IndexedDB 里，设置存在 localStorage 里。</li>
          <li>· 清除浏览器数据会一并清除它们；需要长期保存请用「加入日历」或导出。</li>
          <li>· 时区数据来自浏览器内置的 IANA 时区数据库，节假日数据随版本更新。</li>
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-snug text-muted">
          农历换算支持 {LUNAR_MIN_YEAR}–{LUNAR_MAX_YEAR} 年；超出范围的日期不会显示农历，
          而不是给出错误的干支。
        </p>
      </Card>

      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function osLabel(os: string): string {
  const map: Record<string, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    android: 'Android',
    ios: 'iOS / iPadOS',
    unknown: '未能识别',
  };
  return map[os] ?? os;
}
