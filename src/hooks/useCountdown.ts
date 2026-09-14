/**
 * 倒计时的实时跳动与到点提醒。
 *
 * 两个关键实现决策：
 *
 * 1. **不用 `setInterval(1000)` 累加**。定时器会被节流（后台标签页降到
 *    1 次/分钟）、会被 GC 延迟，累加会产生肉眼可见的漂移。这里每次
 *    tick 都重新对 `Date.now()` 取整对齐到下一秒，误差不累积。
 *
 * 2. **到点提醒分两条路**：页面在前台时用页内 toast + 通知；页面可能被
 *    挂起时（移动端），提前把通知**排期**给系统，由操作系统按时弹出。
 *    这就是 platform.notification 存在的意义——Web 做不到排期。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { snapshot as takeSnapshot } from '../core/countdown';
import type { CountdownSnapshot } from '../core/types';
import { usePlatform } from './usePlatform';
import { useToast } from './useToast';

export interface UseCountdownOptions {
  target: Date | null;
  /** 是否启用（为 false 时不 tick，也不提醒） */
  enabled?: boolean;
  /** 到点时的标题，用于通知 */
  title?: string;
  /** 到点时是否发系统通知 */
  notifyOnFinish?: boolean;
  /** 到点时的回调（除提醒外还想做别的事，如写历史） */
  onFinish?: (snapshot: CountdownSnapshot) => void;
  /** 提醒的唯一标识，用于让同一条倒计时的通知互相覆盖 */
  tag?: string;
}

export interface UseCountdownResult {
  snapshot: CountdownSnapshot | null;
  /** 距离到点是否已触发过提醒（避免重复提醒） */
  fired: boolean;
  /** 手动重置提醒状态（如用户重新开始计时） */
  reset: () => void;
}

/** 距离下一个整秒还有多少毫秒，用于对齐 tick 边界 */
function msToNextSecond(now: number): number {
  return 1000 - (now % 1000);
}

export function useCountdown(options: UseCountdownOptions): UseCountdownResult {
  const {
    target,
    enabled = true,
    title = '倒计时结束',
    notifyOnFinish = true,
    onFinish,
    tag,
  } = options;

  const { notification } = usePlatform();
  const toast = useToast();

  const [snap, setSnap] = useState<CountdownSnapshot | null>(() =>
    target ? takeSnapshot(target) : null,
  );
  const [fired, setFired] = useState(false);

  // 用 ref 持有回调，避免把 onFinish 放进 effect 依赖导致定时器重启
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const targetMs = target ? target.getTime() : null;

  const reset = useCallback(() => setFired(false), []);

  // 目标变化时重置提醒状态并立即算一次，避免显示上一轮的数字
  useEffect(() => {
    setFired(false);
    setSnap(targetMs != null ? takeSnapshot(new Date(targetMs)) : null);
  }, [targetMs]);

  /* ---------------- 实时跳动 ---------------- */
  useEffect(() => {
    if (!enabled || targetMs == null) return;

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const now = Date.now();
      setSnap(takeSnapshot(new Date(targetMs), new Date(now)));

      if (now >= targetMs) {
        // 到点后不必再 tick
        return;
      }
      // 对齐到下一个整秒：既保证秒数变化及时，又不累积漂移
      timer = setTimeout(tick, msToNextSecond(now));
    };

    tick();
    return () => clearTimeout(timer);
  }, [enabled, targetMs]);

  /* ---------------- 后台/移动端的排期提醒 ---------------- */
  useEffect(() => {
    if (!enabled || !notifyOnFinish || targetMs == null) return;
    // 已经过期就不必排期
    if (targetMs <= Date.now()) return;

    const adapter = notification as typeof notification & {
      scheduleAt?: (o: { title: string; body?: string; at: Date; tag?: string }) => Promise<unknown>;
    };
    // 只有 Capacitor 实现了 scheduleAt；其它平台走下面的前台提醒
    if (typeof adapter.scheduleAt !== 'function') return;

    void adapter.scheduleAt({
      title,
      body: '时间到了',
      at: new Date(targetMs),
      tag: tag ?? `countdown-${targetMs}`,
    });
  }, [enabled, notifyOnFinish, targetMs, title, tag, notification]);

  /* ---------------- 到点时的前台提醒 ---------------- */
  useEffect(() => {
    if (!enabled || targetMs == null || fired) return;
    if (Date.now() < targetMs) return;

    setFired(true);

    const current = takeSnapshot(new Date(targetMs));
    if (current) onFinishRef.current?.(current);

    if (!notifyOnFinish) return;

    toast.success(`${title}：时间到了`, { duration: 6000 });
    void notification.notify({
      title,
      body: '倒计时已结束',
      tag: tag ?? `countdown-${targetMs}`,
    });
  }, [enabled, targetMs, fired, notifyOnFinish, title, tag, notification, toast]);

  return { snapshot: snap, fired, reset };
}

/**
 * 每秒返回当前时间戳，供「世界时钟」这类需要整页刷新的场景使用。
 * 与 useCountdown 的区别：它不关心某个目标，只是节拍器。
 */
export function useNow(enabled = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, intervalMs - (current % intervalMs));
    };
    tick();
    return () => clearTimeout(timer);
  }, [enabled, intervalMs]);

  return now;
}
