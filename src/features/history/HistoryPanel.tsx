/**
 * 历史记录面板。
 *
 * 需求：「保留最近的计算历史」。
 *
 * 交互上只做三件事，但每件都有明确理由：
 *   - **点击条目 = 复制结果**，而不是「回填到面板」。历史最大的用途是
 *     「刚才那个数是多少」，直接复制比跳转再复制少两步。想回填有单独的按钮。
 *   - **收藏置顶**：常用的换算（如固定时区对）应当永远在第一屏。
 *   - **清空默认保留收藏**：一次误点「清空」不该毁掉用户攒下来的东西，
 *     想连收藏一起删得再点一次确认。
 *
 * IndexedDB 不可用（隐私模式）时列表为空，此时给的是**解释**而不是空白。
 */
import { useCallback, useMemo, useState } from 'react';
import { ALL_HISTORY_KINDS, HISTORY_KIND_META, type HistoryKind } from '../../db/types';
import { formatRelativeZh, truncate } from '../../core/format';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Dialog,
  EmptyState,
  TextField,
} from '../../components';
import { useHistory } from '../../hooks/useHistory';
import { useCopy } from '../../hooks/useCopy';
import { useNavigation } from '../../hooks/useNavigation';
import { useSettings } from '../../hooks/useSettings';

export function HistoryPanel() {
  const { settings } = useSettings();
  const { navigate } = useNavigation();
  const { copy } = useCopy();

  const [kind, setKind] = useState<HistoryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const { items, total, loading, remove, pin, clear } = useHistory({
    kind: kind === 'all' ? undefined : kind,
    query: query.trim() || undefined,
    limit: 200,
  });

  const filtered = kind !== 'all' || query.trim() !== '';

  /** 各分类的条数，用于在筛选芯片上提示「这个分类有没有内容」 */
  const kindCounts = useMemo(() => {
    const map = new Map<HistoryKind, number>();
    for (const item of items) map.set(item.kind, (map.get(item.kind) ?? 0) + 1);
    return map;
  }, [items]);

  const handleClear = useCallback(
    async (keepPinned: boolean) => {
      await clear(keepPinned);
      setConfirmClear(false);
    },
    [clear],
  );

  if (!settings.historyEnabled) {
    return (
      <Card flush>
        <EmptyState
          icon="🚫"
          title="历史记录已关闭"
          description="在设置里打开「记录计算历史」后，这里会保存你算过的内容。"
          action={
            <Button variant="primary" size="md" onClick={() => navigate('settings')}>
              去设置
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="历史记录"
        description={`共 ${total} 条${filtered ? `（当前筛选出 ${items.length} 条）` : ''}，最多保留 500 条`}
        actions={
          total > 0 ? (
            <Chip tone="danger" onClick={() => setConfirmClear(true)}>
              清空
            </Chip>
          ) : undefined
        }
      >
        <TextField
          label="搜索"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索输入或结果，如「纽约」「150」"
        />

        <div className="mt-3">
          <ChipRow label="按功能筛选">
            <Chip active={kind === 'all'} onClick={() => setKind('all')}>
              全部
            </Chip>
            {ALL_HISTORY_KINDS.map((id) => {
              const meta = HISTORY_KIND_META[id];
              const count = kindCounts.get(id) ?? 0;
              return (
                <Chip key={id} active={kind === id} onClick={() => setKind(id)}>
                  <span aria-hidden="true">{meta.icon}</span>
                  {meta.label}
                  {count > 0 ? <span className="tnum text-xs opacity-70">{count}</span> : null}
                </Chip>
              );
            })}
          </ChipRow>
        </div>
      </Card>

      {loading && items.length === 0 ? (
        <Card flush>
          <EmptyState icon="⏳" title="正在读取…" description="首次打开需要初始化本地数据库。" compact />
        </Card>
      ) : items.length === 0 ? (
        <Card flush>
          <EmptyState
            icon={filtered ? '🔍' : '🕘'}
            title={filtered ? '没有匹配的记录' : '还没有历史记录'}
            description={
              filtered
                ? '换个关键字，或把筛选切回「全部」。'
                : '在任意面板算一次，结果就会出现在这里。历史只保存在本机，不会上传。'
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setKind('all');
                    setQuery('');
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const meta = HISTORY_KIND_META[item.kind];
            const pinned = Boolean(item.pinned);
            return (
              <li
                key={item.id}
                className="rounded-card border border-line bg-surface px-4 py-3 sm:px-5"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
                    {meta.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted">{meta.label}</span>
                      {pinned ? <Badge tone="warn">已收藏</Badge> : null}
                      {item.uses && item.uses > 1 ? (
                        <Badge tone="default">用过 {item.uses} 次</Badge>
                      ) : null}
                      <span className="text-xs text-muted">{formatRelativeZh(item.createdAt)}</span>
                    </div>

                    <p className="mt-1 break-words text-sm text-ink">{truncate(item.input, 120)}</p>
                    <p className="tnum mt-0.5 break-words text-base font-semibold text-[var(--tc-accent)]">
                      {truncate(item.output, 120)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
                  <Chip onClick={() => void copy(item.output, { label: '结果' })}>复制结果</Chip>
                  <Chip onClick={() => navigate(item.kind)}>回到面板</Chip>
                  <Chip active={pinned} onClick={() => item.id != null && void pin(item.id)}>
                    {pinned ? '★ 已收藏' : '☆ 收藏'}
                  </Chip>
                  <Chip
                    tone="danger"
                    className="ml-auto"
                    onClick={() => item.id != null && void remove(item.id)}
                  >
                    删除
                  </Chip>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && items.length >= 200 ? (
        <p className="text-center text-xs text-muted">
          只显示最近 200 条；用搜索或筛选可以找到更早的记录。
        </p>
      ) : null}

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空历史记录"
        description="这个操作无法撤销。"
        size="sm"
      >
        <p className="text-sm leading-relaxed text-ink">
          默认只清空未收藏的记录（当前共 {total} 条）。已收藏的条目会保留下来。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" size="lg" block onClick={() => void handleClear(true)}>
            清空未收藏的
          </Button>
          <Button variant="danger" size="lg" block onClick={() => void handleClear(false)}>
            全部清空（含收藏）
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => setConfirmClear(false)}>
            取消
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
