/**
 * 主题（深浅 + 高对比）管理。
 *
 * 主题写在 `<html>` 上而不是某个 React 根节点上：
 *   - `index.html` 的内联反闪烁脚本能在 React 挂载前就设好，避免白闪；
 *   - CSS 里 `:root[data-theme='dark']` 可以直接改写设计令牌，
 *     不需要给每个组件传 theme prop。
 */
import { useCallback, useEffect, useState } from 'react';
import { loadSettings, patchSettings, subscribeSettings } from '../db/settings';
import type { ContrastMode, ThemeMode } from '../db/settings';

export interface ThemeState {
  /** 用户选择的模式（可能是 'system'） */
  mode: ThemeMode;
  /** 实际生效的主题（'system' 已解析成 light/dark） */
  resolved: 'light' | 'dark';
  contrast: ContrastMode;
  setMode: (mode: ThemeMode) => void;
  setContrast: (contrast: ContrastMode) => void;
  /** 在 light → dark → system 之间轮换，供快捷键 / 按钮使用 */
  toggle: () => void;
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** 把状态写到 <html>，CSS 令牌据此生效 */
function apply(resolved: 'light' | 'dark', contrast: ContrastMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // CSS 里用的选择器是 data-contrast="hc"，这里做一次映射，
  // 让存储层的 'high' 与样式层的 'hc' 各自保持可读
  root.dataset.contrast = contrast === 'high' ? 'hc' : 'normal';
  // 让原生控件（滚动条、日期选择器）也跟着切换配色
  root.style.colorScheme = resolved;

  // 移动端浏览器地址栏配色：显式选择主题时，meta 的 media 查询不再准确，
  // 必须动态改写，否则暗色主题下地址栏仍是白的
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = resolved === 'dark' ? '#0e1116' : '#f6f7f9';
}

export function useTheme(): ThemeState {
  const [mode, setModeState] = useState<ThemeMode>(() => loadSettings().theme);
  const [contrast, setContrastState] = useState<ContrastMode>(() => loadSettings().contrast);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(loadSettings().theme));

  // 首帧就把主题落到 <html>，与内联脚本的结果保持一致
  useEffect(() => {
    const next = resolve(mode);
    setResolved(next);
    apply(next, contrast);
  }, [mode, contrast]);

  // 跟随系统：只有 mode === 'system' 时才监听
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setResolved(next);
      apply(next, contrast);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode, contrast]);

  // 其它标签页改了设置时同步过来
  useEffect(() => subscribeSettings((s) => {
    setModeState(s.theme);
    setContrastState(s.contrast);
  }), []);

  // 跨标签页同步：storage 事件只在**其它**标签页写入时触发
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'timecalc:settings') return;
      const s = loadSettings();
      setModeState(s.theme);
      setContrastState(s.contrast);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    patchSettings({ theme: next });
    setModeState(next);
  }, []);

  const setContrast = useCallback((next: ContrastMode) => {
    patchSettings({ contrast: next });
    setContrastState(next);
  }, []);

  const toggle = useCallback(() => {
    // 轮换顺序：跟随系统 → 亮 → 暗 → 跟随系统
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const index = order.indexOf(mode);
    const next = order[(index + 1) % order.length] ?? 'system';
    setMode(next);
  }, [mode, setMode]);

  return { mode, resolved, contrast, setMode, setContrast, toggle };
}
