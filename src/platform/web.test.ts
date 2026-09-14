/**
 * Web 平台适配器测试。
 *
 * Web 实现是三个平台的**共同基线**（Tauri / Capacitor 都继承它、只替换
 * 需要增强的适配器），所以它出错的爆炸半径最大。这里重点验证两件事：
 *   1. 能力缺失时必须返回 `unsupported` 而不是抛异常或假装成功；
 *   2. 剪贴板必须有 execCommand 兜底——否则 http 内网部署会整体失效。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WebCalendarAdapter,
  WebClipboardAdapter,
  WebFileAdapter,
  WebNotificationAdapter,
  WebShortcutAdapter,
  createWebPlatform,
  downloadText,
  isStandalone,
  legacyCopy,
  makeUid,
  toCoreEvent,
} from './web';
import type { AppInfo, CalendarEventInput } from './types';

const APP_INFO: AppInfo = {
  target: 'web',
  os: 'windows',
  version: '0.1.0',
  installable: true,
  standalone: false,
  label: 'TimeCalc Web',
};

function makeEvent(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return {
    title: '站会',
    start: new Date('2026-03-02T01:30:00.000Z'),
    end: new Date('2026-03-02T02:00:00.000Z'),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */

describe('toCoreEvent / makeUid', () => {
  it('缺少 uid 时按「开始时刻 + 标题」生成稳定 uid', () => {
    const event = makeEvent();
    expect(toCoreEvent(event).uid).toBe(makeUid(event));
  });

  it('同一事件的 uid 可复现——重复导出不会在日历里产生重复项', () => {
    // 两次构造完全独立的对象，但字段相同
    expect(makeUid(makeEvent())).toBe(makeUid(makeEvent()));
  });

  it('开始时刻不同则 uid 不同', () => {
    const a = makeUid(makeEvent({ start: new Date('2026-03-02T01:30:00.000Z') }));
    const b = makeUid(makeEvent({ start: new Date('2026-03-02T02:30:00.000Z') }));
    expect(a).not.toBe(b);
  });

  it('调用方显式传入的 uid 优先，不被覆盖', () => {
    const event = makeEvent({ uid: 'my-fixed-uid' });
    expect(toCoreEvent(event).uid).toBe('my-fixed-uid');
  });

  it('标题里的空格被压成连字符，uid 里不出现裸空格', () => {
    const uid = makeUid(makeEvent({ title: '周会 与 复盘' }));
    expect(uid).not.toContain(' ');
  });

  it('超长标题被截断，避免 uid 无限膨胀', () => {
    const uid = makeUid(makeEvent({ title: 'x'.repeat(200) }));
    // timecalc- + 时间戳 + - + 最多 24 个标题字符 + @timecalc.local
    expect(uid.length).toBeLessThan(100);
  });
});

/* ------------------------------------------------------------------ */

describe('downloadText', () => {
  it('创建一个带 download 属性的链接触发下载，并在之后清理节点', () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const originalCreate = document.createElement.bind(document);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreate(tag, options);
        if (tag === 'a') (el as HTMLAnchorElement).click = click;
        return el;
      });

    downloadText('result.txt', 'hello', 'text/plain');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    // 下载完必须把临时节点移出 DOM，否则反复导出会堆积
    expect(document.querySelector('a[download]')).toBeNull();
    // revoke 刻意延后：立即释放会让 Safari 来不及读取 blob。
    // 因此这里断言「此刻还没释放」——把它改成同步 revoke 会当场失败。
    expect(revokeObjectURL).not.toHaveBeenCalled();
    createElement.mockRestore();
  });

  it('MIME 类型会被带上 charset，中文内容才不会乱码', () => {
    let captured: Blob | null = null;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        captured = blob;
        return 'blob:mock';
      },
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadText('a.txt', '中文', 'text/plain');

    expect(captured).not.toBeNull();
    expect((captured as unknown as Blob).type).toBe('text/plain;charset=utf-8');
  });
});

/* ------------------------------------------------------------------ */

