/**
 * 模态对话框外壳。
 *
 * 无障碍上，模态是最容易做错的一类组件，这里把四件事做全：
 *   1. `role="dialog"` + `aria-modal="true"` + `aria-labelledby`；
 *   2. **焦点陷阱**：Tab / Shift+Tab 在对话框内循环，不会跑到背后的页面；
 *   3. **焦点归还**：关闭后焦点回到打开它的那个元素；
 *   4. **Esc 关闭** + 背景滚动锁定。
 *
 * 用原生 `<dialog>` 也是个选项，但它的 `showModal()` 在旧 WebView
 * （Tauri 用的 WKWebView / WebView2 老版本）上行为不一致，因此自己实现。
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { IconButton } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** 标题的补充说明 */
  description?: ReactNode;
  children: ReactNode;
  /** 底部操作区 */
  footer?: ReactNode;
  /** 面板最大宽度 */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/** 可聚焦元素选择器 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 记录打开前的焦点元素，关闭时归还
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const onCloseStable = useRef(onClose);
  onCloseStable.current = onClose;

  /* ---- 打开时：记录焦点、锁定滚动、把焦点移进对话框 ---- */
  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // 锁滚动：记下原来的 overflow，关闭时恢复，避免影响横向滚动容器
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 优先聚焦第一个可交互元素；没有则聚焦面板本身
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      // 焦点归还：元素可能已从 DOM 移除，所以要判 contains
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [open]);

  /* ---- 键盘：Esc 关闭 + Tab 焦点陷阱 ---- */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCloseStable.current();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      // 排除隐藏元素（如 sr-only 之外的 display:none）
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 pt-[10vh] sm:pt-[14vh]"
      onKeyDown={onKeyDown}
    >
      {/* 遮罩：点击关闭。用 aria-hidden 让屏幕阅读器忽略它 */}
      <div
        className="tc-backdrop fixed inset-0 animate-fade-in"
        aria-hidden="true"
        onClick={() => onCloseStable.current()}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full animate-slide-up rounded-card border border-line bg-surface shadow-pop',
          'max-h-[75vh] overflow-y-auto outline-none',
          SIZE_CLASS[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink sm:text-lg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm leading-snug text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="关闭" onClick={() => onCloseStable.current()}>
            ✕
          </IconButton>
        </header>

        <div className="p-4 sm:p-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line p-4 sm:p-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
