/**
 * 组件里读写设置。
 *
 * 用 `useSyncExternalStore` 而不是 useState + useEffect：
 * 设置是**外部可变状态**，localStorage 的变化可能来自另一个标签页，
 * useSyncExternalStore 能保证订阅语义正确且不会撕裂（tearing）。
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  patchSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from '../db/settings';

/** 服务端快照：SSR / 测试环境没有 localStorage 时用默认值 */
function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export interface UseSettingsResult {
  settings: Settings;
  /** 局部更新 */
  update: (patch: Partial<Settings>) => void;
  /** 整体覆盖 */
  replace: (next: Settings) => void;
  /** 恢复默认 */
  reset: () => void;
}

export function useSettings(): UseSettingsResult {
  const settings = useSyncExternalStore(
    subscribeSettings,
    loadSettings,
    getServerSnapshot,
  );

  const update = useCallback((patch: Partial<Settings>) => {
    patchSettings(patch);
  }, []);

  const replace = useCallback((next: Settings) => {
    saveSettings(next);
  }, []);

  const reset = useCallback(() => {
    resetSettings();
  }, []);

  return useMemo(
    () => ({ settings, update, replace, reset }),
    [settings, update, replace, reset],
  );
}

/** 只关心一个字段时的便捷 hook，避免因无关字段变化而重渲染 */
export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (value: Settings[K]) => void] {
  const { settings, update } = useSettings();
  const setValue = useCallback((value: Settings[K]) => update({ [key]: value } as Partial<Settings>), [key, update]);
  return [settings[key], setValue];
}
