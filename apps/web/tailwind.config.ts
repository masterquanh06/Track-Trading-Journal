import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        sidebar: 'var(--bg-sidebar)',
        topbar: 'var(--bg-topbar)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        subtle: 'var(--bg-subtle)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
        background: 'var(--bg-canvas)',
        foreground: 'var(--fg-primary)',
        fg: {
          DEFAULT: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
          faint: 'var(--fg-faint)',
        },
        card: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--fg-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-popover)',
          foreground: 'var(--fg-primary)',
        },
        primary: {
          DEFAULT: 'var(--color-accent, #6366F1)',
          foreground: 'var(--color-on-accent, #FFFFFF)',
        },
        secondary: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--fg-secondary)',
        },
        muted: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--fg-muted)',
        },
        accent: {
          DEFAULT: 'var(--bg-hover)',
          foreground: 'var(--fg-primary)',
        },
        destructive: {
          DEFAULT: 'var(--loss-fg)',
          foreground: '#FFFFFF',
        },
        border: 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        input: 'var(--border-subtle)',
        ring: 'var(--focus-ring)',
        profit: 'var(--profit-fg)',
        loss: 'var(--loss-fg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
