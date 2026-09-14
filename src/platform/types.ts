/**
 * 平台适配层的统一契约。
 *
 * 铁律：**UI 里不允许出现任何平台判断**。
 * 所有 `if (isTauri)` / `if (Capacitor)` 都必须收敛在本目录下，
 * UI 只依赖这里定义的接口，由 `createPlatform()` 在启动时挑选实现。
 *
 * 每个能力都返回 `Promise<CapabilityResult>`，而不是抛异常：
 * 平台能力缺失（如浏览器没有日历写入权限）是**正常情况**而非错误，
 * UI 需要据此展示「降级方案」（例如把 .ics 下载下来让用户手动导入）。
 */

/** 当前运行的目标平台 */
export type PlatformTarget = 'web' | 'tauri' | 'capacitor';

/** 更细的运行时环境描述，用于 UI 做文案微调（不用于分支逻辑） */
export type PlatformOs = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

/**
 * 能力调用结果。
 *
 * `reason` 使用稳定枚举而非自由文案，方便 UI 决定展示什么：
 *   - 'unsupported'：该平台根本没有这个能力（如 PWA 无法注册全局快捷键）
 *   - 'denied'：用户或系统拒绝（如通知权限被拒）
 *   - 'failed'：能力存在但执行失败（如剪贴板被浏览器策略拦截）
 */
export type CapabilityFailureReason = 'unsupported' | 'denied' | 'failed';

export type CapabilityResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: CapabilityFailureReason; message?: string };

export function ok<T>(value: T): CapabilityResult<T> {
  return { ok: true, value };
}

export function okVoid(): CapabilityResult<void> {
  return { ok: true, value: undefined };
}

export function fail<T = void>(
  reason: CapabilityFailureReason,
  message?: string,
): CapabilityResult<T> {
  return { ok: false, reason, message };
}

/* ------------------------------------------------------------------ */
/* 通知                                                                */
/* ------------------------------------------------------------------ */

export interface NotifyOptions {
  title: string;
  body?: string;
  /** 同一 tag 的通知会互相替换，避免倒计时重复提醒堆叠 */
  tag?: string;
  /** 点击通知后要聚焦到的路由，如 '#/countdown' */
  route?: string;
  silent?: boolean;
}

export interface NotificationAdapter {
  /** 能力是否可用（不含权限状态） */
  readonly supported: boolean;
  /** 'granted' | 'denied' | 'prompt'；不支持时恒为 'denied' */
  permission(): Promise<NotificationPermissionState>;
  /** 请求权限，返回请求后的状态 */
  requestPermission(): Promise<NotificationPermissionState>;
  /** 发送通知；未授权时返回 denied，由调用方决定是否改为页内提示 */
  notify(options: NotifyOptions): Promise<CapabilityResult<void>>;
  /** 取消某个 tag 的通知（倒计时被删除时调用） */
  cancel(tag: string): Promise<void>;
}

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/* ------------------------------------------------------------------ */
/* 剪贴板                                                              */
/* ------------------------------------------------------------------ */

export interface ClipboardAdapter {
  /**
   * 写入纯文本。
   * 浏览器在非安全上下文 / 非用户手势时会失败，因此实现里必须带
   * `document.execCommand('copy')` 的兜底，否则 http 内网部署会整体失效。
   */
  writeText(text: string): Promise<CapabilityResult<void>>;
  readText(): Promise<CapabilityResult<string>>;
}

/* ------------------------------------------------------------------ */
/* 文件                                                                */
/* ------------------------------------------------------------------ */

export interface SaveFileOptions {
  /** 建议的文件名，含扩展名，如 'result.txt' */
  filename: string;
  /** 文本内容 */
  content: string;
  /** MIME 类型，如 'text/calendar' */
  mime?: string;
}

export interface FileAdapter {
  /**
   * 保存/导出文本文件。
   *   web      -> 触发 <a download>
   *   tauri    -> 弹原生保存对话框写入磁盘
   *   capacitor-> 写入 Documents 目录并调用系统分享
   * 返回 `value` 为落地位置的可读描述（用于 toast 文案）。
   */
  saveText(options: SaveFileOptions): Promise<CapabilityResult<string>>;

  /** 分享文本（无文件），如把结果分享到聊天软件 */
  shareText(options: { title?: string; text: string; url?: string }): Promise<CapabilityResult<void>>;
}

/* ------------------------------------------------------------------ */
/* 日历                                                                */
/* ------------------------------------------------------------------ */

export interface CalendarEventInput {
  title: string;
  description?: string;
  /** 开始时刻（绝对时间） */
  start: Date;
  end: Date;
  /** 全天事件：只取日期部分 */
  allDay?: boolean;
  /** 提前多少分钟提醒；0 表示不提醒 */
  reminderMinutes?: number;
  /** 地点 */
  location?: string;
  /** 稳定 UID，用于重复写入时去重（同 UID 视为同一事件） */
  uid?: string;
}

export interface CalendarAdapter {
  readonly supported: boolean;
  /**
   * 直接写入系统日历。
   * 绝大多数浏览器**不支持**（只有部分 Chromium 系配合已安装的 PWA 才行），
   * 因此这里的失败是常态，UI 应当无缝降级为导出 .ics。
   */
  addEvent(event: CalendarEventInput): Promise<CapabilityResult<string>>;
  /** 生成 .ics 文本（本能力永远可用，作为日历写入的降级方案） */
  exportICS(events: CalendarEventInput[]): Promise<CapabilityResult<string>>;
}

/* ------------------------------------------------------------------ */
/* 全局快捷键                                                          */
/* ------------------------------------------------------------------ */

export interface ShortcutAdapter {
  /**
   * 是否支持**全局**（应用不在前台也能触发）快捷键。
   * 仅 Tauri / Capacitor 可能为 true；Web 下 UI 应退化为「页内快捷键」。
   */
  readonly global: boolean;
  /** 注册全局快捷键，如 'CommandOrControl+Shift+T' */
  register(accelerator: string, handler: () => void): Promise<CapabilityResult<void>>;
  unregister(accelerator: string): Promise<void>;
  unregisterAll(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* 应用信息                                                            */
/* ------------------------------------------------------------------ */

export interface AppInfo {
  target: PlatformTarget;
  os: PlatformOs;
  /** 应用版本，来自编译期注入的 __APP_VERSION__ */
  version: string;
  /** 该平台是否支持「安装到主屏幕 / 桌面」 */
  installable: boolean;
  /** 是否运行在 PWA 独立窗口中 */
  standalone: boolean;
  /** 平台可读名，仅用于「关于」页展示 */
  label: string;
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

export interface Platform {
  readonly info: AppInfo;
  readonly notification: NotificationAdapter;
  readonly clipboard: ClipboardAdapter;
  readonly file: FileAdapter;
  readonly calendar: CalendarAdapter;
  readonly shortcut: ShortcutAdapter;
  /**
   * 平台初始化钩子：请求权限、注册快捷键、恢复设置。
   * 在 React 挂载**之前** await，保证组件首次渲染时能力状态已确定。
   */
  init(): Promise<void>;
  /** 平台销毁钩子：注销快捷键、断开监听 */
  dispose(): Promise<void>;
}
