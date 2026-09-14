/**
 * 面板导航。
 *
 * 为什么不直接让面板 import App 里的路由状态：features 层不能反向依赖
 * apps 层，否则 shell 一改所有面板都要跟着改，也无法在测试里单独渲染面板。
 * 因此把「当前在哪个面板」提到 hooks 层，由 App 注入实现。
 *
 * 没有 Provider 时（单元测试直接渲染面板）返回一个安全空实现，
 * 面板里的「跳转」按钮点了就是无操作，不会抛异常。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface NavigationApi {
  /** 当前面板 id */
  current: string;
  /** 切换面板；会同步 URL hash，使浏览器前进/后退可用 */
  navigate: (panelId: string) => void;
}

const NavigationContext = createContext<NavigationApi | null>(null);

/** 无 Provider 时的降级实现：能读不能跳 */
const FALLBACK: NavigationApi = {
  current: '',
  navigate: () => {},
};

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationApi;
  children: ReactNode;
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationApi {
  return useContext(NavigationContext) ?? FALLBACK;
}

/**
 * 基于 URL hash 的导航实现。
 *
 * 用 hash 而不是 History API，因为 PWA / Tauri / Capacitor 三种壳里
 * hash 都不需要服务端配合，`file://` 与 `capacitor://` 下也能正常工作。
 */
export function useHashNavigation(
  panelIds: readonly string[],
  fallbackId: string,
): NavigationApi {
  const read = useCallback((): string => {
    if (typeof window === 'undefined') return fallbackId;
    const raw = window.location.hash.replace(/^#\/?/, '');
    return panelIds.includes(raw) ? raw : fallbackId;
  }, [panelIds, fallbackId]);

  const current = useHashValue(read, fallbackId);

  const navigate = useCallback(
    (panelId: string) => {
      const next = panelIds.includes(panelId) ? panelId : fallbackId;
      if (typeof window === 'undefined') return;
      if (read() === next) return;
      window.location.hash = `#/${next}`;
    },
    [panelIds, fallbackId, read],
  );

  return useMemo(() => ({ current, navigate }), [current, navigate]);
}

/* ------------------------------------------------------------------ */

/** 订阅 hashchange 并返回当前值 */
function useHashValue(read: () => string, fallback: string): string {
  const [value, setValue] = useState(read);

  useEffect(() => {
    setValue(read());
    const onChange = () => setValue(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [read]);

  return value || fallback;
}
