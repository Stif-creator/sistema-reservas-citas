/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        surface: '#FFFFFF',
        ink: '#111827',
        muted: '#64748B',
        border: '#E2E8F0',
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
        },
        success: '#16A34A',
        error: '#DC2626',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 1px 3px 0 rgba(17, 24, 39, 0.06)',
      },
    },
  },
  plugins: [],
}
