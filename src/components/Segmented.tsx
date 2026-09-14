/**
 * 分段控件。
 *
 * 语义上这是一组**单选**，所以底层用 `role="radiogroup"` + `role="radio"`，
 * 而不是一排 button：屏幕阅读器会播报「3 选 1，当前选中第 2 项」，
 * 用户按方向键就能切换，不需要 Tab 逐个走。
 */
import { useCallback, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** 无障碍名称；label 是图标时必填 */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** 无障碍组名，如「计算模式」 */
  label: string;
  /** 隐藏 label 的视觉呈现，只留给屏幕阅读器 */
  hideLabel?: boolean;
  className?: string;
  /** 撑满宽度（移动端常用） */
  block?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  hideLabel = true,
  className,
  block = true,
}: SegmentedProps<T>) {
  const groupId = useId();
  const refs = useRef(new Map<T, HTMLButtonElement>());

  /** 方向键在选项间移动焦点并顺便选中（符合 radiogroup 的键盘约定） */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      const enabled = options.filter((o) => !o.disabled);
      if (enabled.length === 0) return;

      let delta = 0;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') delta = 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') delta = -1;
      else if (event.key === 'Home') {
        event.preventDefault();
        const first = enabled[0];
        if (first) {
          onChange(first.value);
          refs.current.get(first.value)?.focus();
        }
        return;
      } else if (event.key === 'End') {
        event.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last) {
          onChange(last.value);
          refs.current.get(last.value)?.focus();
        }
        return;
      } else {
        return;
      }

      event.preventDefault();
      const currentIndex = enabled.findIndex((o) => o.value === options[index]?.value);
      const nextIndex = (currentIndex + delta + enabled.length) % enabled.length;
      const next = enabled[nextIndex];
      if (next) {
        onChange(next.value);
        refs.current.get(next.value)?.focus();
      }
    },
    [onChange, options],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span id={groupId} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className={cn(
          'flex gap-1 rounded-xl border border-line bg-[var(--tc-surface-2)] p-1',
          // 选项多时横向滚动而不是换行，保持「一排」的视觉语义
          !block && 'w-fit',
          block && 'w-full overflow-x-auto',
        )}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) refs.current.set(option.value, node);
                else refs.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              // 只有选中的项留在 Tab 序列里，其余用方向键访问
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'tc-segment',
                selected
                  ? 'bg-[var(--tc-surface)] font-semibold text-[var(--tc-ink)] shadow-sm'
                  : 'text-muted hover:text-ink',
                option.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 标签页容器：与 Segmented 的区别是它承载**内容**而不只是切值。
 * 同样用 tablist 语义，方向键可切换。
 */
export interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  className?: string;
}

export function Tabs<T extends string>({ value, onChange, options, label, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={option.ariaLabel}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const enabled = options.filter((o) => !o.disabled);
              const index = enabled.findIndex((o) => o.value === option.value);
              let delta = 0;
              if (event.key === 'ArrowRight') delta = 1;
              else if (event.key === 'ArrowLeft') delta = -1;
              else return;
              event.preventDefault();
              const next = enabled[(index + delta + enabled.length) % enabled.length];
              if (next) onChange(next.value);
            }}
            className={cn(
              'min-h-tap shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
              selected
                ? 'bg-[var(--tc-accent-soft)] text-[var(--tc-accent)]'
                : 'text-muted hover:bg-[var(--tc-surface-2)] hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
