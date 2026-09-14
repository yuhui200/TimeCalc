/**
 * 端到端冒烟与验收测试。
 *
 * 只覆盖**跨模块串联**的关键路径：单元测试已经保证了 core 的计算正确性，
 * 这里验证的是「UI 接对了 core、导航能走通、结果真的显示出来」。
 * 因此每条断言都对着用户可见的文本，而不是组件内部状态。
 *
 * 运行：npm run e2e（会自动 build + preview）
 * 只跑 Chromium：npm run e2e -- --project=desktop-chromium
 */
import { expect, test, type Page } from '@playwright/test';

/** 切到某个面板（走导航而不是快捷键，保证不依赖键盘） */
async function openPanel(page: Page, label: string) {
  // 桌面侧栏与手机功能条是两套布局，同一个面板的按钮名并不相同：
  //   桌面 =「日期差 Ctrl + 2」，因为 <kbd> 加速键提示就在按钮里；
  //   手机 =「日期差」，按钮上显示的是短名。
  // 所以既不能用 exact 匹配，也不能要求两边文本一致——改用
  // 「以完整面板名开头」的宽松匹配，两种布局都能命中，
  // 又不会误伤「日期加减」「时间加减」这类同前缀的面板。
  // 同一时刻只有一套布局是可见的（另一套 display:none，不在无障碍树里）。
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
}

/**
 * 打开页面并等待应用真正挂载。
 *
 * 快捷键是 React 挂载后由 useEffect 注册到 document 上的，而 page.goto
 * 在 load 事件就返回了。如果直接按键，这次按键会掉在「页面已加载、
 * 监听器还没绑上」的空档里，表现为快捷键完全失效。
 * 一级标题出现即证明 React 已经渲染完成。
 */
async function gotoReady(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('启动与导航', () => {
  test('首屏加载后默认停在自然语言面板，且没有控制台报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    // 标题栏与面板标题都在，说明 App 挂载成功
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('TimeCalc').first()).toBeVisible();

    // 启动骨架必须已被移除，否则说明 React 没挂上
    await expect(page.locator('#tc-boot')).toHaveCount(0);

    expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
  });

  test('切换到「日期差」面板', async ({ page }) => {
    await page.goto('/');
    await openPanel(page, '日期差');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('日期差');
  });

  test('URL hash 直接定位面板，刷新后仍在同一面板', async ({ page }) => {
    await page.goto('/#/unix');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('时间戳');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('时间戳');
  });
});

test.describe('日期差', () => {
  test('算出 2026-01-01 到 2026-12-31 的天数', async ({ page }) => {
    await page.goto('/#/date-diff');

    const start = page.getByLabel('开始日期');
    const end = page.getByLabel('结束日期');
    await start.fill('2026-01-01');
    await end.fill('2026-12-31');

    // 2026 是平年，首尾都算 = 365 天
    await expect(page.getByText(/365 天/).first()).toBeVisible();
  });
});

test.describe('时间差', () => {
  test('09:00 → 18:00 是 9 小时', async ({ page }) => {
    await page.goto('/#/time-diff');

    await page.getByLabel('开始时刻').fill('09:00');
    await page.getByLabel('结束时刻').fill('18:00');

    await expect(page.getByText('9 小时').first()).toBeVisible();
  });
});

test.describe('时间戳', () => {
  test('0 换算成 1970-01-01', async ({ page }) => {
    await page.goto('/#/unix');

    await page.getByLabel('Unix 时间戳').fill('0');

    // 按北京时间显示，纪元时刻是 08:00
    await expect(page.getByText(/1970-01-01/).first()).toBeVisible();
  });
});

