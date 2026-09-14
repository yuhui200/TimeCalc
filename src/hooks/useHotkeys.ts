/**
 * 键盘快捷键。
 *
 * 需求里的「键盘快捷键」有两个层次，这里都覆盖：
 *   1. **页内快捷键**（所有平台）：监听 document 的 keydown；
 *   2. **全局快捷键**（仅 Tauri/Capacitor）：交给 platform.shortcut，
 *      应用不在前台也能唤起——Web 做不到，UI 应据此隐藏对应开关。
 *
 * 实现要点：
 *   - 输入框（input/textarea/contenteditable）里按下时不触发**无修饰键**的
 *     快捷键，否则用户打字时按 `?` 或 `/` 会误触；
 *   - 但带 Ctrl/Cmd 的组合键在输入框里仍应生效（用户预期如此）；
 *   - 支持 `mod` 通配（macOS 的 Cmd / 其它平台的 Ctrl）。
 */
import { useEffect, useRef } from 'react';
import { usePlatform } from './usePlatform';

export interface HotkeyDefinition {
  /** 加速键，如 'mod+k'、'?'、'shift+alt+t' */
  keys: string;
  handler: (event: KeyboardEvent) => void;
  /** 在输入框内是否也生效，默认 false */
  allowInInput?: boolean;
  /** 是否 preventDefault，默认 true */
  preventDefault?: boolean;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 描述文案，用于快捷键帮助面板 */
  description?: string;
}

/** 把加速键字符串规范化成可比较的形态 */
function normalize(accelerator: string): string {
  return accelerator
    .toLowerCase()
    .replace(/\s+/g, '')
    .split('+')
    .map((part) => {
      // 常见别名归一
      if (part === 'cmd' || part === 'command' || part === 'meta') return 'mod';
      if (part === 'ctrl' || part === 'control') return 'mod';
      if (part === 'escape') return 'esc';
      if (part === 'space' || part === 'spacebar') return ' ';
      return part;
    })
    // 修饰键顺序无关，排序后比较
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .join('+');
}

const ORDER = ['mod', 'alt', 'shift', ' ', 'esc'];

/** 把 KeyboardEvent 转成同样的规范形态 */
function eventKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  // macOS 的 metaKey 与其它平台的 ctrlKey 统一成 'mod'
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  let key = event.key.toLowerCase();
  if (key === 'escape') key = 'esc';
  if (key === ' ') key = ' ';
  // 修饰键自身不参与匹配
  if (['meta', 'control', 'alt', 'shift'].includes(key)) return '';

  parts.push(key);
  return parts.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('+');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/** 判断一个加速键是否包含修饰键（用于决定输入框内是否放行） */
export function hasModifier(accelerator: string): boolean {
  const normalized = normalize(accelerator);
  return normalized.includes('mod') || normalized.includes('alt');
}

/**
 * 注册一组页内快捷键。
 *
 * handlers 用 ref 持有，这样调用方不必为了拿到最新的闭包而 memo 化数组，
 * 也不会因为每次渲染新建数组导致反复解绑/绑定。
 */
export function useHotkeys(definitions: HotkeyDefinition[]): void {
  const ref = useRef(definitions);
  ref.current = definitions;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const pressed = eventKey(event);
      if (!pressed) return;

      const editable = isEditableTarget(event.target);

      for (const def of ref.current) {
        if (def.enabled === false) continue;
        if (normalize(def.keys) !== pressed) continue;

        // 输入框内默认只放行带修饰键的组合
        const allowed = def.allowInInput ?? hasModifier(def.keys);
        if (editable && !allowed) continue;

        if (def.preventDefault !== false) event.preventDefault();
        def.handler(event);
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * 注册**全局**快捷键（应用在后台也能触发）。
 * 平台不支持时静默失败，返回 false 让 UI 提示原因。
 */
export function useGlobalHotkeys(
  definitions: Array<{ accelerator: string; handler: () => void; enabled?: boolean }>,
): void {
  const { shortcut } = usePlatform();
  const ref = useRef(definitions);
  ref.current = definitions;

  useEffect(() => {
    if (!shortcut.global) return;

    const registered: string[] = [];
    let cancelled = false;

    void (async () => {
      for (const def of ref.current) {
        if (def.enabled === false) continue;
        const result = await shortcut.register(def.accelerator, () => {
          // 从 ref 重新取，保证拿到最新的 handler
          const current = ref.current.find((d) => d.accelerator === def.accelerator);
          current?.handler();
        });
        if (result.ok) registered.push(def.accelerator);
      }
      if (cancelled) {
        // 注册过程中组件已卸载，立刻注销，避免快捷键泄漏到下次挂载
        for (const acc of registered) await shortcut.unregister(acc);
      }
    })();

    return () => {
      cancelled = true;
      for (const acc of registered) void shortcut.unregister(acc);
    };
  }, [shortcut]);
}

/** 供快捷键帮助面板展示：把 'mod+k' 渲染成 'Ctrl + K' / '⌘ K' */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const parts = accelerator.toLowerCase().split('+');
  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (trimmed === 'alt') return isMac ? '⌥' : 'Alt';
      if (trimmed === 'shift') return isMac ? '⇧' : 'Shift';
      if (trimmed === 'esc') return 'Esc';
      if (trimmed === 'enter') return 'Enter';
      if (trimmed === ' ') return 'Space';
      return trimmed.toUpperCase();
    })
    .join(isMac ? ' ' : ' + ');
}
