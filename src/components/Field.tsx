/**
 * 表单字段族。
 *
 * 全部字段共用一套无障碍接线，这是把它们放在同一个文件的原因：
 *   - `<label for>` 与控件 id 必须匹配（用 useId 生成，避免手写 id 撞车）
 *   - hint / error 通过 `aria-describedby` 关联，屏幕阅读器会念出来
 *   - 出错时加 `aria-invalid`，并让错误文案带 `role="alert"`
 *
 * 输入类控件统一 min-height: 48px，符合「按钮/输入至少 48px」的触控要求。
 */
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

/* ------------------------------------------------------------------ */
/* 外壳                                                                */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label: ReactNode;
  /** 关联的控件 id */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** 单位后缀，如「天」「小时」 */
  suffix?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** 右侧的小操作，如「今天」按钮 */
  action?: ReactNode;
}

/**
 * 字段外壳。既可以直接包住自定义控件，
 * 也被下面的 TextField / DateField 等复用。
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  suffix,
  required,
  children,
  className,
  action,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-0.5 text-[var(--tc-danger)]" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {action}
      </div>

      <div className="relative flex items-center">
        {children}
        {suffix ? (
          <span
            className="pointer-events-none absolute right-3 text-sm text-muted"
            aria-hidden="true"
          >
            {suffix}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--tc-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** 所有输入控件的公共样式 */
const INPUT_BASE =
  'w-full min-h-tap rounded-xl border-2 bg-[var(--tc-surface-2)] px-3 text-base text-ink ' +
  'placeholder:text-muted transition-colors ' +
  'focus:border-[var(--tc-accent)] focus:bg-[var(--tc-surface)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* 文本输入                                                            */
/* ------------------------------------------------------------------ */

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  suffix?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** 等宽字体，用于数值/时间戳输入 */
  mono?: boolean;
  /** 撑满：默认就是 w-full，这里只为可读性保留 */
  inputClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, suffix, action, className, inputClassName, mono, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = hint || error ? `${inputId}-desc` : undefined;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      suffix={suffix}
      action={action}
      className={className}
    >
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          INPUT_BASE,
          error ? 'border-[var(--tc-danger)]' : 'border-[var(--tc-line)]',
          mono && 'tnum font-mono',
          // 有后缀时右侧留白，避免文字被单位压住
          suffix && 'pr-14',
          inputClassName,
        )}
        {...rest}
      />
    </Field>
  );
});

/** 多行输入，用于自然语言框 */
export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    label: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    className?: string;
    inputClassName?: string;
  }
>(function TextAreaField(
  { label, hint, error, className, inputClassName, id, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      className={className}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${inputId}-desc` : undefined}
        className={cn(
          INPUT_BASE,
          'resize-y py-2.5 leading-relaxed',
          error ? 'border-[var(--tc-danger)]' : 'border-[var(--tc-line)]',
          inputClassName,
        )}
        {...rest}
      />
    </Field>
  );
});

/* ------------------------------------------------------------------ */
/* 日期 / 时间                                                         */
/* ------------------------------------------------------------------ */

export interface DateFieldProps extends Omit<TextFieldProps, 'type' | 'mono'> {
  /** 允许清空（如「结束日期留空表示今天」） */
  clearable?: boolean;
}

/**
 * 日期输入。
 *
 * 用原生 `<input type="date">` 而不是自绘日历，理由是：
 * 移动端原生选择器体验最好、支持系统语言、自动处理闰年与月份天数。
 * 代价是不同浏览器外观不同，但功能正确性优先。
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { clearable, action, ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      type="date"
      mono
      inputMode="numeric"
      autoComplete="off"
      action={action}
      {...rest}
      // clearable 时浏览器自带清除按钮，无需额外处理
      data-clearable={clearable ? 'true' : undefined}
    />
  );
});

export const TimeField = forwardRef<HTMLInputElement, TextFieldProps>(function TimeField(
  props,
  ref,
) {
  return (
    <TextField
      ref={ref}
      type="time"
      mono
      // step=1 才能选到秒；多数场景只需要分钟，用 60 减少误操作
      step={60}
      autoComplete="off"
      {...props}
    />
  );
});

export const DateTimeField = forwardRef<HTMLInputElement, TextFieldProps>(function DateTimeField(
  props,
  ref,
) {
  return (
    <TextField
      ref={ref}
      type="datetime-local"
      mono
      autoComplete="off"
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ */
/* 数字                                                                */
/* ------------------------------------------------------------------ */

export interface NumberFieldProps extends Omit<TextFieldProps, 'type' | 'mono'> {
  min?: number;
  max?: number;
  step?: number;
}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { min, max, step, ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      type="number"
      mono
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      {...rest}
    />
  );
});

/* ------------------------------------------------------------------ */
/* 下拉                                                                */
/* ------------------------------------------------------------------ */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'> {
  label: ReactNode;
  options: readonly SelectOption<T>[];
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  selectClassName?: string;
}

export function SelectField<T extends string = string>({
  label,
  options,
  hint,
  error,
  className,
  selectClassName,
  id,
  ...rest
}: SelectFieldProps<T>) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} className={className}>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${selectId}-desc` : undefined}
        className={cn(
          INPUT_BASE,
          'appearance-none pr-10',
          error ? 'border-[var(--tc-danger)]' : 'border-[var(--tc-line)]',
          selectClassName,
        )}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {/* 自绘箭头：appearance-none 后原生箭头也没了 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 text-xs text-muted"
      >
        ▼
      </span>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* 开关                                                                */
/* ------------------------------------------------------------------ */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * 开关。
 *
 * 用原生 checkbox + peer 样式实现，而不是 button + role="switch"：
 * 原生控件自带键盘交互（空格）、表单语义与「已选中」播报，
 * 手写一遍几乎必然漏掉某些边界。
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;

  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <div className="min-w-0">
        <label htmlFor={switchId} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p>
        ) : null}
      </div>

      {/*
        触摸目标：外层 label 用 min-h-tap 撑到 48px 高，
        视觉上的开关轨道只有 48×28，触摸热区却满足要求。
      */}
      <label className="relative mt-0.5 inline-flex min-h-tap shrink-0 cursor-pointer items-center">
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'relative block h-7 w-12 rounded-full border-2 transition-colors',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--tc-accent)]',
            checked
              ? 'border-[var(--tc-accent)] bg-[var(--tc-accent)]'
              : 'border-[var(--tc-line-strong)] bg-[var(--tc-surface-2)]',
            disabled && 'opacity-50',
          )}
        >
          {/* 轨道 28px 高、边框 2px、圆点 20px → 上下各留 2px */}
          <span
            className={cn(
              'absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150',
              // 48 - 2×2(边框) - 20(圆点) - 2(左边距) = 22px
              checked ? 'left-[22px]' : 'left-[2px]',
            )}
          />
        </span>
      </label>
    </div>
  );
}
