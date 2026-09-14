import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.timecalc.mobile',
  appName: 'TimeCalc',
  // 三端复用同一份构建产物
  webDir: 'dist',

  // 仅在需要热更新调试时打开：npm run dev 后把 url 指向局域网地址
  // server: { url: 'http://192.168.1.10:5173', cleartext: true },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },

  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_timecalc',
      iconColor: '#2563eb',
    },
    SplashScreen: {
      launchShowDuration: 300,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
