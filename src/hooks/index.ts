/** hooks 统一出口 */
export { PlatformProvider, usePlatform, usePlatformInfo } from './usePlatform';
export { useTheme, type ThemeState } from './useTheme';
export { useSettings, useSetting, type UseSettingsResult } from './useSettings';
export { useHistory, useHistoryRecorder, type UseHistoryResult } from './useHistory';
export { ToastProvider, useToast, type Toast, type ToastApi, type ToastTone } from './useToast';
export {
  useHotkeys,
  useGlobalHotkeys,
  formatAccelerator,
  hasModifier,
  type HotkeyDefinition,
} from './useHotkeys';
export { useCopy, type UseCopyResult } from './useCopy';
export { useCountdown, useNow, type UseCountdownOptions, type UseCountdownResult } from './useCountdown';
export { useInstallPrompt, type UseInstallPromptResult } from './useInstallPrompt';
export {
  useIsDesktop,
  useIsTouch,
  useMediaQuery,
  useOnline,
  usePrefersReducedMotion,
} from './useMediaQuery';
