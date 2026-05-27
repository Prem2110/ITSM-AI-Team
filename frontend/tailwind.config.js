/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      spacing: {
        '1.5': '6px',
        '2.5': '10px',
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
        lg: '4px',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
      },
      animation: {
        'page-enter': 'page-enter 180ms ease-out both',
        'row-enter':  'row-enter  200ms ease-out both',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
