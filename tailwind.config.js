/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        landing: [
          'Outfit',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'landing-nebula-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(-1.2%, 0.8%, 0) scale(1.04)' },
        },
        'landing-nebula-drift-slow': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '50%': { transform: 'translate3d(1.5%, -1%, 0) rotate(1deg)' },
        },
        'landing-nebula-breathe': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.5' },
        },
        'landing-hero-halo-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.72' },
        },
        'landing-hero-halo-pulse-alt': {
          '0%, 100%': { opacity: '0.28' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'landing-nebula-drift': 'landing-nebula-drift 100s ease-in-out infinite',
        'landing-nebula-drift-slow': 'landing-nebula-drift-slow 140s ease-in-out infinite',
        'landing-nebula-breathe': 'landing-nebula-breathe 32s ease-in-out infinite',
        'landing-hero-halo-pulse': 'landing-hero-halo-pulse 7.5s ease-in-out infinite',
        'landing-hero-halo-pulse-alt': 'landing-hero-halo-pulse-alt 10s ease-in-out 1.25s infinite',
      },
    },
  },
  plugins: [],
};
