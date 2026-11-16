import type { Config } from 'tailwindcss';

/**
 * Royal Ride theme: navy blue, royal gold, white, light grey.
 *   navy-900 #0b1f4b  primary brand / headers
 *   gold-500 #c9a227  accents, CTAs on dark
 *   mist     light greys for surfaces
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', lg: '2rem' }, screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        navy: {
          50: '#eef2fa',
          100: '#d6deef',
          200: '#adbddf',
          300: '#7d95c9',
          400: '#4f6db0',
          500: '#2f4f96',
          600: '#213d7c',
          700: '#183065',
          800: '#112656',
          900: '#0b1f4b',
          950: '#06122d',
        },
        gold: {
          50: '#fbf7e9',
          100: '#f5ebc4',
          200: '#ecd88d',
          300: '#e2c35a',
          400: '#d6b23c',
          500: '#c9a227',
          600: '#a9841d',
          700: '#86661a',
          800: '#6b511b',
          900: '#59441b',
        },
        mist: {
          50: '#f8f9fb',
          100: '#f1f3f6',
          200: '#e4e7ec',
          300: '#cfd4dc',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,31,75,.06), 0 8px 24px -12px rgba(11,31,75,.18)',
        lift: '0 2px 4px rgba(11,31,75,.06), 0 18px 40px -16px rgba(11,31,75,.32)',
        gold: '0 8px 24px -8px rgba(201,162,39,.55)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg,#e2c35a 0%,#c9a227 45%,#a9841d 100%)',
        'navy-deep': 'linear-gradient(160deg,#0b1f4b 0%,#112656 55%,#06122d 100%)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .5s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
export default config;
