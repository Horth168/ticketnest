export const cls = (...a) => a.filter(Boolean).join(' ')

// money is always integer cents from the API
export const usd = (cents, { decimals } = {}) => {
  if (cents == null) return '—'
  const d = decimals ?? (cents % 100 === 0 ? 0 : 2)
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
export const usd2 = (cents) => usd(cents, { decimals: 2 })
export const khr = (cents, rate) => `៛${(Math.round((cents * rate) / 10000) * 100).toLocaleString('en-US')}`
export const pct = (bps) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`

const TZ = 'Asia/Phnom_Penh'
export const dateLong = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''
export const dateShort = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
export const time = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
export const dateTime = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : ''
export const dayParts = (iso) => {
  const d = new Date(iso)
  return { day: d.getDate(), mon: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(), dow: d.toLocaleString('en-US', { weekday: 'short' }) }
}

export const ORDER_STATUS = {
  awaiting_payment: ['Awaiting payment', 'warn'], paid: ['Paid', 'good'], preparing: ['Preparing ticket', 'accent'],
  awaiting_delivery: ['Awaiting delivery', 'accent'], delivered: ['Delivered', 'good'], completed: ['Completed', 'good'],
  cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
export const LISTING_STATUS = {
  pending: ['Pending approval', 'warn'], approved: ['Approved', 'good'], rejected: ['Rejected', 'bad'],
  available: ['Available', 'good'], reserved: ['Reserved', 'accent'], sold: ['Sold', 'muted'],
  cancelled: ['Cancelled', 'muted'], disabled: ['Disabled', 'bad'],
}
export const TICKET_TYPES = { e_ticket: 'E-ticket (PDF / QR)', mobile_transfer: 'Mobile transfer', paper: 'Paper ticket', other: 'Other' }

export const newKey = () => (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
