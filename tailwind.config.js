import typography from '@tailwindcss/typography';

export default {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'magic-gold': '#FFD700',
        'magic-blue': '#1E90FF',
        'magic-indigo': '#4B0082',
        'magic-purple': '#800080',
      },
    },
  },
  plugins: [typography],
};
