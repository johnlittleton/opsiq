/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Grafana-inspired dark theme
        background: {
          DEFAULT: '#0b0c0e',
          secondary: '#111217',
          tertiary: '#18181b',
        },
        panel: {
          DEFAULT: '#18181b',
          hover: '#1f1f23',
          border: '#2e2e32',
        },
        text: {
          DEFAULT: '#d8d9da',
          muted: '#9fa0a3',
          subtle: '#6e6f73',
        },
        accent: {
          blue: '#52a8ff',
          'blue-hover': '#3871dc',
          green: '#73bf69',
          yellow: '#fade2a',
          red: '#dc3545',
          purple: '#b877d9',
          orange: '#ff9830',
        },
        status: {
          open: '#73bf69',      // GREEN
          offload: '#52a8ff',   // BLUE
          loading: '#fade2a',   // YELLOW
          blocked: '#1a1a1a',   // BLACK
          waiting: '#b877d9',   // PURPLE
          parked: '#dc3545',    // RED
        },
      },
      backdropBlur: {
        xs: '2px',
        glass: '12px',
        'glass-strong': '18px',
      },
      boxShadow: {
        'glass': '0 4px 16px rgba(0, 0, 0, 0.3)',
        'glass-hover': '0 8px 24px rgba(0, 0, 0, 0.4)',
        'glow-blue': '0 0 20px rgba(82, 168, 255, 0.3)',
        'glow-green': '0 0 20px rgba(115, 191, 105, 0.3)',
        'glow-yellow': '0 0 20px rgba(250, 222, 42, 0.3)',
        'glow-red': '0 0 20px rgba(220, 53, 69, 0.3)',
        'glow-purple': '0 0 20px rgba(184, 119, 217, 0.3)',
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
