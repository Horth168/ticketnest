/** Colours are CSS variables (src/index.css) so light, dark and Telegram themes share one set of classes. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), raised: v('raised'), ink: v('ink'), muted: v('muted'),
        line: v('line'), accent: v('accent'), 'accent-ink': v('accent-ink'), good: v('good'), warn: v('warn'), bad: v('bad'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px', '3xl': '24px' },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / .04), 0 8px 24px -12px rgb(0 0 0 / .18)',
        lift: '0 2px 4px rgb(0 0 0 / .05), 0 22px 44px -18px rgb(0 0 0 / .35)',
      },
      maxWidth: { page: '1200px' },
    },
  },
}
