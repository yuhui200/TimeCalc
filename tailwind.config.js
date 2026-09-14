/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 主题由 <html data-theme="light|dark"> 驱动，由 JS 解析 system 后落盘，避免闪烁
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--tc-bg)',
        surface: 'var(--tc-surface)',
        surface2: 'var(--tc-surface-2)',
        line: 'var(--tc-line)',
        ink: 'var(--tc-ink)',
        muted: 'var(--tc-muted)',
        accent: 'var(--tc-accent)',
        accentInk: 'var(--tc-accent-ink)',
        accentSoft: 'var(--tc-accent-soft)',
        danger: 'var(--tc-danger)',
        ok: 'var(--tc-ok)',
        warn: 'var(--tc-warn)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans SC',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'JetBrains Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        result: ['clamp(1.75rem, 6vw, 2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        resultSm: ['clamp(1.25rem, 4vw, 1.75rem)', { lineHeight: '1.2' }],
      },
      borderRadius: {
        card: '1rem',
        pill: '999px',
      },
      minHeight: {
        tap: '48px',
      },
      minWidth: {
        tap: '48px',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom, 0px)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        pop: '0 12px 40px -12px rgb(0 0 0 / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
