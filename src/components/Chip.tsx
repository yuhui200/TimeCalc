/**
 * 快捷操作芯片。
 *
 * 需求里「+1天 / +7天 / +30天 / +1月」这类按钮用它渲染。
 * 之所以不加 `size="sm"` 的 Button，是因为它们**不是次要操作**而是
 * 高频主路径——需要更紧凑、能一排放下，同时保持 48px 触摸高度。
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ChipProps {
  children: ReactNode;
  onClick?: () => void;
  /** 选中的芯片（如当前选中的预设） */
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
  className?: string;
  /** 用于纯展示的标签（不可点） */
  as?: 'button' | 'span';
  tone?: 'default' | 'accent' | 'danger';
}

export function Chip({
  children,
  onClick,
  active = false,
  disabled = false,
  icon,
  title,
  className,
  as = 'button',
  tone = 'default',
}: ChipProps) {
  const base = cn(
    'tnum inline-flex min-h-tap shrink-0 items-center justify-center gap-1.5 rounded-pill border-2 px-3.5',
    'text-sm font-medium transition-colors',
    active
      ? 'border-[var(--tc-accent)] bg-[var(--tc-accent-soft)] text-[var(--tc-accent)]'
      : tone === 'danger'
        ? 'border-[var(--tc-line)] bg-[var(--tc-surface)] text-[var(--tc-danger)] hover:border-[var(--tc-danger)]'
        : 'border-[var(--tc-line)] bg-[var(--tc-surface)] text-ink hover:border-[var(--tc-line-strong)] hover:bg-[var(--tc-surface-2)]',
    disabled && 'cursor-not-allowed opacity-40',
    className,
  );

  if (as === 'span') {
    return (
      <span className={base} title={title}>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={base}
    >
      {icon ? (
        <span aria-hidden="true" className="text-[0.95em] leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

/** 一排芯片，窄屏可横向滚动而不换行 */
export function ChipRow({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** 无障碍组名 */
  label?: string;
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn(
        // 负边距 + padding 让滚动区域贴到屏幕边缘，视觉上更像原生横向列表
        '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface BadgeProps {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger';
  className?: string;
}

const BADGE_TONE: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'border-[var(--tc-line)] text-[var(--tc-muted)]',
  accent: 'border-[var(--tc-accent)] text-[var(--tc-accent)]',
  ok: 'border-[var(--tc-ok)] text-[var(--tc-ok)]',
  warn: 'border-[var(--tc-warn)] text-[var(--tc-warn)]',
  danger: 'border-[var(--tc-danger)] text-[var(--tc-danger)]',
};

/** 小标签，如「近似值」「含调休」 */
export function Badge({ children, tone = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-medium',
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
