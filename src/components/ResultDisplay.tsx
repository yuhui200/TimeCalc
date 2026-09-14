/**
 * 结果展示区。
 *
 * 需求要求「结果用大字号」+「可复制」。这两件事在这里绑在一起：
 * 主数值（primary）永远最大，且右侧永远有一个复制按钮——
 * 用户不需要先想「我要复制哪一段」。
 *
 * 无障碍上，结果区是 `aria-live="polite"`：用户改完输入，
 * 屏幕阅读器会自动念出新结果，不必手动找。
 */
import type { ReactNode } from 'react';
import { cn } from './cn';
import { CopyButton } from './CopyButton';
import { StatList, StatRow } from './Card';

export interface ResultDisplayProps {
  /** 是否已算出结果。false 时显示 placeholder */
  ready: boolean;
  /** 主数值，大字号显示 */
  primary: ReactNode;
  /** 主数值下方的单位或说明 */
  primaryHint?: ReactNode;
  /** 要复制的文本；省略则不显示复制按钮 */
  copyText?: string;
  /** 附加的明细行 */
  rows?: Array<{ label: ReactNode; value: ReactNode; hint?: ReactNode; emphasis?: boolean }>;
  /** 结果下方的补充说明（如「两个日期之间含首尾」） */
  footnote?: ReactNode;
  /** 无结果时的占位文案 */
  placeholder?: ReactNode;
  /** 出错时的提示，会取代主数值 */
  error?: ReactNode;
  className?: string;
}

export function ResultDisplay({
  ready,
  primary,
  primaryHint,
  copyText,
  rows,
  footnote,
  placeholder = '填写上方输入后自动计算',
  error,
  className,
}: ResultDisplayProps) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface p-4 sm:p-5', className)}
      // 结果变化时播报；polite 表示不打断用户当前的朗读
      aria-live="polite"
      aria-atomic="true"
    >
      {error ? (
        <div role="alert" className="flex items-start gap-2 text-[var(--tc-danger)]">
          <span aria-hidden="true">⛔</span>
          <p className="text-sm leading-snug">{error}</p>
        </div>
      ) : !ready ? (
        <p className="py-2 text-sm text-muted">{placeholder}</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 tc-break">
              <div className="tc-result">{primary}</div>
              {primaryHint ? (
                <p className="mt-1.5 text-sm text-muted">{primaryHint}</p>
              ) : null}
            </div>
            {copyText ? (
              <CopyButton
                text={copyText}
                label="复制结果"
                variant="secondary"
                size="md"
                className="shrink-0"
              />
            ) : null}
          </div>

          {rows && rows.length > 0 ? (
            <StatList className="mt-4 border-t border-line pt-1">
              {rows.map((row, index) => (
                <StatRow
                  key={index}
                  label={row.label}
                  value={row.value}
                  hint={row.hint}
                  emphasis={row.emphasis}
                />
              ))}
            </StatList>
          ) : null}

          {footnote ? (
            <p className="mt-3 border-t border-line pt-3 text-xs leading-snug text-muted">
              {footnote}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
