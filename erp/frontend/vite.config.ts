import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // الواجهة تنادي /api/v1 على نفس النطاق (هكذا تعمل في الإنتاج خلف Nginx)،
    // فنمرّره هنا إلى خادم Laravel المحلي حتى يعمل التطوير بالطريقة نفسها.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
