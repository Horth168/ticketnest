import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Content Security Policy for the production build: the browser only runs scripts and connects to the
// places TicketNest actually uses (its API, Telegram, Google sign-in, Cloudflare Turnstile), which blocks
// most injected-script attacks. Added at build time so the API address comes from VITE_API_URL.
function csp(apiUrl) {
  let api = ''
  try { api = apiUrl ? new URL(apiUrl).origin : '' } catch { api = '' }
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://telegram.org https://accounts.google.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    `connect-src 'self' ${api} https://accounts.google.com https://challenges.cloudflare.com`,
    `img-src 'self' data: blob: https: ${api}`,
    "font-src 'self' data:",
    "frame-src https://accounts.google.com https://challenges.cloudflare.com https://oauth.telegram.org https://telegram.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ').replace(/\s+/g, ' ')
  return {
    name: 'ticketnest-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// The API runs on :8000 locally; /api, /media and share links are proxied so the browser sees one origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), csp(env.VITE_API_URL)],
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8000', '/media': 'http://localhost:8000', '/s/': 'http://localhost:8000' },
    },
    build: { chunkSizeWarningLimit: 900 },
  }
})
