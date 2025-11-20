/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f8ff',
          100: '#e6edff',
          200: '#c3d6ff',
          300: '#9fbfff',
          400: '#5a90ff',
          500: '#1d63ff',
          600: '#0046d8',
          700: '#0036a6',
          800: '#002674',
          900: '#001742'
        }
      }
    }
  },
  plugins: []
};

