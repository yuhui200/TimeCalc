/**
 * 按钮。
 *
 * 强约束（来自需求）：**所有按钮至少 48×48px**。
 * 通过 `.tc-tap`（min-height/min-width: 48px）实现，而不是固定 height：
 * 图标按钮和文字按钮共用一套规则，字号放大时还能自然长高。
 *
 * 无障碍：加载态用 `aria-busy` + 禁用，而不是只换文案——
 * 否则屏幕阅读器用户会以为按钮还在可点。
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
/**
 * 只有两档，且都 ≥ 56px 起步——需求里「按钮至少 48px」是硬约束，
 * 所以这里**故意不提供** sm：
 * 一旦存在小尺寸变体，迟早会有人用它把触摸目标做到 32px。
 */
export type ButtonSize = 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--tc-accent)] text-[var(--tc-accent-ink)] hover:bg-[var(--tc-accent-hover)] active:brightness-95 shadow-sm',
  secondary:
    'border-2 border-[var(--tc-line-strong)] bg-[var(--tc-surface)] text-[var(--tc-ink)] hover:bg-[var(--tc-surface-2)]',
  ghost:
    'bg-transparent text-[var(--tc-ink)] hover:bg-[var(--tc-surface-2)]',
  // 危险操作给实心红：确认对话框的「删除」必须一眼可辨
  danger:
    'bg-[var(--tc-danger)] text-white hover:brightness-110 active:brightness-95 shadow-sm',
  quiet:
    'bg-transparent text-[var(--tc-muted)] hover:bg-[var(--tc-surface-2)] hover:text-[var(--tc-ink)]',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  // md 是默认值，高度正好是 48px 的触摸下限
  md: 'min-h-tap min-w-tap px-4 text-base rounded-xl',
  lg: 'min-h-[56px] min-w-[56px] px-6 text-lg rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 前置图标（emoji 或 svg），会自动加 aria-hidden */
  icon?: ReactNode;
  /** 后置图标 */
  trailing?: ReactNode;
  /** 撑满父容器宽度，移动端主操作按钮常用 */
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    trailing,
    block = false,
    loading = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      // 默认 type="button"：否则放在 <form> 里会意外触发提交
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'tc-tap select-none',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'w-full',
        // 禁用态用降低不透明度 + 禁止指针，避免依赖颜色单独表达状态
        isDisabled && 'cursor-not-allowed opacity-50 hover:brightness-100',
        'transition-[background-color,filter,opacity] duration-150',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <span aria-hidden="true" className="shrink-0 text-[1.05em] leading-none">
          {icon}
        </span>
      ) : null}
      {children != null && children !== '' ? <span className="truncate">{children}</span> : null}
      {trailing ? (
        <span aria-hidden="true" className="shrink-0 text-[0.9em] leading-none">
          {trailing}
        </span>
      ) : null}
    </button>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/* ------------------------------------------------------------------ */

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children' | 'block'> {
  /** 无障碍名称，必填——图标按钮没有可见文字，屏幕阅读器只能靠它 */
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = 'md', variant = 'ghost', className, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      // 图标按钮固定成正方形，避免文字按钮的横向 padding 把它拉宽
      className={cn('aspect-square px-0', className)}
      {...rest}
    >
      {children}
    </Button>
  );
});
