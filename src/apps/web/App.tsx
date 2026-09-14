/**
 * 应用外壳。
 *
 * 三端（PWA / Tauri / Capacitor）共用这一个 App，差异全部由 `src/platform`
 * 承担——这个文件里**不允许出现任何平台判断**。
 *
 * 布局策略（对应需求里的「手机优先、桌面增强」）：
 *   - 手机：单列。一个粘性顶栏（标题 + 操作 + 可横向滚动的功能条），内容单列。
 *   - 桌面：`lg` 起换成「左侧固定导航 + 右侧内容」，⌘K 命令面板直达任意功能。
 * 两种布局是同一份 DOM，只靠 Tailwind 断点切换，不存在两套组件要同步维护。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CommandPalette,
  IconButton,
  KeyboardHelp,
  type Command,
} from '../../components';
import { formatAccelerator, useHotkeys } from '../../hooks/useHotkeys';
import { useTheme } from '../../hooks/useTheme';
import { useSettings } from '../../hooks/useSettings';
import { PlatformProvider, usePlatform } from '../../hooks/usePlatform';
import { ToastProvider, useToast } from '../../hooks/useToast';
import { useOnline } from '../../hooks/useMediaQuery';
import { NavigationProvider, useHashNavigation, useNavigation } from '../../hooks/useNavigation';
import { HOTKEY_PANELS, NAV_PANELS, PANELS, findPanel } from '../../features/registry';
import { initPWA, type PWAController } from './pwa';

/** 首次访问的默认面板：自然语言最贴合「一句话算时间」的主诉求 */
const DEFAULT_PANEL = 'natural';

export function App() {
  return (
    <PlatformProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </PlatformProvider>
  );
}

