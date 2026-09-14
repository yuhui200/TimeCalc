/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * 编译期注入的常量（见 vite.config.ts 的 define 块）。
 * 声明在这里，让 TS 能对平台分支做常量折叠与死代码消除。
 */
declare const __APP_TARGET__: 'web' | 'tauri' | 'capacitor';
declare const __APP_VERSION__: string;

/** @vite-pwa/assets-generator 生成的图标清单 */
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (
      swUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
