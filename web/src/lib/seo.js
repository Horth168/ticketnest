// Search engines: each page sets its own title, description, canonical URL and (for concerts) schema.org
// Event data. Google renders JavaScript, so these are read even though the site is a single-page app.
// The list of pages is in the API's /sitemap.xml (referenced from public/robots.txt).
import { useEffect } from 'react'

const SITE = 'TicketNest'
const DEFAULT_TITLE = 'TicketNest · K-pop concert tickets'
const DEFAULT_DESC = 'Buy and sell K-pop concert tickets safely in Cambodia. Every listing is checked by our team, pay with KHQR, get your ticket on Telegram.'

function meta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', value)
}

function canonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el) }
  el.href = url
}

function jsonLd(data) {
  let el = document.getElementById('ld-json')
  if (!data) { el?.remove(); return }
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-json'; document.head.appendChild(el) }
  el.textContent = JSON.stringify(data)
}

/** usePageMeta({ title, description, image, data }) — call from a page component; `data` is JSON-LD. */
export function usePageMeta({ title, description, image, data } = {}) {
  const key = JSON.stringify([title, description, image, data])
  useEffect(() => {
    if (location.pathname.startsWith('/tg') || location.pathname.startsWith('/admin')) return undefined
    const full = title ? `${title} · ${SITE}` : DEFAULT_TITLE
    const desc = (description || DEFAULT_DESC).slice(0, 300)
    document.title = full
    meta('name', 'description', desc)
    meta('property', 'og:title', full)
    meta('property', 'og:description', desc)
    if (image) meta('property', 'og:image', image.startsWith('http') ? image : `${location.origin}${image}`)
    canonical(`${location.origin}${location.pathname}`)
    jsonLd(data || null)
    return () => { document.title = DEFAULT_TITLE; jsonLd(null) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** schema.org Event for a concert page (lets Google show date, venue and price in results). */
export function concertJsonLd(c) {
  const offers = (c.listings || []).filter((l) => l.available > 0)
  const prices = offers.map((l) => l.buyer_price_cents / 100)
  const abs = (u) => (u ? (u.startsWith('http') ? u : `${location.origin}${u}`) : `${location.origin}/og-image.png`)
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: c.title,
    startDate: c.starts_at,
    eventStatus: c.status === 'postponed' ? 'https://schema.org/EventPostponed' : c.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: c.venue, address: { '@type': 'PostalAddress', addressLocality: c.city, addressCountry: c.country } },
    image: [abs(c.poster_url)],
    description: c.description || `${c.artist?.name} live in ${c.city}. Resale tickets checked by TicketNest.`,
    performer: { '@type': 'MusicGroup', name: c.artist?.name },
    ...(prices.length ? {
      offers: {
        '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2),
        offerCount: offers.reduce((n, l) => n + l.available, 0), availability: 'https://schema.org/InStock', url: `${location.origin}${location.pathname}`,
      },
    } : {}),
  }
}
