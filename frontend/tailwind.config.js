/** Colours: green accents, soft green active states, light grey fields. */
const config = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E9F7EF', // active nav item, Google button background
          100: '#D3F0DF',
          500: '#16A34A',
          600: '#00A63E', // primary green (Login button, Compose border)
          700: '#0F7A34',
        },
        field: '#F4F5F5', // input backgrounds
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        pixel: ['var(--font-pixel)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
