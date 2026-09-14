/**
 * Web / Tauri / Capacitor 三端共用的入口。
 *
 * 启动顺序是有讲究的，不能随意调换：
 *   1. 样式先引入（虽然有内联脚本定主题，但 CSS 变量必须在首帧就在）；
 *   2. `initPlatform()` **await 后再渲染**——平台能力（通知权限、
 *      全局快捷键）的状态必须在首次渲染前就确定，否则「关于」页会先
 *      显示「不支持」再跳成「支持」，用户看到的是闪烁的错误信息；
 *   3. 最后才挂载 React。
 *
 * 平台初始化失败不能阻止应用启动：算日期差不需要任何平台能力。
 * 因此 initPlatform 内部已经做了降级，这里再兜一层 catch 保证万无一失。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initPlatform } from '../../platform';
import { App } from './App';
import '../../styles/index.css';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) {
    // 只有在 index.html 被改坏时才会发生，此时报错越直白越好
    throw new Error('[timecalc] 找不到 #root 挂载点');
  }

  try {
    await initPlatform();
  } catch (error) {
    // 平台层降级为 Web 基线实现，功能照常
    console.warn('[timecalc] 平台初始化失败，已降级为 Web 实现', error);
  }

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // 首屏渲染完成后移除 index.html 里的骨架，避免与 React 内容并存
  document.getElementById('tc-boot')?.remove();
}

void bootstrap();
