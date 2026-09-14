/**
 * 媒体查询 hook。
 *
 * 只在「布局结构需要变化」时使用（如手机单列 vs 桌面多列），
 * 纯样式差异一律交给 Tailwind 的断点类，不要在 JS 里做。
 * 这样做的原因：JS 判断会引入一次额外的渲染，而且 SSR 时拿不到真实值。
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    // 初始同步一次：SSR 水合后可能与服务端快照不一致
    setMatches(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 桌面布局断点，与 tailwind.config.js 的 `lg` 保持一致 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** 触摸优先设备（手机 / 平板） */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/** 用户是否要求减弱动效，用于关掉倒计时的脉冲动画 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** 在线状态：离线时提示「结果已保存在本地」 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
