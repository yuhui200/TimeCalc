/**
 * 命令面板（桌面端 Ctrl/⌘+K）。
 *
 * 这是「桌面端多列 + 快速切换」需求的核心：不用鼠标找标签页，
 * 敲几个字就能跳到任意功能，还能直接执行操作（切主题、清历史）。
 *
 * 交互细节：
 *   - 上下键移动，Enter 执行，Esc 关闭（由 Dialog 负责）；
 *   - 悬停也会更新高亮项，鼠标与键盘不打架；
 *   - 高亮项滚动进视野（scrollIntoView block:'nearest'），长列表不会「丢失光标」；
 *   - 输入框用 combobox 语义，屏幕阅读器能播报「第 3 项，共 12 项」。
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Dialog } from './Dialog';

export interface Command {
  id: string;
  title: string;
  /** 次要说明，如「切换到日期差面板」 */
  subtitle?: string;
  /** 左侧图标（emoji） */
  icon?: ReactNode;
  /** 额外搜索关键字，如英文名、拼音首字母 */
  keywords?: string[];
  /** 分组标题，用于视觉分区 */
  group?: string;
  /** 右侧展示的快捷键提示 */
  shortcut?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  /** 输入框占位文案 */
  placeholder?: string;
  /** 空结果时的提示 */
  emptyText?: string;
}

export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = '输入命令或功能名…',
  emptyText = '没有匹配的命令',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  // 每次打开都重置，避免上次的搜索词残留
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // 结果集变化时把高亮拉回第一项
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 高亮项滚进视野
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results.length]);

  const runCommand = (command: Command) => {
    onClose();
    // 让对话框先关闭再执行命令：命令可能触发导航或弹窗，
    // 若先执行会被紧接着的关闭动作打断（如焦点归还覆盖新焦点）
    window.setTimeout(() => command.run(), 0);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) runCommand(command);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
    }
  };

  // 分组渲染：保持 commands 的原始顺序，只在分组边界插入标题
  const grouped = useMemo(() => groupResults(results), [results]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="命令面板"
      size="md"
      className="p-0"
    >
      <div className="-m-4 sm:-m-5">
        <div className="border-b border-line p-3">
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[activeIndex] ? `${listId}-${results[activeIndex]!.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 命令面板打开即输入是核心交互
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-label="搜索命令"
            className="w-full rounded-lg border-2 border-[var(--tc-line)] bg-[var(--tc-surface-2)] px-3 py-2.5 text-base text-ink placeholder:text-muted focus:border-[var(--tc-accent)] focus:bg-[var(--tc-surface)] focus:outline-none"
          />
        </div>

        {results.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{emptyText}</p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="命令列表"
            className="max-h-[50vh] overflow-y-auto p-2"
          >
            {grouped.map((entry) =>
              entry.type === 'group' ? (
                <li
                  key={`group-${entry.label}`}
                  role="presentation"
                  className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {entry.label}
                </li>
              ) : (
                <li
                  key={entry.command.id}
                  id={`${listId}-${entry.command.id}`}
                  role="option"
                  aria-selected={entry.index === activeIndex}
                  onMouseEnter={() => setActiveIndex(entry.index)}
                  onClick={() => runCommand(entry.command)}
                  className={cn(
                    'flex min-h-tap cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                    entry.index === activeIndex
                      ? 'bg-[var(--tc-accent-soft)] text-[var(--tc-ink)]'
                      : 'text-ink hover:bg-[var(--tc-surface-2)]',
                  )}
                >
                  {entry.command.icon ? (
                    <span aria-hidden="true" className="shrink-0 text-base">
                      {entry.command.icon}
                    </span>
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {entry.command.title}
                    </span>
                    {entry.command.subtitle ? (
                      <span className="block truncate text-xs text-muted">
                        {entry.command.subtitle}
                      </span>
                    ) : null}
                  </span>

                  {entry.command.shortcut ? (
                    <kbd className="shrink-0 rounded border border-line bg-[var(--tc-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {entry.command.shortcut}
                    </kbd>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-2 text-xs text-muted">
          <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          <span className="tnum">{results.length} 项</span>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 模糊匹配                                                            */
/* ------------------------------------------------------------------ */

/**
 * 轻量模糊匹配。
 *
 * 不引 fuse.js：命令总量在几十条量级，一个「子序列 + 前缀加权」的
 * 评分函数就够用，而且能精确控制中文的匹配行为（中文没有词边界，
 * fuse 的分词对中文几乎无效）。
 *
 * 评分规则（分越高越靠前）：
 *   +100 标题以查询开头
 *   +60  标题包含查询
 *   +40  关键字命中
 *   +20  副标题命中
 *   子序列匹配时按命中位置的紧凑程度加分
 */
export function scoreCommand(command: Command, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const title = command.title.toLowerCase();
  let score = 0;

  if (title.startsWith(q)) score += 100;
  else if (title.includes(q)) score += 60;
  else if (subsequence(title, q)) score += 20;

  for (const keyword of command.keywords ?? []) {
    const k = keyword.toLowerCase();
    if (k.startsWith(q)) score += 40;
    else if (k.includes(q)) score += 25;
  }

  if (command.subtitle?.toLowerCase().includes(q)) score += 20;
  if (command.group?.toLowerCase().includes(q)) score += 10;

  return score;
}

/** 判断 q 是否为 text 的子序列（如 'rq' 匹配 'date-range'） */
function subsequence(text: string, q: string): boolean {
  let i = 0;
  for (const char of text) {
    if (char === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return i === q.length;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim();
  if (!q) return commands;

  return commands
    .map((command) => ({ command, score: scoreCommand(command, q) }))
    // 分数为 1 表示只命中了「无查询」的默认分，视为不匹配
    .filter((entry) => entry.score > 1)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

type GroupEntry =
  | { type: 'group'; label: string }
  | { type: 'item'; command: Command; index: number };

/** 按 group 字段切分，同时记录每项在**扁平结果数组**里的下标（供高亮比对） */
function groupResults(results: Command[]): GroupEntry[] {
  const out: GroupEntry[] = [];
  let lastGroup: string | undefined;

  results.forEach((command, index) => {
    if (command.group && command.group !== lastGroup) {
      out.push({ type: 'group', label: command.group });
      lastGroup = command.group;
    }
    out.push({ type: 'item', command, index });
  });

  return out;
}
