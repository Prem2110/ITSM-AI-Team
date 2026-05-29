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
        'page-enter':    'page-enter     220ms cubic-bezier(0.16, 1, 0.3, 1)     both',
        'row-enter':     'row-enter      240ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'content-enter': 'content-enter  200ms ease-out                           both',
        'backdrop-enter':'backdrop-enter 180ms ease-out                           both',
        'backdrop-exit': 'backdrop-exit  200ms ease-in                            both',
        'modal-enter':   'modal-enter    220ms cubic-bezier(0.16, 1, 0.3, 1)     both',
        'modal-exit':    'modal-exit     180ms ease-in                            both',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
