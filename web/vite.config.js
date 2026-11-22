import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API runs on :8000 locally; /api and /media are proxied so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000', '/media': 'http://localhost:8000' },
  },
  build: { chunkSizeWarningLimit: 900 },
})