describe('legacyCopy', () => {
  it('走 execCommand("copy") 并返回其结果', () => {
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { writable: true, configurable: true, value: exec });

    expect(legacyCopy('要复制的文本')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    // 临时 textarea 必须清理干净
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('execCommand 返回 false 时如实返回 false（由调用方决定怎么提示）', () => {
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: vi.fn(() => false),
    });
    expect(legacyCopy('x')).toBe(false);
  });

  it('execCommand 不存在（旧 WebView）时不抛错，返回 false', () => {
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    expect(() => legacyCopy('x')).not.toThrow();
    expect(legacyCopy('x')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('WebClipboardAdapter', () => {
  it('优先使用异步剪贴板 API', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText },
    });

    const result = await new WebClipboardAdapter().writeText('hi');
    expect(result.ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('异步 API 被策略拒绝时回退到 execCommand 兜底', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new DOMException('NotAllowedError');
        }),
      },
    });
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: vi.fn(() => true),
    });

    const result = await new WebClipboardAdapter().writeText('hi');
    expect(result.ok).toBe(true);
  });

  it('非安全上下文（navigator.clipboard 不存在）走 execCommand', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: vi.fn(() => true),
    });

    expect((await new WebClipboardAdapter().writeText('hi')).ok).toBe(true);
  });

  it('两条路都失败时返回 failed，并给出可操作的文案', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: vi.fn(() => false),
    });

    const result = await new WebClipboardAdapter().writeText('hi');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('failed');
      expect(result.message).toBeTruthy();
    }
  });

  it('读取剪贴板不可用时返回 unsupported（能力缺失不是错误）', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const result = await new WebClipboardAdapter().readText();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported');
  });

  it('读取被拒绝时返回 denied，与「不支持」区分开', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: {
        readText: vi.fn(async () => {
          throw new DOMException('NotAllowedError');
        }),
      },
    });
    const result = await new WebClipboardAdapter().readText();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('denied');
  });
});

/* ------------------------------------------------------------------ */

describe('WebNotificationAdapter', () => {
  it('环境没有 Notification 时 supported 为 false，且通知返回 unsupported', async () => {
    // 适配器构造函数用 `'Notification' in window` 判断，所以必须真正
    // 删除属性——vi.stubGlobal 成 undefined 后 `in` 仍为 true。
    const original = Object.getOwnPropertyDescriptor(window, 'Notification');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 删除宿主全局属性
    delete (window as any).Notification;

    try {
      const adapter = new WebNotificationAdapter();

      expect(adapter.supported).toBe(false);
      expect(await adapter.permission()).toBe('unsupported');
      expect(await adapter.requestPermission()).toBe('unsupported');

      const result = await adapter.notify({ title: '倒计时结束' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('unsupported');
    } finally {
      if (original) Object.defineProperty(window, 'Notification', original);
    }
  });

  it('权限未授予时返回 denied，而不是静默失败', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default' }));
    const result = await new WebNotificationAdapter().notify({ title: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('denied');
  });

  it('权限已授予时发送通知，并把 tag/silent 透传给浏览器', async () => {
    const Ctor = vi.fn();
    Object.assign(Ctor, { permission: 'granted' });
    vi.stubGlobal('Notification', Ctor);

    const result = await new WebNotificationAdapter().notify({
      title: '倒计时结束',
      body: '该开会了',
      tag: 'timecalc-countdown',
      silent: true,
    });

    expect(result.ok).toBe(true);
    expect(Ctor).toHaveBeenCalledWith(
      '倒计时结束',
      expect.objectContaining({ body: '该开会了', tag: 'timecalc-countdown', silent: true }),
    );
  });

  it('图标路径指向 public/ 下真实存在的文件（写错只会静默变成空白图标）', async () => {
    const Ctor = vi.fn();
    Object.assign(Ctor, { permission: 'granted' });
    vi.stubGlobal('Notification', Ctor);

    await new WebNotificationAdapter().notify({ title: 'x' });

    const options = Ctor.mock.calls[0]![1] as { icon: string; badge: string };
    // 这几个文件名来自 `npm run icons`（pwa-assets-generator minimal-2023）的实际产物
    expect(options.icon).toBe('/icons/pwa-192x192.png');
    expect(options.badge).toBe('/icons/pwa-192x192.png');
  });

  it('cancel 是空操作但不会抛错（浏览器没有按 tag 关闭通知的 API）', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
    await expect(new WebNotificationAdapter().cancel('any')).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

describe('WebFileAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('saveText 触发下载并返回可读的落地描述（供 toast 使用）', async () => {
    const result = await new WebFileAdapter().saveText({
      filename: 'timecalc.ics',
      content: 'BEGIN:VCALENDAR',
      mime: 'text/calendar',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('timecalc.ics');
  });

  it('shareText 在支持 Web Share API 时调用它', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { writable: true, configurable: true, value: share });

    const result = await new WebFileAdapter().shareText({ title: '结果', text: '9 小时' });
    expect(result.ok).toBe(true);
    expect(share).toHaveBeenCalledWith({ title: '结果', text: '9 小时' });
  });

  it('用户在分享面板里点取消（AbortError）不算失败', async () => {
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException('canceled', 'AbortError');
      }),
    });

    expect((await new WebFileAdapter().shareText({ text: 'x' })).ok).toBe(true);
  });

  it('没有分享 API 时降级为复制剪贴板', async () => {
    Object.defineProperty(navigator, 'share', { writable: true, configurable: true, value: undefined });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText },
    });

    expect((await new WebFileAdapter().shareText({ text: '9 小时' })).ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('9 小时');
  });
});

