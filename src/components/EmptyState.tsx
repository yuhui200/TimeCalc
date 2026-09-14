/**
 * 空状态。
 * 空列表/未计算时给一句「接下来能做什么」，而不是只写「暂无数据」。
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** 压缩版，用于卡片内部的次要空状态 */
  compact?: boolean;
}

export function EmptyState({
  icon = '🗒',
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'py-6' : 'py-10',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('leading-none', compact ? 'text-2xl' : 'text-4xl')}>
        {icon}
      </span>
      <p className={cn('font-medium text-ink', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-snug text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
