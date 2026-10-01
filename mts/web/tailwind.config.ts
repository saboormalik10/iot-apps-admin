import type { Config } from 'tailwindcss';

/**
 * Every colour is a semantic role resolved from `styles/tokens.css`, so a call
 * site never names a hue and dark mode needs no second class list.
 *
 * Three scales are kept apart on purpose — severity (how bad), operational (what
 * the plant is doing) and series (which line is which). A pump RUNNING during a
 * flood is not "good"; borrowing the severity green for it would say it was.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          strong: 'hsl(var(--primary-strong))',
        },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        /* The masthead: a brand surface, navy in both themes. */
        header: {
          DEFAULT: 'hsl(var(--header))',
          foreground: 'hsl(var(--header-foreground))',
          muted: 'hsl(var(--header-muted))',
          border: 'hsl(var(--header-border))',
        },
        /* Solid bars that carry text: each keeps its own ink so neither theme
           can leave the disclaimer unreadable. */
        banner: {
          DEFAULT: 'hsl(var(--banner))',
          foreground: 'hsl(var(--banner-foreground))',
        },
        chip: {
          ok: 'hsl(var(--chip-ok))',
          'ok-foreground': 'hsl(var(--chip-ok-foreground))',
          alert: 'hsl(var(--chip-alert))',
          'alert-foreground': 'hsl(var(--chip-alert-foreground))',
        },
        wordmark: 'hsl(var(--wordmark))',

        /* How bad is it? */
        sev: {
          alert: 'hsl(var(--sev-alert))',
          'alert-strong': 'hsl(var(--sev-alert-strong))',
          'alert-tint': 'hsl(var(--sev-alert-tint))',
          warning: 'hsl(var(--sev-warning))',
          'warning-strong': 'hsl(var(--sev-warning-strong))',
          'warning-tint': 'hsl(var(--sev-warning-tint))',
          info: 'hsl(var(--sev-info))',
          'info-strong': 'hsl(var(--sev-info-strong))',
          'info-tint': 'hsl(var(--sev-info-tint))',
          normal: 'hsl(var(--sev-normal))',
          'normal-strong': 'hsl(var(--sev-normal-strong))',
          'normal-tint': 'hsl(var(--sev-normal-tint))',
          cleared: 'hsl(var(--sev-cleared))',
          'cleared-strong': 'hsl(var(--sev-cleared-strong))',
          'cleared-tint': 'hsl(var(--sev-cleared-tint))',
          offline: 'hsl(var(--sev-offline))',
          'offline-strong': 'hsl(var(--sev-offline-strong))',
          'offline-tint': 'hsl(var(--sev-offline-tint))',
        },

        /* What is the plant doing? */
        op: {
          running: 'hsl(var(--op-running))',
          'running-tint': 'hsl(var(--op-running-tint))',
          ready: 'hsl(var(--op-ready))',
          'ready-tint': 'hsl(var(--op-ready-tint))',
          fault: 'hsl(var(--op-fault))',
          'fault-tint': 'hsl(var(--op-fault-tint))',
          manual: 'hsl(var(--op-manual))',
          'manual-tint': 'hsl(var(--op-manual-tint))',
        },

        /* Which line is which? Assigned per parameter in lib/series.ts. */
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
          6: 'hsl(var(--chart-6))',
          7: 'hsl(var(--chart-7))',
          8: 'hsl(var(--chart-8))',
          surface: 'hsl(var(--chart-surface))',
        },

        /* The rule a series is judged against — never a series colour itself. */
        threshold: { DEFAULT: 'hsl(var(--threshold))', soft: 'hsl(var(--threshold-soft))' },
        band: { warning: 'hsl(var(--band-warning))', alert: 'hsl(var(--band-alert))' },
        grid: 'hsl(var(--grid))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        /* The mockup's red blinking camera icon — "verification required". */
        'blink-alert': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'blink-alert': 'blink-alert 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
