/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index-new.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retro: {
          bg: '#202020',
          panel: '#f0f0d0',
          dark: '#2d2d2d',
          accent: '#e63946',
          blue: '#457b9d',
          green: '#2a9d8f'
        },
        type: {
          fire: '#f08030',
          water: '#6890f0',
          grass: '#78c850',
          electric: '#f8d030',
          normal: '#a8a878',
          psychic: '#f85888',
          ice: '#98d8d8',
          dragon: '#7038f8'
        }
      },
      fontFamily: {
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
      boxShadow: {
        'pixel': '4px 4px 0px 0px rgba(0,0,0,0.5)',
        'pixel-sm': '2px 2px 0px 0px rgba(0,0,0,0.3)',
        'pixel-inset': 'inset 4px 4px 0px 0px rgba(0,0,0,0.2)',
      },
      animation: {
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'flash': 'flash 0.2s ease-in-out 3',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' }
        },
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' }
        }
      }
    }
  },
  plugins: [],
}
