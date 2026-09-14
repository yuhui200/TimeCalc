/**
 * 复制按钮。
 *
 * 用 aria-live 播报「已复制」而不是只换图标：图标变化对屏幕阅读器
 * 是不可见的，用户不知道操作是否成功。
 */
import { cn } from './cn';
import { Button, type ButtonProps } from './Button';
import { useCopy } from '../hooks/useCopy';

export interface CopyButtonProps
  extends Omit<ButtonProps, 'onClick' | 'children' | 'icon' | 'loading'> {
  text: string;
  /** 无障碍名称与 toast 文案的前缀，如「结果」「时间戳」 */
  label?: string;
  /** 复制成功时是否弹 toast，默认跟随设置 */
  silent?: boolean;
  /** 只显示图标（用于空间紧张的行内位置） */
  iconOnly?: boolean;
}

export function CopyButton({
  text,
  label = '结果',
  silent = false,
  iconOnly = false,
  className,
  variant = 'secondary',
  size = 'md',
  ...rest
}: CopyButtonProps) {
  const { copy, copied } = useCopy();

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={copied ? `${label}已复制` : `复制${label}`}
        disabled={!text}
        onClick={() => void copy(text, { label, silent })}
        icon={copied ? '✓' : '📋'}
        className={cn(copied && 'text-[var(--tc-ok)]', className)}
        {...rest}
      >
        {iconOnly ? null : copied ? '已复制' : '复制'}
      </Button>

      {/*
        独立的 live region。
        不能只靠按钮自身的 aria-label 变化——多数屏幕阅读器不会为
        已聚焦元素的属性变化触发播报，必须有一个内容变化的 status 节点。
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label}已复制到剪贴板` : ''}
      </span>
    </>
  );
}
