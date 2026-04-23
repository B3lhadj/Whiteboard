/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'word-blue': '#2b579a',
        'excel-green': '#217346',
        'powerpoint-red': '#b7472a',
        'pdf-red': '#e02b20',
        'theme-teal': '#0891b2',
        'theme-purple': '#7c3aed',
        'theme-amber': '#d97706',
      }
    },
  },
  plugins: [],
}
