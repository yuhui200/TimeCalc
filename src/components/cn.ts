import clsx, { type ClassValue } from 'clsx';

/**
 * 类名拼接。
 *
 * 直接用 clsx 而不是 tailwind-merge：我们的组件不打算允许外部
 * 覆盖内部的 Tailwind 类（那样会破坏设计系统的一致性），
 * 暴露 `className` 只是为了加布局类（margin、grid 位置）。
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
