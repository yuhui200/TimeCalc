/**
 * PWA 安装提示。
 *
 * 浏览器只在满足「有 manifest + 有 Service Worker + 用户有交互」时才发
 * `beforeinstallprompt`，而且**必须**在事件里 `preventDefault()` 才能
 * 稍后手动触发——否则浏览器会自己弹一个我们控制不了的横幅。
 *
 * iOS Safari 永远不发这个事件，只能用 `navigator.standalone` 判断是否
 * 已安装，并展示「点分享 → 添加到主屏幕」的文字指引。
 */
import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from './usePlatform';

/** 浏览器提供的安装事件（TS 标准库里没有，需要自己声明） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UseInstallPromptResult {
  /** 可以走浏览器原生安装流程 */
  canInstall: boolean;
  /** 已作为 PWA 安装（独立窗口打开） */
  installed: boolean;
  /** iOS 这类只能手动指引的情况 */
  needsManualHint: boolean;
  /** 触发安装；返回用户是否接受 */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** 用户选择「以后再说」，本次会话不再主动提示 */
  dismiss: () => void;
  dismissed: boolean;
}

const DISMISS_KEY = 'timecalc:install-dismissed';

export function useInstallPrompt(): UseInstallPromptResult {
  const { info } = usePlatform();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(info.standalone);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // 必须拦截，否则浏览器会显示自带的安装横幅
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // 事件只能使用一次，无论结果如何都要丢弃
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 隐私模式下忽略，本次会话内仍然生效 */
    }
  }, []);

  // iOS 上既没装也拿不到事件 → 只能给手动指引
  const needsManualHint = !installed && !deferred && info.os === 'ios';

  return {
    canInstall: Boolean(deferred),
    installed,
    needsManualHint,
    promptInstall,
    dismiss,
    dismissed,
  };
}
