/**
 * Capacitor 平台实现（iOS / Android）。
 *
 * 与 Tauri 同样的策略：动态 import 各插件，Web 构建不背原生包体积。
 * 与 Tauri 的差异集中在两点：
 *   1. 通知是**本地通知**（可预排在未来某个时刻触发，倒计时到点即响）；
 *   2. 导出文件后走**系统分享面板**，这是移动端最自然的「保存」动作。
 */
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
  ShortcutAdapter,
} from './types';
import { fail, ok, okVoid } from './types';
import { WebCalendarAdapter, createWebPlatform, toCoreEvent } from './web';

/* ------------------------------------------------------------------ */
/* 通知（@capacitor/local-notifications）                              */
/* ------------------------------------------------------------------ */

class CapacitorNotificationAdapter implements NotificationAdapter {
  readonly supported = true;

  async permission(): Promise<NotificationPermissionState> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { display } = await LocalNotifications.checkPermissions();
      return mapPermission(display);
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { display } = await LocalNotifications.requestPermissions();
      return mapPermission(display);
    } catch {
      return 'unsupported';
    }
  }

  async notify(options: NotifyOptions): Promise<CapabilityResult<void>> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const granted = await this.permission();
      if (granted !== 'granted') return fail('denied', '通知权限未授予');

      await LocalNotifications.schedule({
        notifications: [
          {
            // Android 的通知 id 必须是 32 位整数，用 tag 哈希保证同一倒计时覆盖同一条
            id: options.tag ? hashToInt(options.tag) : Math.floor(Math.random() * 2_147_483_647),
            title: options.title,
            body: options.body ?? '',
            silent: options.silent,
            extra: { route: options.route },
          },
        ],
      });
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(tag: string): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: hashToInt(tag) }] });
    } catch {
      /* 未排期过则取消失败，忽略 */
    }
  }

  /**
   * 把通知排到未来某个绝对时刻。
   * 这是移动端相对 Web 的关键增益：应用被切到后台甚至杀掉后，
   * 倒计时提醒依然会由系统按时弹出。
   */
  async scheduleAt(
    options: NotifyOptions & { at: Date },
  ): Promise<CapabilityResult<void>> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const granted = await this.permission();
      if (granted !== 'granted') return fail('denied', '通知权限未授予');

      await LocalNotifications.schedule({
        notifications: [
          {
            id: options.tag ? hashToInt(options.tag) : Math.floor(Math.random() * 2_147_483_647),
            title: options.title,
            body: options.body ?? '',
            schedule: { at: options.at, allowWhileIdle: true },
            extra: { route: options.route },
          },
        ],
      });
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

function mapPermission(state: string): NotificationPermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'default';
}

function hashToInt(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  // Android 要求正整数且落在 int32 范围内
  return Math.abs(hash) % 2_147_483_647 || 1;
}

/* ------------------------------------------------------------------ */
/* 剪贴板（@capacitor/clipboard）                                      */
/* ------------------------------------------------------------------ */

class CapacitorClipboardAdapter implements ClipboardAdapter {
  async writeText(text: string): Promise<CapabilityResult<void>> {
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async readText(): Promise<CapabilityResult<string>> {
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      const { value } = await Clipboard.read();
      return ok(value ?? '');
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 文件（@capacitor/filesystem + @capacitor/share）                    */
/* ------------------------------------------------------------------ */

class CapacitorFileAdapter implements FileAdapter {
  async saveText(options: {
    filename: string;
    content: string;
    mime?: string;
  }): Promise<CapabilityResult<string>> {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      // 移动端「保存」的标准动作是：写进沙盒 → 弹分享面板让用户决定去向
      const result = await Filesystem.writeFile({
        path: options.filename,
        data: options.content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: options.filename,
          url: result.uri,
        });
        return ok('已通过分享面板导出');
      }
      // 不能分享时至少告诉用户文件在哪
      return ok(`已保存到应用缓存目录：${result.uri}`);
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async shareText(options: {
    title?: string;
    text: string;
    url?: string;
  }): Promise<CapabilityResult<void>> {
    try {
      const { Share } = await import('@capacitor/share');
      if (!(await Share.canShare()).value) {
        return fail('unsupported', '当前设备没有可用的分享目标');
      }
      await Share.share(options);
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 日历                                                                */
/* ------------------------------------------------------------------ */

class CapacitorCalendarAdapter extends WebCalendarAdapter {
  /**
   * Capacitor 官方没有日历插件。走「写 .ics → 系统分享 → 用日历打开」
   * 这条路径，在 iOS/Android 上都能落到系统日历，且不需要额外原生权限。
   */
  override async addEvent(event: CalendarEventInput): Promise<CapabilityResult<string>> {
    const ics = await this.exportICS([event]);
    if (!ics.ok) return ics;
    const saved = await new CapacitorFileAdapter().saveText({
      filename: `${sanitizeFilename(event.title)}.ics`,
      content: ics.value,
      mime: 'text/calendar',
    });
    return saved.ok ? ok(saved.value) : fail(saved.reason, saved.message);
  }

  override async exportICS(events: CalendarEventInput[]): Promise<CapabilityResult<string>> {
    try {
      const { buildICS } = await import('../core/ics');
      return ok(buildICS(events.map(toCoreEvent)));
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 快捷键                                                              */
/* ------------------------------------------------------------------ */

class CapacitorShortcutAdapter implements ShortcutAdapter {
  /**
   * 移动端没有全局快捷键的概念（音量键、Home 键都不该被应用劫持）。
   * 诚实返回 false，让 UI 隐藏相关设置项，而不是给一个点了没反应的开关。
   */
  readonly global = false;

  async register(): Promise<CapabilityResult<void>> {
    return fail('unsupported', '移动端不支持全局快捷键');
  }

  async unregister(): Promise<void> {
    /* no-op */
  }

  async unregisterAll(): Promise<void> {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */

function sanitizeFilename(name: string): string {
  // iOS/Android 均不允许路径分隔符
  return name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 60) || 'event';
}

export function createCapacitorPlatform(info: AppInfo): Platform {
  return createWebPlatform({
    info,
    notification: new CapacitorNotificationAdapter(),
    clipboard: new CapacitorClipboardAdapter(),
    file: new CapacitorFileAdapter(),
    calendar: new CapacitorCalendarAdapter(),
    shortcut: new CapacitorShortcutAdapter(),
    init: async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        // 状态栏跟随主题：这里只做「不刺眼」的默认值，
        // 真正的深浅切换由 useTheme 在主题变化时再调一次
        await StatusBar.setStyle({ style: Style.Default });
      } catch {
        /* 桌面浏览器或未安装插件时忽略 */
      }
    },
    dispose: async () => {
      /* 无需清理 */
    },
  });
}

/** 轻触反馈：移动端点击大按钮时调用，桌面端静默忽略 */
export async function tapFeedback(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* 非 Capacitor 环境，忽略 */
  }
}

/** 读取原生存储（比 localStorage 更持久，卸载重装后仍在） */
export async function nativeGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}

export async function nativeSet(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  } catch {
    /* no-op */
  }
}
