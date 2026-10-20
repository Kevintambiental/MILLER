import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#07121b',
        cyan: '#72e5f7',
        soil: '#766653'
      }
    }
  },
  plugins: []
};

export default config;
