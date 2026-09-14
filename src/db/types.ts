/** 历史记录所属的功能面板 */
export type HistoryKind =
  | 'date-diff'
  | 'date-add'
  | 'time-diff'
  | 'time-add'
  | 'timezone'
  | 'unix'
  | 'natural'
  | 'countdown';

/** 各功能的展示名与图标（图标是纯 emoji，不引入图标库） */
export const HISTORY_KIND_META: Record<HistoryKind, { label: string; icon: string }> = {
  'date-diff': { label: '日期差', icon: '📅' },
  'date-add': { label: '日期加减', icon: '➕' },
  'time-diff': { label: '时间差', icon: '⏱' },
  'time-add': { label: '时间加减', icon: '🕐' },
  timezone: { label: '时区换算', icon: '🌍' },
  unix: { label: '时间戳', icon: '#️⃣' },
  natural: { label: '自然语言', icon: '💬' },
  countdown: { label: '倒计时', icon: '⏳' },
};

export const ALL_HISTORY_KINDS = Object.keys(HISTORY_KIND_META) as HistoryKind[];
