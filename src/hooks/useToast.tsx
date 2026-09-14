/**
 * 轻量 Toast 系统。
 *
 * 不引第三方库的理由：需求只要求「复制后给个反馈」，一个 Context +
 * 固定定位容器就够了；引库反而要处理它的样式与暗色主题适配。
 *
 * 无障碍要点（都实现了）：
 *   - 容器是 `aria-live="polite"` 且 `role="status"`，屏幕阅读器会播报；
 *   - 错误类 toast 用 `role="alert"` 立即播报；
 *   - 有「关闭」按钮，不强迫用户等它自己消失；
 *   - 鼠标悬停时暂停自动消失，给用户读长文案的时间。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** 可选的操作按钮，如「撤销」 */
  action?: { label: string; onClick: () => void };
  /** 自动消失毫秒数；0 表示不自动消失 */
  duration: number;
}

export interface ToastApi {
  show: (message: string, options?: Partial<Omit<Toast, 'id' | 'message'>>) => number;
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => number;
  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => number;
  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => number;
  dismiss: (id: number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 同时最多显示几条，超出时挤掉最旧的，避免刷屏 */
const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  // 记录每条 toast 的定时器，dismiss 时要清掉
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, options = {}) => {
      const id = nextId.current;
      nextId.current += 1;

      const toast: Toast = {
        id,
        message,
        tone: options.tone ?? 'info',
        action: options.action,
        // 错误默认停留更久：用户往往需要读完才知道怎么办
        duration: options.duration ?? (options.tone === 'error' ? 6000 : 2600),
      };

      setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));

      if (toast.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const success = useCallback<ToastApi['success']>(
    (message, options) => show(message, { ...options, tone: 'success' }),
    [show],
  );
  const error = useCallback<ToastApi['error']>(
    (message, options) => show(message, { ...options, tone: 'error' }),
    [show],
  );
  const warning = useCallback<ToastApi['warning']>(
    (message, options) => show(message, { ...options, tone: 'warning' }),
    [show],
  );

  // 卸载时清空所有定时器，防止对已卸载组件 setState
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ show, success, error, warning, dismiss, dismissAll: () => setToasts([]) }),
    [show, success, error, warning, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      // pointer-events-none 让容器不挡住下面的按钮，子项再单独打开
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:left-auto sm:right-4 sm:items-end sm:p-0"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'border-[var(--tc-line)] bg-[var(--tc-surface)] text-[var(--tc-ink)]',
  success: 'border-[var(--tc-ok)] bg-[var(--tc-surface)] text-[var(--tc-ink)]',
  warning: 'border-[var(--tc-warn)] bg-[var(--tc-surface)] text-[var(--tc-ink)]',
  error: 'border-[var(--tc-danger)] bg-[var(--tc-surface)] text-[var(--tc-ink)]',
};

const TONE_ICON: Record<ToastTone, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '⛔',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-2 px-4 py-3 shadow-lg ${TONE_CLASS[toast.tone]}`}
    >
      <span aria-hidden="true" className="mt-0.5 text-base leading-none">
        {TONE_ICON[toast.tone]}
      </span>
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>

      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="inline-flex min-h-tap shrink-0 items-center rounded-md px-2 text-sm font-semibold text-[var(--tc-accent)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-accent)]"
        >
          {toast.action.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭提示"
        className="-mr-2 -my-1 flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-md text-[var(--tc-ink-muted)] transition-colors hover:bg-[var(--tc-line)] hover:text-[var(--tc-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-accent)]"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

/**
 * 取 Toast API。
 * 没有 Provider 时返回一个静默实现，而不是抛错——
 * 这样组件可以脱离 Provider 单独做单元测试。
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api) return api;
  return SILENT_TOAST;
}

const noop = () => 0;
const SILENT_TOAST: ToastApi = {
  show: noop,
  success: noop,
  error: noop,
  warning: noop,
  dismiss: () => {},
  dismissAll: () => {},
};
