import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: '#d7dde8',
        surface: '#ffffff',
        muted: '#667085',
      },
    },
  },
  plugins: [],
} satisfies Config;
