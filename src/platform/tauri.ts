/**
 * Tauri 2 平台实现：Web 基线 + 原生增强。
 *
 * 所有 `@tauri-apps/*` 都通过 **动态 import** 引入。原因有二：
 *   1. Web 构建不会把原生插件打进首屏 chunk（Vite 会自动代码分割）；
 *   2. 这些包在浏览器里 import 不会报错，但调用会失败——动态引入让
 *      「能力探测」和「能力调用」天然分离，测试里也更好 mock。
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
import { WebCalendarAdapter, createWebPlatform, downloadText, toCoreEvent } from './web';

/** 保存对话框的默认过滤器 */
const ICS_FILTER = [{ name: '日历文件', extensions: ['ics'] }];

/* ------------------------------------------------------------------ */
/* 通知（@tauri-apps/plugin-notification）                             */
/* ------------------------------------------------------------------ */

class TauriNotificationAdapter implements NotificationAdapter {
  readonly supported = true;

  async permission(): Promise<NotificationPermissionState> {
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      return (await isPermissionGranted()) ? 'granted' : 'default';
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        '@tauri-apps/plugin-notification'
      );
      if (await isPermissionGranted()) return 'granted';
      return (await requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  }

  async notify(options: NotifyOptions): Promise<CapabilityResult<void>> {
    try {
      const mod = await import('@tauri-apps/plugin-notification');
      if (!(await mod.isPermissionGranted())) {
        return fail('denied', '通知权限未授予');
      }
      // Tauri 的 sendNotification 接受字符串或 options 对象
      mod.sendNotification({
        title: options.title,
        body: options.body,
        // Tauri 用 id 而非 tag 做覆盖；把 tag 哈希成数字 id 以获得同样效果
        id: options.tag ? hashToInt(options.tag) : undefined,
        silent: options.silent,
      });
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(): Promise<void> {
    // Tauri 没有提供按 id 撤回已发通知的 API
  }
}

/** 把字符串 tag 稳定映射成 32 位正整数，供 Tauri 通知 id 使用 */
function hashToInt(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/* ------------------------------------------------------------------ */
/* 剪贴板（@tauri-apps/plugin-clipboard-manager）                      */
/* ------------------------------------------------------------------ */

class TauriClipboardAdapter implements ClipboardAdapter {
  async writeText(text: string): Promise<CapabilityResult<void>> {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async readText(): Promise<CapabilityResult<string>> {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return ok(await readText());
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 文件（@tauri-apps/plugin-dialog + plugin-fs）                       */
/* ------------------------------------------------------------------ */

class TauriFileAdapter implements FileAdapter {
  async saveText(options: {
    filename: string;
    content: string;
    mime?: string;
  }): Promise<CapabilityResult<string>> {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const path = await save({
        defaultPath: options.filename,
        filters: options.filename.endsWith('.ics') ? ICS_FILTER : undefined,
      });
      // 用户取消对话框返回 null，这不是错误
      if (!path) return fail('denied', '已取消保存');

      await writeTextFile(path, options.content);
      return ok(`已保存到 ${path}`);
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async shareText(options: {
    title?: string;
    text: string;
    url?: string;
  }): Promise<CapabilityResult<void>> {
    // 桌面端没有系统分享面板，用剪贴板代替是最贴近用户预期的行为
    const copied = await new TauriClipboardAdapter().writeText(
      options.url ? `${options.text}\n${options.url}` : options.text,
    );
    return copied.ok ? okVoid() : fail('unsupported', '当前平台没有系统分享面板');
  }
}

/* ------------------------------------------------------------------ */
/* 日历（Tauri 无原生日历插件 → 一律走 .ics 落盘）                       */
/* ------------------------------------------------------------------ */

class TauriCalendarAdapter extends WebCalendarAdapter {
  /**
   * Tauri 侧没有官方日历插件；不假装支持，而是把 .ics 直接写到用户
   * 选定路径，再由系统「用日历打开」。行为比伪造成功更可靠。
   */
  override async addEvent(event: CalendarEventInput): Promise<CapabilityResult<string>> {
    const ics = await this.exportICS([event]);
    if (!ics.ok) return ics;
    const saved = await new TauriFileAdapter().saveText({
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
/* 全局快捷键（@tauri-apps/plugin-global-shortcut）                     */
/* ------------------------------------------------------------------ */

class TauriShortcutAdapter implements ShortcutAdapter {
  readonly global = true;

  async register(accelerator: string, handler: () => void): Promise<CapabilityResult<void>> {
    try {
      const { register } = await import('@tauri-apps/plugin-global-shortcut');
      await register(accelerator, (event) => {
        // 插件在按下与松开时都会回调，只处理按下，否则会触发两次
        if (event.state === 'Pressed') handler();
      });
      return okVoid();
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : String(error));
    }
  }

  async unregister(accelerator: string): Promise<void> {
    try {
      const { unregister } = await import('@tauri-apps/plugin-global-shortcut');
      await unregister(accelerator);
    } catch {
      /* 未注册过时注销会失败，忽略 */
    }
  }

  async unregisterAll(): Promise<void> {
    try {
      const { unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
      await unregisterAll();
    } catch {
      /* no-op */
    }
  }
}

/* ------------------------------------------------------------------ */

function sanitizeFilename(name: string): string {
  // Windows 不允许 \ / : * ? " < > |，统一替换掉
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'event';
}

export function createTauriPlatform(info: AppInfo): Platform {
  return createWebPlatform({
    info,
    notification: new TauriNotificationAdapter(),
    clipboard: new TauriClipboardAdapter(),
    file: new TauriFileAdapter(),
    calendar: new TauriCalendarAdapter(),
    shortcut: new TauriShortcutAdapter(),
    init: async () => {
      // 桌面端不需要申请权限：通知权限在 tauri.conf.json 里静态声明，
      // 由系统在首次发送时弹窗，因此这里保持空实现即可。
    },
    dispose: async () => {
      await new TauriShortcutAdapter().unregisterAll();
    },
  });
}

/** 兜底导出：某些壳里原生 API 不可用时降级为浏览器下载 */
export function saveTextFallback(filename: string, content: string, mime?: string): void {
  downloadText(filename, content, mime);
}
