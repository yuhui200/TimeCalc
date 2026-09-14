/**
 * 历史记录 hook。
 *
 * 不用 dexie-react-hooks 的 useLiveQuery，原因：
 *   - 它依赖 Dexie 的 observable 机制，在 IndexedDB 不可用时会抛，
 *     而我们的降级策略要求「历史坏了也不能影响计算」；
 *   - 历史写入是**我们自己的代码**发起的，显式 refresh 比观察者模式
 *     更容易推理，也省掉一层运行时依赖。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addHistory,
  clearHistory,
  historyCount,
  listHistory,
  removeHistory,
  togglePinned,
  type AddHistoryInput,
  type ListHistoryOptions,
} from '../db/history';
import type { HistoryRow } from '../db/schema';
import { useSettings } from './useSettings';

export interface UseHistoryResult {
  items: HistoryRow[];
  total: number;
  loading: boolean;
  /** 记录一条（受设置里的 historyEnabled 控制） */
  record: (entry: AddHistoryInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
  pin: (id: number) => Promise<void>;
  clear: (keepPinned?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useHistory(options: ListHistoryOptions = {}): UseHistoryResult {
  const { settings } = useSettings();
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 把查询条件拆成原始值作为依赖，避免每次渲染新建对象导致无限刷新
  const { kind, query, limit } = options;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [rows, count] = await Promise.all([
      listHistory({ kind, query, limit }),
      historyCount(),
    ]);
    if (!mounted.current) return;
    setItems(rows);
    setTotal(count);
    setLoading(false);
  }, [kind, query, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const record = useCallback(
    async (entry: AddHistoryInput) => {
      if (!settings.historyEnabled) return;
      await addHistory(entry);
      await refresh();
    },
    [settings.historyEnabled, refresh],
  );

  const remove = useCallback(
    async (id: number) => {
      await removeHistory(id);
      await refresh();
    },
    [refresh],
  );

  const pin = useCallback(
    async (id: number) => {
      await togglePinned(id);
      await refresh();
    },
    [refresh],
  );

  const clear = useCallback(
    async (keepPinned = true) => {
      await clearHistory(keepPinned);
      await refresh();
    },
    [refresh],
  );

  return { items, total, loading, record, remove, pin, clear, refresh };
}

/**
 * 只用于「记录下来」的场景（各功能面板算完就记）。
 * 不订阅列表，避免面板因为历史变化而重渲染。
 */
export function useHistoryRecorder(): (entry: AddHistoryInput) => Promise<void> {
  const { settings } = useSettings();
  return useCallback(
    async (entry: AddHistoryInput) => {
      if (!settings.historyEnabled) return;
      await addHistory(entry);
    },
    [settings.historyEnabled],
  );
}
