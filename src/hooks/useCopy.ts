/**
 * 「复制结果」的统一入口。
 *
 * 所有复制都必须走这里，原因是它把三件容易漏掉的事收在一处：
 *   1. 剪贴板失败时的降级提示（而不是静默失败）；
 *   2. 复制成功的 toast（受设置 toastOnCopy 控制）；
 *   3. 移动端的轻触反馈（haptics），桌面端自动忽略。
 */
import { useCallback, useState } from 'react';
import { usePlatform } from './usePlatform';
import { useToast } from './useToast';

export interface UseCopyResult {
  copy: (text: string, options?: { label?: string; silent?: boolean }) => Promise<boolean>;
  /** 上一次复制是否成功，用于按钮短暂切换成「已复制」 */
  copied: boolean;
  lastText: string | null;
}

export function useCopy(): UseCopyResult {
  const { clipboard } = usePlatform();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, options: { label?: string; silent?: boolean } = {}) => {
      const { label = '结果', silent = false } = options;

      if (!text) {
        if (!silent) toast.warning('没有可复制的内容');
        return false;
      }

      const result = await clipboard.writeText(text);

      if (!result.ok) {
        // 失败原因要具体，否则用户不知道该怎么办
        const hint =
          result.reason === 'unsupported'
            ? '当前环境不支持自动复制，请手动选择文本'
            : '复制被浏览器拦截，请先点击页面任意处再试';
        toast.error(`${label}复制失败：${hint}`);
        return false;
      }

      setLastText(text);
      setCopied(true);
      // 1.6s 后恢复按钮文字，足够用户感知但不至于卡住界面
      setTimeout(() => setCopied(false), 1600);

      if (!silent) toast.success(`${label}已复制`);

      // 移动端给一次轻触反馈；非 Capacitor 环境下这个调用是空操作
      void import('../platform/capacitor').then((m) => m.tapFeedback()).catch(() => {});

      return true;
    },
    [clipboard, toast],
  );

  return { copy, copied, lastText };
}
