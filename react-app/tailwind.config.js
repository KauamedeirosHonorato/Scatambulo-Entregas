/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pearl: '#F0EFEA',
        gold: {
          DEFAULT: '#D4AF37',
          dark: '#B8860B',
        },
      },
    },
  },
  plugins: [],
}
