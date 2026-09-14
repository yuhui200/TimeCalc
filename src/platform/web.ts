/**
 * Web（PWA）平台的基线实现。
 *
 * 这个文件同时是 Tauri / Capacitor 实现的**父类**：两者都跑在 WebView 里，
 * 浏览器 API 依然可用，只是可以额外接上原生能力。因此三个平台是
 * 「Web 基线 + 原生增强」的关系，而不是三份互不相干的代码。
 */
import { buildICS } from '../core/ics';
import type { CalendarEvent } from '../core/types';
import type {
  AppInfo,
  CalendarAdapter,
  CalendarEventInput,
  CapabilityResult,
  ClipboardAdapter,
  FileAdapter,
  NotificationAdapter,
  NotificationPermissionState,
  NotifyOptions,
  Platform,
  SaveFileOptions,
  ShortcutAdapter,
} from './types';
import { fail, ok, okVoid } from './types';

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 把 UI 的 CalendarEventInput 转成 core/ics 需要的 CalendarEvent */
export function toCoreEvent(event: CalendarEventInput): CalendarEvent {
  return {
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    reminderMinutes: event.reminderMinutes,
    location: event.location,
    uid: event.uid ?? makeUid(event),
  };
}

/** 稳定 UID：同标题同开始时间生成同一个，避免重复导入日历 */
export function makeUid(event: CalendarEventInput): string {
  const stamp = event.start.toISOString().replace(/[-:.]/g, '');
  const slug = event.title.replace(/\s+/g, '-').slice(0, 24);
  return `timecalc-${stamp}-${slug}@timecalc.local`;
}

/** 触发浏览器下载 */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立即 revoke 会让部分浏览器（Safari）来不及读取，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * 剪贴板兜底：execCommand('copy')。
 * 仅在非安全上下文（http://内网 IP）或旧 WebView 上才会走到这里，
 * 这些环境下 navigator.clipboard 是 undefined。
 */
export function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // 必须可见才能选中，但移出视口避免闪烁
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const done = document.execCommand('copy');
    ta.remove();
    return done;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 通知                                                                */
/* ------------------------------------------------------------------ */

export class WebNotificationAdapter implements NotificationAdapter {
  readonly supported: boolean;

  constructor() {
    this.supported = typeof window !== 'undefined' && 'Notification' in window;
  }

