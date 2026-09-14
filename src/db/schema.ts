/**
 * Dexie 数据库定义。
 *
 * 设计取舍：
 *   - **历史记录**用自增主键 + 索引 `createdAt`，因为最常见的操作是
 *     「按时间倒序取最近 N 条」；`kind` 上再建一个索引支持按功能筛选。
 *   - **设置不放这里**。设置项要在首屏渲染前同步读取（否则主题会闪一下），
 *     而 IndexedDB 是异步的。设置统一走 `src/db/settings.ts` 的
 *     localStorage 实现，这里只存会无限增长的数据。
 *   - 迁移链（version(1) → version(2) …）在这里集中声明，
 *     禁止在业务代码里写 `db.version()`。
 */
import Dexie, { type Table } from 'dexie';
import type { HistoryKind } from './types';

export interface HistoryRow {
  /** 自增主键；新建时省略 */
  id?: number;
  /** 属于哪个功能面板，用于筛选与图标展示 */
  kind: HistoryKind;
  /** 用户输入的原始文本（用于回填输入框） */
  input: string;
  /** 计算结果的短文本（用于列表直接展示，避免重算） */
  output: string;
  /** 结果的完整序列化形态，用于「点历史还原现场」 */
  payload?: unknown;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 收藏置顶 */
  pinned?: 0 | 1;
  /** 被使用的次数，用于「常用」排序；每次点击历史 +1 */
  uses?: number;
}

/** 收藏的时区组合，避免每次重新挑选 */
export interface ZonePairRow {
  id?: number;
  from: string;
  to: string;
  createdAt: number;
}

export class TimeCalcDB extends Dexie {
  history!: Table<HistoryRow, number>;
  zonePairs!: Table<ZonePairRow, number>;

  constructor(name = 'timecalc') {
    super(name);

    // v1：初始结构
    this.version(1).stores({
      history: '++id, createdAt, kind, pinned, [kind+createdAt]',
      zonePairs: '++id, createdAt, [from+to]',
    });
  }
}

/**
 * 单例。测试里通过 `new TimeCalcDB('test-xxx')` 建独立库，
 * 因此这里只作为生产环境的默认实例。
 */
export const db = new TimeCalcDB();

/** 判断一个错误是否是「存储不可用」（隐私模式 / 配额耗尽） */
export function isStorageUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'InvalidStateError' ||
    // Safari 隐私模式下 indexedDB.open 直接抛这个
    /indexeddb|quota|denied/i.test(error.message)
  );
}