/* ------------------------------------------------------------------ */

describe('WebCalendarAdapter', () => {
  it('supported 为 false——浏览器写系统日历基本不可用，不假装支持', () => {
    expect(new WebCalendarAdapter().supported).toBe(false);
  });

  it('addEvent 返回 unsupported 并提示改用 .ics', async () => {
    const result = await new WebCalendarAdapter().addEvent(makeEvent());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported');
      expect(result.message).toContain('.ics');
    }
  });

  it('exportICS 永远可用——它是日历写入的降级方案，必须 100% 可靠', async () => {
    const result = await new WebCalendarAdapter().exportICS([makeEvent()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('BEGIN:VCALENDAR');
      expect(result.value).toContain('END:VCALENDAR');
      expect(result.value).toContain('BEGIN:VEVENT');
    }
  });

  it('导出的事件带上了自动生成的 uid', async () => {
    const result = await new WebCalendarAdapter().exportICS([makeEvent()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('UID:timecalc-');
  });

  it('空数组也返回合法的空日历，而不是空字符串', async () => {
    const result = await new WebCalendarAdapter().exportICS([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('BEGIN:VCALENDAR');
      expect(result.value).not.toContain('BEGIN:VEVENT');
    }
  });
});

/* ------------------------------------------------------------------ */

describe('WebShortcutAdapter', () => {
  it('global 为 false——Web 只有页内快捷键', () => {
    expect(new WebShortcutAdapter().global).toBe(false);
  });

  it('注册请求被诚实拒绝，并说明已退化为页内快捷键', async () => {
    const result = await new WebShortcutAdapter().register('CommandOrControl+Shift+T', () => {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported');
      expect(result.message).toContain('页内');
    }
  });

  it('注销是空操作，不会抛错', async () => {
    const adapter = new WebShortcutAdapter();
    await expect(adapter.unregister('x')).resolves.toBeUndefined();
    await expect(adapter.unregisterAll()).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

describe('createWebPlatform', () => {
  it('未传适配器时全部使用 Web 基线实现', () => {
    const platform = createWebPlatform({ info: APP_INFO });
    expect(platform.notification).toBeInstanceOf(WebNotificationAdapter);
    expect(platform.clipboard).toBeInstanceOf(WebClipboardAdapter);
    expect(platform.file).toBeInstanceOf(WebFileAdapter);
    expect(platform.calendar).toBeInstanceOf(WebCalendarAdapter);
    expect(platform.shortcut).toBeInstanceOf(WebShortcutAdapter);
    expect(platform.info).toBe(APP_INFO);
  });

  it('传入的适配器会覆盖对应基线，其余保持不变（原生增强靠这个机制）', () => {
    const clipboard = new WebClipboardAdapter();
    const platform = createWebPlatform({ info: APP_INFO, clipboard });
    expect(platform.clipboard).toBe(clipboard);
    expect(platform.calendar).toBeInstanceOf(WebCalendarAdapter);
  });

  it('默认 init / dispose 是可 await 的空操作', async () => {
    const platform = createWebPlatform({ info: APP_INFO });
    await expect(platform.init()).resolves.toBeUndefined();
    await expect(platform.dispose()).resolves.toBeUndefined();
  });

  it('自定义 init / dispose 会被调用', async () => {
    const init = vi.fn(async () => {});
    const dispose = vi.fn(async () => {});
    const platform = createWebPlatform({ info: APP_INFO, init, dispose });
    await platform.init();
    await platform.dispose();
    expect(init).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */

describe('isStandalone', () => {
  it('display-mode: standalone 时判定为独立窗口', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: query.includes('standalone') }),
    });
    expect(isStandalone()).toBe(true);
  });

  it('iOS 的 navigator.standalone 也认', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(navigator, 'standalone', { writable: true, configurable: true, value: true });
    expect(isStandalone()).toBe(true);
    Object.defineProperty(navigator, 'standalone', { writable: true, configurable: true, value: undefined });
  });

  it('普通标签页里返回 false', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({ matches: false }),
    });
    expect(isStandalone()).toBe(false);
  });
});