  async permission(): Promise<NotificationPermissionState> {
    if (!this.supported) return 'unsupported';
    return Notification.permission as NotificationPermissionState;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.supported) return 'unsupported';
    try {
      return (await Notification.requestPermission()) as NotificationPermissionState;
    } catch {
      return 'denied';
    }
  }

  async notify(options: NotifyOptions): Promise<CapabilityResult<void>> {
    if (!this.supported) return fail('unsupported', '当前环境不支持系统通知');
    if (Notification.permission !== 'granted') return fail('denied', '通知权限未授予');
    try {
      const n = new Notification(options.title, {
        body: options.body,
        tag: options.tag,
        silent: options.silent,
        // 路径必须是 public/ 下的真实文件名——写错了不会报错，
        // 只会让通知显示成空白图标，很难被发现。
        icon: '/icons/pwa-192x192.png',
        badge: '/icons/pwa-192x192.png',
      });
      if (options.route) {
        n.onclick = () => {
          window.focus();
          if (options.route) window.location.hash = options.route;
          n.close();
        };
      }
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(tag: string): Promise<void> {
    // 浏览器没有「按 tag 关闭」的 API；依靠新通知覆盖同 tag 的旧通知
    void tag;
  }
}

/* ------------------------------------------------------------------ */
/* 剪贴板                                                              */
/* ------------------------------------------------------------------ */

export class WebClipboardAdapter implements ClipboardAdapter {
  async writeText(text: string): Promise<CapabilityResult<void>> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return okVoid();
      } catch {
        // 安全上下文缺失或被策略拦截，往下走兜底
      }
    }
    if (legacyCopy(text)) return okVoid();
    return fail('failed', '复制失败，请手动选择文本');
  }

  async readText(): Promise<CapabilityResult<string>> {
    if (!navigator.clipboard?.readText) return fail('unsupported', '不支持读取剪贴板');
    try {
      return ok(await navigator.clipboard.readText());
    } catch {
      return fail('denied', '读取剪贴板被拒绝');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 文件                                                                */
/* ------------------------------------------------------------------ */

export class WebFileAdapter implements FileAdapter {
  async saveText(options: SaveFileOptions): Promise<CapabilityResult<string>> {
    try {
      downloadText(options.filename, options.content, options.mime);
      return ok(`已下载到本地：${options.filename}`);
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async shareText(options: { title?: string; text: string; url?: string }): Promise<CapabilityResult<void>> {
    if (navigator.share) {
      try {
        await navigator.share(options);
        return okVoid();
      } catch (error) {
        // 用户主动取消不算失败，但也不必提示成功。
        // 注意这里**不能**写成 `error instanceof Error && error.name === 'AbortError'`：
        // 分享面板抛出的是 DOMException，而它在部分旧 WebView 与 jsdom 里
        // 并不继承 Error，那样写会把「取消」误报成「失败」。
        if (isAbortError(error)) return okVoid();
        return fail('failed', errorMessage(error));
      }
    }
    // 没有 Web Share API 时降级为复制，由 UI 提示
    const copied = await new WebClipboardAdapter().writeText(options.text);
    if (copied.ok) return okVoid();
    return fail('unsupported', '当前环境不支持分享');
  }
}

/** 判定「用户取消」：只读 name，不依赖原型链 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** 从任意抛出物里尽力取出可读文案；拿不到就返回 undefined，由 UI 用兜底文案 */
function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* 日历                                                                */
/* ------------------------------------------------------------------ */

export class WebCalendarAdapter implements CalendarAdapter {
  /**
   * 浏览器能直接写系统日历的场景极少（需要已安装的 PWA + Chromium），
   * 因此这里恒为不支持，让 UI 走 .ics 导出这条路——而这条路 100% 可用。
   */
  readonly supported = false;

  async addEvent(event: CalendarEventInput): Promise<CapabilityResult<string>> {
    void event;
    return fail('unsupported', '浏览器无法直接写入系统日历，请导出 .ics 后手动导入');
  }

  async exportICS(events: CalendarEventInput[]): Promise<CapabilityResult<string>> {
    try {
      return ok(buildICS(events.map(toCoreEvent)));
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 快捷键                                                              */
/* ------------------------------------------------------------------ */

/**
 * Web 没有全局快捷键。这里注册的是**页内快捷键**（keydown 监听），
 * 由 UI 通过 useHotkeys 统一调度，此适配器只负责把
 * “需要全局能力”的请求诚实地拒掉。
 */
export class WebShortcutAdapter implements ShortcutAdapter {
  readonly global = false;

  // 参数与 ShortcutAdapter 接口保持一致（哪怕用不上）：
  // 签名收窄会让「通过具体类调用」的代码通不过类型检查，
  // 而调用方本来就不该关心自己拿到的是哪个实现。
  async register(accelerator: string, handler: () => void): Promise<CapabilityResult<void>> {
    void accelerator;
    void handler;
    return fail('unsupported', '浏览器不支持全局快捷键，已退化为页内快捷键');
  }

  async unregister(accelerator: string): Promise<void> {
    void accelerator;
  }

  async unregisterAll(): Promise<void> {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Platform 组装                                                       */
/* ------------------------------------------------------------------ */

export interface WebPlatformOptions {
  info: AppInfo;
  notification?: NotificationAdapter;
  clipboard?: ClipboardAdapter;
  file?: FileAdapter;
  calendar?: CalendarAdapter;
  shortcut?: ShortcutAdapter;
  init?: () => Promise<void>;
  dispose?: () => Promise<void>;
}

/** 用 Web 基线组装一个 Platform，子类平台只需替换需要增强的适配器 */
export function createWebPlatform(options: WebPlatformOptions): Platform {
  return {
    info: options.info,
    notification: options.notification ?? new WebNotificationAdapter(),
    clipboard: options.clipboard ?? new WebClipboardAdapter(),
    file: options.file ?? new WebFileAdapter(),
    calendar: options.calendar ?? new WebCalendarAdapter(),
    shortcut: options.shortcut ?? new WebShortcutAdapter(),
    init: options.init ?? (async () => {}),
    dispose: options.dispose ?? (async () => {}),
  };
}

/** 检测是否运行在 PWA 独立窗口 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone;
}
