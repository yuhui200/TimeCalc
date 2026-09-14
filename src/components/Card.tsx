/**
 * 面板容器。
 * 所有功能页都用它包一层，保证圆角、内边距、标题层级在整个应用里一致。
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** 面板标题；用 h2 保证文档大纲正确（每个功能页只有一个 h1） */
  title?: ReactNode;
  /** 标题右侧的操作区 */
  actions?: ReactNode;
  /** 标题下方的说明文字 */
  description?: ReactNode;
  /** 去掉内边距，供表格/列表自己控制 */
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
  /** 用 aria-labelledby 把标题与区域关联起来 */
  id?: string;
}

export function Card({
  children,
  className,
  title,
  actions,
  description,
  flush = false,
  as: Tag = 'section',
  id,
}: CardProps) {
  const headingId = title && id ? `${id}-heading` : undefined;

  return (
    <Tag
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        !flush && 'p-4 sm:p-5',
        className,
      )}
    >
      {title || actions ? (
        <header
          className={cn(
            'flex items-start justify-between gap-3',
            flush && 'px-4 pt-4 sm:px-5 sm:pt-5',
            (description || children) && 'mb-4',
          )}
        >
          <div className="min-w-0">
            <h2 id={headingId} className="text-base font-semibold text-ink sm:text-lg">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-snug text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}

/** 一行「标签 — 值」，结果区大量使用 */
export function StatRow({
  label,
  value,
  hint,
  emphasis = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2',
        className,
      )}
    >
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={cn(
          'tnum text-right font-medium text-ink',
          emphasis && 'text-lg sm:text-xl',
        )}
      >
        {value}
        {hint ? <span className="ml-2 text-xs font-normal text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** 用 dl 包住一组 StatRow，语义上是一组「术语—描述」 */
export function StatList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('divide-y divide-line', className)}>{children}</dl>;
}
