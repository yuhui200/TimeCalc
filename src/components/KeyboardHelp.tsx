/**
 * 快捷键帮助面板（按 `?` 打开）。
 *
 * 需求要求「键盘快捷键」，但快捷键只有被用户知道才有价值。
 * 这个面板把当前平台**真正可用**的快捷键列出来——不可用的（如
 * 浏览器里的全局快捷键）不列，避免用户按了没反应。
 */
import { usePlatform } from '../hooks/usePlatform';
import { formatAccelerator } from '../hooks/useHotkeys';
import { Dialog } from './Dialog';

export interface ShortcutEntry {
  keys: string;
  description: string;
  /** 只在特定平台显示 */
  onlyWhen?: (info: { global: boolean; isMac: boolean }) => boolean;
}

/**
 * 应用级快捷键（不含功能切换）。
 *
 * 功能切换键位（mod+1…）**不在这里**：它们由 `features/registry.ts` 的
 * 面板定义决定，调用方通过 `panelShortcuts` 传进来。两处各写一份必然漂移。
 */
export const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: 'mod+k', description: '打开命令面板' },
  { keys: 'mod+shift+l', description: '切换亮色 / 暗色 / 跟随系统' },
  { keys: 'mod+shift+c', description: '切换高对比度模式' },
  { keys: 'mod+shift+x', description: '清空当前输入' },
  { keys: '?', description: '打开 / 关闭本帮助' },
  { keys: 'esc', description: '关闭弹窗 / 命令面板' },
];

export interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
  /** 功能面板的切换键，由调用方从面板注册表生成 */
  panelShortcuts?: readonly ShortcutEntry[];
}

export function KeyboardHelp({ open, onClose, panelShortcuts = [] }: KeyboardHelpProps) {
  const { info, shortcut } = usePlatform();
  const isMac = info.os === 'macos' || info.os === 'ios';

  // 顺序按使用频率：先通用操作，再功能跳转
  const all = [...SHORTCUTS.slice(0, 1), ...panelShortcuts, ...SHORTCUTS.slice(1)];

  const visible = all.filter(
    (entry) => !entry.onlyWhen || entry.onlyWhen({ global: shortcut.global, isMac }),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="键盘快捷键"
      description={
        shortcut.global
          ? '桌面端支持全局快捷键：应用在后台时也能唤起。'
          : '浏览器环境下快捷键仅在页面获得焦点时生效。'
      }
      size="md"
    >
      <ul className="divide-y divide-line">
        {visible.map((entry) => (
          <li key={entry.keys} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-ink">{entry.description}</span>
            <kbd className="shrink-0 rounded-md border border-line bg-[var(--tc-surface-2)] px-2 py-1 font-mono text-xs text-ink">
              {formatAccelerator(entry.keys, isMac)}
            </kbd>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-xs leading-snug text-muted">
        在输入框内，不带修饰键的快捷键（如 <kbd className="font-mono">?</kbd>）不会触发，
        以免影响正常打字；<kbd className="font-mono">{isMac ? '⌘' : 'Ctrl'}</kbd> 组合键仍然有效。
      </p>
    </Dialog>
  );
}
