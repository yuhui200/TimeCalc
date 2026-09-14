/** 持久化层统一出口 */
export { TimeCalcDB, db, isStorageUnavailable, type HistoryRow, type ZonePairRow } from './schema';
export {
  ALL_HISTORY_KINDS,
  HISTORY_KIND_META,
  type HistoryKind,
} from './types';
export {
  HISTORY_LIMIT,
  addHistory,
  clearHistory,
  historyCount,
  listHistory,
  removeHistory,
  togglePinned,
  type AddHistoryInput,
  type ListHistoryOptions,
} from './history';
export {
  DEFAULT_SETTINGS,
  coerce,
  loadSettings,
  patchSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  __resetSettingsCache,
  type ContrastMode,
  type HolidayRegion,
  type Settings,
  type ThemeMode,
} from './settings';
