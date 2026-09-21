/** @type {import('tailwindcss').Config} */
// TailwindCSS 配置：定义主题色（深蓝主色）与字体
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色：深蓝（#1a2a3a）系列
        brand: {
          DEFAULT: '#1a2a3a',
          50: '#f5f7fa',
          100: '#e7ecf2',
          200: '#cbd6e3',
          300: '#9eb1c8',
          400: '#6e8aa8',
          500: '#4d6a89',
          600: '#3a516e',
          700: '#2b3d56',
          800: '#1a2a3a',
          900: '#0e1a28',
        }
      },
      fontFamily: {
        // 使用系统默认字体
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
      }
    },
  },
  plugins: [],
}