function AppShell() {
  const panelIds = useMemo(() => PANELS.map((panel) => panel.id), []);
  const nav = useHashNavigation(panelIds, DEFAULT_PANEL);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  // 递增即重挂载当前面板，用来实现「清空当前输入」
  const [resetToken, setResetToken] = useState(0);

  const theme = useTheme();
  const platform = usePlatform();
  const toast = useToast();
  const online = useOnline();

  /* ---------------- PWA：注册与更新 ---------------- */
  const [pwa, setPwa] = useState<PWAController | null>(null);

  useEffect(() => {
    const controller = initPWA({
      onNeedRefresh: () => setUpdateReady(true),
      onOfflineReady: () => setOfflineReady(true),
      onError: (error) => {
        // 注册失败只影响离线能力，不该打扰用户
        console.warn('[timecalc] Service Worker 注册失败', error);
      },
    });
    setPwa(controller);
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    toast.success('已缓存到本地，现在断网也能使用', { duration: 5000 });
    setOfflineReady(false);
  }, [offlineReady, toast]);

  /* ---------------- 快捷键 ---------------- */
  // 从面板注册表生成，同时供「注册」与「帮助面板展示」两处使用
  const panelShortcuts = useMemo(
    () =>
      HOTKEY_PANELS.map((panel) => ({
        keys: panel.hotkey,
        description: `切换到「${panel.label}」`,
      })),
    [],
  );

  useHotkeys([
    { keys: 'mod+k', handler: () => setPaletteOpen((open) => !open), description: '命令面板' },
    ...HOTKEY_PANELS.map((panel) => ({
      keys: panel.hotkey,
      handler: () => nav.navigate(panel.id),
      description: `切换到「${panel.label}」`,
    })),
    {
      keys: 'mod+shift+l',
      handler: () => {
        theme.toggle();
        toast.show(`主题：${themeLabel(theme.mode)}`);
      },
      description: '切换主题',
    },
    {
      keys: 'mod+shift+c',
      handler: () => {
        const next = theme.contrast === 'high' ? 'normal' : 'high';
        theme.setContrast(next);
        toast.show(next === 'high' ? '已开启高对比度' : '已关闭高对比度');
      },
      description: '切换高对比度',
    },
    {
      keys: 'mod+shift+x',
      handler: () => {
        setResetToken((token) => token + 1);
        toast.show('已清空当前输入');
      },
      description: '清空当前输入',
    },
    { keys: '?', handler: () => setHelpOpen((open) => !open), description: '快捷键帮助' },
  ]);

  /* ---------------- 命令面板 ---------------- */
  const isMac = platform.info.os === 'macos' || platform.info.os === 'ios';

  const commands = useMemo<Command[]>(() => {
    const panelCommands: Command[] = PANELS.map((panel) => ({
      id: `panel:${panel.id}`,
      title: panel.label,
      subtitle: panel.description,
      icon: panel.icon,
      keywords: panel.keywords,
      group: '功能',
      shortcut: panel.hotkey ? formatAccelerator(panel.hotkey, isMac) : undefined,
      run: () => nav.navigate(panel.id),
    }));

    const actionCommands: Command[] = [
      {
        id: 'action:theme-light',
        title: '切换到亮色主题',
        icon: '☀️',
        group: '外观',
        keywords: ['light', 'liangse', '亮色', '白天'],
        run: () => theme.setMode('light'),
      },
      {
        id: 'action:theme-dark',
        title: '切换到暗色主题',
        icon: '🌙',
        group: '外观',
        keywords: ['dark', 'anse', '暗色', '夜间'],
        run: () => theme.setMode('dark'),
      },
      {
        id: 'action:theme-system',
        title: '主题跟随系统',
        icon: '🖥',
        group: '外观',
        keywords: ['system', 'gensui', '跟随', '自动'],
        run: () => theme.setMode('system'),
      },
      {
        id: 'action:contrast',
        title: theme.contrast === 'high' ? '关闭高对比度' : '开启高对比度',
        icon: '🔲',
        group: '外观',
        keywords: ['contrast', 'duibidu', '对比度', '无障碍', 'a11y'],
        run: () => theme.setContrast(theme.contrast === 'high' ? 'normal' : 'high'),
      },
      {
        id: 'action:help',
        title: '查看键盘快捷键',
        icon: '⌨️',
        group: '帮助',
        keywords: ['shortcut', 'hotkey', 'kuaijiejian', '快捷键'],
        run: () => setHelpOpen(true),
      },
    ];

    return [...panelCommands, ...actionCommands];
  }, [nav, theme, isMac]);

  /* ---------------- 当前面板 ---------------- */
  const panel = findPanel(nav.current) ?? PANELS[0]!;
  const PanelComponent = panel.component;

  const onSelect = useCallback(
    (id: string) => {
      nav.navigate(id);
      // 切面板后把焦点交给内容区，键盘用户不必再 Tab 一整圈
      window.requestAnimationFrame(() => {
        document.getElementById('tc-main')?.focus();
      });
    },
    [nav],
  );

  return (
    <NavigationProvider value={nav}>
      <div className="flex min-h-dvh flex-col bg-[var(--tc-bg)] text-ink">
        <a
          href="#tc-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--tc-accent)] focus:px-4 focus:py-2 focus:text-[var(--tc-accent-ink)]"
        >
          跳到主要内容
        </a>

        {/* 标题栏与功能条放在同一个 sticky 容器里，
            避免手写 top 偏移在字号变化时错位 */}
        <header className="pt-safe sticky top-0 z-30 border-b border-line bg-[var(--tc-bg)]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 sm:px-6">
            <span aria-hidden="true" className="text-xl leading-none">
              🧮
            </span>
            <span className="text-base font-semibold text-ink">TimeCalc</span>
            <span className="hidden text-xs text-muted sm:inline">时间计算器</span>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto hidden min-h-tap items-center gap-2 rounded-xl border-2 border-line bg-[var(--tc-surface)] px-3 text-sm text-muted transition-colors hover:border-[var(--tc-line-strong)] hover:text-ink sm:flex"
            >
              <span aria-hidden="true">🔍</span>
              搜索功能
              <kbd className="rounded border border-line bg-[var(--tc-surface-2)] px-1.5 py-0.5 font-mono text-[11px]">
                {formatAccelerator('mod+k', isMac)}
              </kbd>
            </button>

            {/* 手机上功能条已经很挤，命令面板收成一个图标按钮 */}
            <IconButton
              label="搜索功能"
              className="ml-auto sm:ml-0"
              onClick={() => setPaletteOpen(true)}
            >
              🔍
            </IconButton>

            <IconButton
              label={`切换主题（当前：${themeLabel(theme.mode)}）`}
              onClick={theme.toggle}
            >
              {theme.mode === 'system' ? '🖥' : theme.mode === 'dark' ? '🌙' : '☀️'}
            </IconButton>

            <IconButton label="键盘快捷键" onClick={() => setHelpOpen(true)}>
              ⌨️
            </IconButton>
          </div>

          <NavStrip current={nav.current} onSelect={onSelect} />
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-4 sm:px-6 sm:py-6">
          <Sidebar current={nav.current} onSelect={onSelect} />

          <main id="tc-main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            <div className="mb-4">
              <h1 className="flex items-center gap-2 text-xl font-semibold text-ink sm:text-2xl">
                <span aria-hidden="true">{panel.icon}</span>
                {panel.label}
              </h1>
              <p className="mt-1 text-sm leading-snug text-muted">{panel.description}</p>
            </div>

            <PanelComponent key={`${panel.id}:${resetToken}`} />
          </main>
        </div>

        <Footer online={online} version={platform.info.version} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        placeholder="输入功能名，如「时区」「纽约」「rqc」…"
      />

      <KeyboardHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        panelShortcuts={panelShortcuts}
      />

      {updateReady ? (
        <UpdateBanner
          onUpdate={() => {
            setUpdateReady(false);
            pwa?.update();
          }}
          onDismiss={() => setUpdateReady(false)}
        />
      ) : null}
    </NavigationProvider>
  );
}

