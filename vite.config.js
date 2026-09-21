import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：使用 React 插件，开放本地端口 5173
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
