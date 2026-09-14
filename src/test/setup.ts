/**
 * Vitest 全局测试环境准备。
 * 在 vite.config.ts 的 test.setupFiles 中注册。
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每个用例后卸载 React 树，避免 DOM 泄漏到下一个用例
afterEach(() => {
  cleanup();
});

// jsdom 未实现 matchMedia，主题 Hook 依赖它
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

// jsdom 未实现 ResizeObserver，命令面板/虚拟列表会用到
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom 没有布局引擎，`offsetParent` 恒为 null，`scrollIntoView` 干脆不存在。
// 而这两者恰恰是「可见性过滤」和「高亮项滚进视野」的依据：
//   - Dialog 的焦点陷阱用 `offsetParent !== null` 排除隐藏元素，
//     若恒为 null，焦点陷阱会退化成「只能停在一个元素上」；
//   - CommandPalette 用 scrollIntoView 跟随高亮项。
// 因此这里补上**行为等价**的实现，而不是把组件改成迁就测试环境。
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * 让 `offsetParent` 表现出「元素是否可见」的语义：
 * 自身或任一祖先带 `hidden` 属性 / `display:none` 时返回 null，
 * 否则返回父元素（浏览器返回的是最近的定位祖先，调用方只判断是否为 null，
 * 所以返回父元素足够，也不会因为 jsdom 没有 position 计算而出错）。
 */
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    if (this.hidden || this.style?.display === 'none') return null;
    let node: HTMLElement | null = this.parentElement;
    while (node) {
      if (node.hidden || node.style?.display === 'none') return null;
      node = node.parentElement;
    }
    return this.parentElement;
  },
});

// 稳定的时区基准：所有日期断言都按北京时间推断，避免 CI 机器时区不同导致失败
process.env.TZ = process.env.TZ ?? 'Asia/Shanghai';
