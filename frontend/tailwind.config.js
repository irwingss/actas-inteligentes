/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OEFA Institutional Color Palette
        primary: {
          50: '#e8f1f9',
          100: '#d1e3f3',
          200: '#a3c7e7',
          300: '#75abdb',
          400: '#478fcf',
          500: '#164F9E', // Deep Blue - Hero color
          600: '#123f7e',
          700: '#0d2f5f',
          800: '#09203f',
          900: '#041020',
        },
        secondary: {
          50: '#e6f5fa',
          100: '#ccebf5',
          200: '#99d7eb',
          300: '#66c3e1',
          400: '#33afd7',
          500: '#208DC2', // Ocean Blue
          600: '#1a719b',
          700: '#135574',
          800: '#0d384e',
          900: '#061c27',
        },
        accent: {
          50: '#e7f8fb',
          100: '#cff1f7',
          200: '#9fe3ef',
          300: '#6fd5e7',
          400: '#3fc7df',
          500: '#33BCD5', // Cyan
          600: '#2996aa',
          700: '#1f7180',
          800: '#144b55',
          900: '#0a262b',
        },
        success: {
          50: '#f0f9f4',
          100: '#e1f3e9',
          200: '#c3e7d3',
          300: '#a5dbbd',
          400: '#87cfa7',
          500: '#6ABE9A', // Teal Green
          600: '#55987b',
          700: '#40725c',
          800: '#2a4c3e',
          900: '#15261f',
        },
        highlight: {
          50: '#f4f9e9',
          100: '#e9f3d3',
          200: '#d3e7a7',
          300: '#bddb7b',
          400: '#a7cf4f',
          500: '#8DC043', // Lime Green
          600: '#719936',
          700: '#557328',
          800: '#384d1b',
          900: '#1c260d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    function({ addVariant }) {
      addVariant('pink', '.pink &')
    }
  ],
}
