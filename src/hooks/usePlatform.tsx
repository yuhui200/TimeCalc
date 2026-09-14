/**
 * 平台适配器的 React 接入点。
 *
 * 全局单例在模块加载时就建好（而不是等 useEffect），因为适配器的
 * `info` 在首次渲染就要用到——晚一帧会让「关于」页先显示错误的平台名。
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPlatform, getPlatform, setPlatform } from '../platform';
import type { Platform } from '../platform/types';

const PlatformContext = createContext<Platform | null>(null);

export interface PlatformProviderProps {
  children: ReactNode;
  /** 测试时可注入替身；生产环境不要传 */
  value?: Platform;
}

export function PlatformProvider({ children, value }: PlatformProviderProps) {
  const platform = useMemo(() => {
    if (value) {
      setPlatform(value);
      return value;
    }
    return getPlatform() ?? createPlatform();
  }, [value]);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void platform.init().finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      // dispose 放在卸载时执行，注销全局快捷键等副作用
      void platform.dispose();
    };
  }, [platform]);

  // ready 只用于避免在能力未就绪时展示「不支持」的误导文案，
  // 因此这里不需要渲染 loading——适配器本身都带有安全的默认行为
  void ready;

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

/**
 * 取当前平台适配器。
 * 没有 Provider 时（如单元测试直接渲染组件）返回全局单例，不抛异常。
 */
export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  return platform ?? getPlatform();
}

/** 便捷读取平台信息 */
export function usePlatformInfo() {
  return usePlatform().info;
}
