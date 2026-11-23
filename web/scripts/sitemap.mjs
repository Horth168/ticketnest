// Runs after `vite build`: saves the live sitemap (built by the API from published concerts and artists)
// as dist/sitemap.xml, because Google Search Console only accepts a sitemap on the website's own address.
// If the API can't be reached during the build, a basic sitemap of the main pages is written instead,
// so the build never fails because of it. Every deploy refreshes the file.
import { writeFileSync } from 'node:fs'

const api = (process.env.VITE_API_URL || '').replace(/\/$/, '')
const site = (process.env.SITE_URL || 'https://ticketnest-web.onrender.com').replace(/\/$/, '')
const out = new URL('../dist/sitemap.xml', import.meta.url)

function fallback() {
  const pages = ['/', '/concerts', '/artists', '/how-it-works', '/guarantee', '/policies/refunds', '/policies/authenticity']
  const today = new Date().toISOString().slice(0, 10)
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + pages.map((p) => `<url><loc>${site}${p}</loc><lastmod>${today}</lastmod></url>`).join('') + '</urlset>'
}

async function main() {
  let xml = ''
  if (api && typeof fetch === 'function') {
    for (let attempt = 1; attempt <= 3 && !xml; attempt++) {
      try {
        const r = await fetch(`${api}/sitemap.xml`, { signal: AbortSignal.timeout(60000) })
        const text = await r.text()
        if (r.ok && text.includes('<urlset')) xml = text
      } catch (e) {
        console.warn(`sitemap: attempt ${attempt} failed (${e.message})`)
      }
    }
  }
  writeFileSync(out, xml || fallback())
  console.log(xml ? `sitemap: saved ${(xml.match(/<loc>/g) || []).length} pages from the API` : 'sitemap: API unreachable, wrote the basic sitemap')
}

main()