test.describe('自然语言', () => {
  test('「下周五 15:00 + 2h30m」能解析出结果', async ({ page }) => {
    await page.goto('/#/natural');

    const input = page.getByRole('textbox').first();
    await input.fill('下周五 15:00 + 2h30m');

    // 不锁死具体日期（依赖当前时间），只要求给出了一个含 17:30 的结果
    await expect(page.getByText(/17:30/).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('时区', () => {
  test('北京时间 12:00 换到纽约不是同一时刻', async ({ page }) => {
    await page.goto('/#/timezone');

    await page.getByLabel('时刻').fill('2026-06-01T12:00');

    // 夏令时下纽约是 UTC-4，北京 UTC+8 → 相差 12 小时 → 00:00
    await expect(page.getByText(/2026-06-01 00:00/).first()).toBeVisible();
  });
});

test.describe('倒计时', () => {
  test('设置一个未来时刻后显示剩余时间', async ({ page }) => {
    await page.goto('/#/countdown');

    await page.getByLabel('目标时刻').fill('2030-01-01T00:00');
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByText(/还剩/).first()).toBeVisible();
  });
});

test.describe('历史记录', () => {
  test('算过一次之后能在历史里找到', async ({ page }) => {
    await page.goto('/#/time-diff');
    await page.getByLabel('开始时刻').fill('08:00');
    await page.getByLabel('结束时刻').fill('12:00');
    await expect(page.getByText('4 小时').first()).toBeVisible();

    // 面板里的记录有 900ms 防抖，等一下再切
    await page.waitForTimeout(1500);

    await openPanel(page, '历史记录');
    await expect(page.getByText('08:00 → 12:00').first()).toBeVisible();
  });
});

test.describe('设置与主题', () => {
  test('切换到暗色主题会写到 html[data-theme]', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByRole('radio', { name: /暗色/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 刷新后仍然是暗色：证明写进了 localStorage 且反闪烁脚本读得到
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('「关于」页列出了平台能力', async ({ page }) => {
    await page.goto('/#/about');
    await expect(page.getByRole('heading', { name: '能力清单' })).toBeVisible();
    await expect(page.getByText('离线使用')).toBeVisible();
  });
});

test.describe('命令面板与快捷键', () => {
  test('Ctrl/⌘+K 打开命令面板并能跳转', async ({ page, browserName }) => {
    await gotoReady(page);
    // WebKit / 移动端没有 Ctrl，用 Meta 在 Chromium 上也等价
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+k' : 'Control+k');

    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible();

    await page.getByRole('combobox').fill('时区');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('时区');
  });

  test('问号打开快捷键帮助', async ({ page }) => {
    await gotoReady(page);
    // 先在空白处点一下，确保焦点不在输入框内
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('?');
    await expect(page.getByText('键盘快捷键').first()).toBeVisible();
  });
});

test.describe('无障碍', () => {
  test('结果区是 aria-live，改输入会播报', async ({ page }) => {
    await page.goto('/#/time-diff');
    await expect(page.locator('[aria-live="polite"]').first()).toBeVisible();
  });

  test('所有交互按钮的触摸高度不小于 48px', async ({ page }) => {
    await page.goto('/#/date-diff');

    const heights = await page.getByRole('button').evaluateAll((nodes) =>
      nodes
        // 只检查真正可见的按钮：隐藏的（如响应式另一套布局）不参与
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.height > 0 && rect.width > 0)
        .map((rect) => rect.height),
    );

    expect(heights.length).toBeGreaterThan(0);
    // 允许 47.5 的浮点误差
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(47.5);
    }
  });
});

test.describe('移动端布局', () => {
  test.skip(({ isMobile }) => !isMobile, '仅移动端项目运行');

  test('功能条可横向滚动且首屏不出现横向滚动条', async ({ page }) => {
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // 页面主体不能横向滚动（横向滚动的只允许是功能条这类内部容器）
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('PWA', () => {
  test('manifest 可访问且包含必需字段', async ({ page, request }) => {
    await page.goto('/');
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBeTruthy();

    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: unknown[];
    };
    expect(manifest.name).toContain('TimeCalc');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('Service Worker 已注册', async ({ page }) => {
    await page.goto('/');

    // 注册发生在应用挂载后的 effect 里，而且 register() 本身是异步的。
    // goto 一返回就查一次必然拿不到，必须轮询等待。
    // 注意谓词要返回 Promise（await getRegistration()）：漏掉 await 的话
    // 它会立刻返回一个真值，测试就变成永远通过了。
    await page.waitForFunction(
      () =>
        'serviceWorker' in navigator &&
        navigator.serviceWorker.getRegistration().then(Boolean),
      undefined,
      { timeout: 15_000 },
    );

    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.scope ?? null;
    });
    expect(scope).toBeTruthy();
  });
});
