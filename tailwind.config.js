import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#152039',
        muted: '#78849a',
        canvas: '#f5f7fb',
        violet: {
          50: '#f4f1ff',
          100: '#ebe5ff',
          500: '#7856e8',
          600: '#6843d8',
          700: '#5531be',
        },
      },
      boxShadow: {
        card: '0 2px 14px rgba(24, 36, 65, 0.045)',
      },
    },
  },
  plugins: [forms],
}