/* ------------------------------------------------------------------ */
/* 导航                                                                */
/* ------------------------------------------------------------------ */

function NavStrip({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="功能导航" className="lg:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-2 sm:px-6">
        {NAV_PANELS.map((panel) => (
          <li key={panel.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(panel.id)}
              // 功能条上只放得下短名（「历史」「日期加」），
              // 补一个完整名的 aria-label，读屏用户听到的才是「历史记录」。
              aria-label={panel.label}
              aria-current={current === panel.id ? 'page' : undefined}
              className={
                'flex min-h-tap items-center gap-1.5 rounded-pill border-2 px-3.5 text-sm font-medium transition-colors ' +
                (current === panel.id
                  ? 'border-[var(--tc-accent)] bg-[var(--tc-accent-soft)] text-[var(--tc-accent)]'
                  : 'border-line bg-[var(--tc-surface)] text-ink')
              }
            >
              <span aria-hidden="true">{panel.icon}</span>
              {panel.short}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Sidebar({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  const { settings } = useSettings();
  const platform = usePlatform();
  const isMac = platform.info.os === 'macos';

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav aria-label="功能导航" className="sticky top-24">
        <ul className="flex flex-col gap-1">
          {NAV_PANELS.map((panel) => (
            <li key={panel.id}>
              <button
                type="button"
                onClick={() => onSelect(panel.id)}
                aria-current={current === panel.id ? 'page' : undefined}
                className={
                  'flex w-full min-h-tap items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition-colors ' +
                  (current === panel.id
                    ? 'bg-[var(--tc-accent-soft)] text-[var(--tc-accent)]'
                    : 'text-ink hover:bg-[var(--tc-surface-2)]')
                }
              >
                <span aria-hidden="true">{panel.icon}</span>
                <span className="flex-1 truncate">{panel.label}</span>
                {panel.hotkey ? (
                  <kbd className="shrink-0 font-mono text-[11px] text-muted">
                    {formatAccelerator(panel.hotkey, isMac)}
                  </kbd>
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-line px-3 pt-3 text-[11px] leading-snug text-muted">
          {settings.historyEnabled ? '历史记录已开启' : '历史记录已关闭'} · 全部计算在本机完成
        </p>
      </nav>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* 页脚与提示条                                                        */
/* ------------------------------------------------------------------ */

function Footer({ online, version }: { online: boolean; version: string }) {
  const { navigate } = useNavigation();

  return (
    <footer className="pb-safe mt-6 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted sm:px-6">
        <span>TimeCalc v{version}</span>
        <span aria-hidden="true">·</span>
        <span>离线可用，不上传任何数据</span>
        <button
          type="button"
          onClick={() => navigate('about')}
          className="inline-flex min-h-tap items-center underline underline-offset-2 hover:text-ink"
        >
          关于与平台能力
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              'inline-block h-2 w-2 rounded-full ' +
              (online ? 'bg-[var(--tc-ok)]' : 'bg-[var(--tc-warn)]')
            }
          />
          {online ? '在线' : '离线（功能不受影响）'}
        </span>
      </div>
    </footer>
  );
}

function UpdateBanner({ onUpdate, onDismiss }: { onUpdate: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[var(--tc-surface)] px-4 py-3 shadow-lg"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
        <span aria-hidden="true">✨</span>
        <p className="min-w-0 flex-1 text-sm text-ink">
          有新版本可用。更新会刷新页面，当前未完成的输入会丢失。
        </p>
        <button
          type="button"
          onClick={onUpdate}
          className="min-h-tap rounded-xl bg-[var(--tc-accent)] px-4 text-sm font-medium text-[var(--tc-accent-ink)]"
        >
          立即更新
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-tap rounded-xl px-3 text-sm text-muted hover:bg-[var(--tc-surface-2)]"
        >
          稍后
        </button>
      </div>
    </div>
  );
}

function themeLabel(mode: 'light' | 'dark' | 'system'): string {
  return mode === 'light' ? '亮色' : mode === 'dark' ? '暗色' : '跟随系统';
}
