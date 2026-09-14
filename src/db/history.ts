/**
 * 历史记录的读写。
 *
 * 三个约束决定了这里的实现：
 *   1. **去重**：同一 kind + 同一 input 反复计算只保留一条，把 uses 累加、
 *      刷新 createdAt。否则「1+1」按两次会塞满整个历史列表。
 *   2. **上限**：默认最多留 500 条，超出时按「先删未收藏、再删最旧」的顺序裁剪。
 *   3. **降级**：IndexedDB 不可用（Safari 隐私模式）时所有读写都返回空结果，
 *      由 UI 提示「历史记录当前不可用」，而不是让整个应用崩掉。
 */
import { db, isStorageUnavailable, type HistoryRow } from './schema';
import type { HistoryKind } from './types';

export const HISTORY_LIMIT = 500;

export interface AddHistoryInput {
  kind: HistoryKind;
  input: string;
  output: string;
  payload?: unknown;
}

/**
 * 写入一条历史。
 * 返回写入后的行；存储不可用时返回 null。
 */
export async function addHistory(entry: AddHistoryInput): Promise<HistoryRow | null> {
  const input = entry.input.trim();
  // 空输入没有记录价值，而且会让去重逻辑误伤
  if (!input) return null;

  try {
    return await db.transaction('rw', db.history, async () => {
      const existing = await db.history
        .where('[kind+createdAt]')
        .between([entry.kind, 0], [entry.kind, Number.MAX_SAFE_INTEGER])
        .filter((row) => row.input === input)
        .first();

      if (existing?.id != null) {
        await db.history.update(existing.id, {
          output: entry.output,
          payload: entry.payload,
          createdAt: Date.now(),
          uses: (existing.uses ?? 1) + 1,
        });
        return (await db.history.get(existing.id)) ?? null;
      }

      const id = await db.history.add({
        kind: entry.kind,
        input,
        output: entry.output,
        payload: entry.payload,
        createdAt: Date.now(),
        pinned: 0,
        uses: 1,
      });

      await trimHistory();
      return (await db.history.get(id)) ?? null;
    });
  } catch (error) {
    if (isStorageUnavailable(error)) return null;
    // 其它错误（如结构不匹配）也不应阻断计算，吞掉并返回 null 由调用方提示
    console.warn('[timecalc] 写入历史失败', error);
    return null;
  }
}

/**
 * 裁剪到上限：收藏项**永不删除**，超出部分从未收藏的最旧记录开始删。
 *
 * 注意预算的算法：可删条数 = 上限 - 收藏数。若收藏数本身已超上限，
 * 则预算为 0，此时宁可让总量超标也不能动用户的收藏。
 */
async function trimHistory(): Promise<void> {
  const total = await db.history.count();
  if (total <= HISTORY_LIMIT) return;

  const pinnedCount = await db.history.filter((row) => Boolean(row.pinned)).count();
  const budget = Math.max(0, HISTORY_LIMIT - pinnedCount);
  if (budget <= 0) return;

  const stale = await db.history
    .orderBy('createdAt')
    .reverse()
    .filter((row) => !row.pinned)
    .offset(budget)
    .toArray();

  const ids = stale.map((row) => row.id).filter((id): id is number => id != null);
  if (ids.length > 0) await db.history.bulkDelete(ids);
}

export interface ListHistoryOptions {
  kind?: HistoryKind;
  /** 关键字搜索：同时匹配 input 与 output */
  query?: string;
  limit?: number;
}

/**
 * 按时间倒序列出历史，收藏项排在最前。
 * 收藏优先用内存排序实现（数据量上限 500，无需额外索引）。
 */
export async function listHistory(options: ListHistoryOptions = {}): Promise<HistoryRow[]> {
  const { kind, query, limit = 100 } = options;
  try {
    let rows: HistoryRow[];
    if (kind) {
      rows = await db.history.where('kind').equals(kind).toArray();
    } else {
      rows = await db.history.toArray();
    }

    const keyword = query?.trim().toLowerCase();
    if (keyword) {
      rows = rows.filter(
        (r) =>
          r.input.toLowerCase().includes(keyword) || r.output.toLowerCase().includes(keyword),
      );
    }

    rows.sort((a, b) => {
      const pinDiff = (b.pinned ?? 0) - (a.pinned ?? 0);
      if (pinDiff !== 0) return pinDiff;
      return b.createdAt - a.createdAt;
    });

    return rows.slice(0, limit);
  } catch (error) {
    if (!isStorageUnavailable(error)) console.warn('[timecalc] 读取历史失败', error);
    return [];
  }
}

/** 切换收藏状态 */
export async function togglePinned(id: number): Promise<void> {
  try {
    const row = await db.history.get(id);
    if (!row) return;
    await db.history.update(id, { pinned: row.pinned ? 0 : 1 });
  } catch {
    /* 忽略 */
  }
}

/** 删除单条 */
export async function removeHistory(id: number): Promise<void> {
  try {
    await db.history.delete(id);
  } catch {
    /* 忽略 */
  }
}

/** 清空历史；`keepPinned` 为 true 时保留收藏项 */
export async function clearHistory(keepPinned = true): Promise<number> {
  try {
    if (!keepPinned) {
      const count = await db.history.count();
      await db.history.clear();
      return count;
    }
    const ids = await db.history
      .filter((row) => !row.pinned)
      .primaryKeys();
    await db.history.bulkDelete(ids as number[]);
    return ids.length;
  } catch {
    return 0;
  }
}

/** 历史总条数，用于设置页展示 */
export async function historyCount(): Promise<number> {
  try {
    return await db.history.count();
  } catch {
    return 0;
  }
}
