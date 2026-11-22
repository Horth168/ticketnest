// KHQR payment card in the official KHQR card layout (reused from IceQ Sole): always white so every
// banking app can scan it, also in dark mode.
import { QRCodeSVG } from 'qrcode.react'

const RED = '#E21A2C'
const mark = (sign) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff"/><circle cx="20" cy="20" r="17" fill="#000"/><text x="20" y="26.8" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#fff">${sign}</text></svg>`)}`

export default function KhqrCard({ value, name, amount, currency = 'USD', dim = false }) {
  const shown = currency === 'KHR' ? Number(amount).toLocaleString('en-US') : (amount / 100).toFixed(2)
  return (
    <div className="relative mx-auto w-full max-w-[280px] select-none">
      <div className={`overflow-hidden rounded-[20px] shadow-lift ring-1 ring-black/5 transition-opacity ${dim ? 'opacity-30' : ''}`} style={{ background: '#fff', color: '#000' }}>
        <div className="relative grid h-[54px] place-items-center" style={{ background: RED }}>
          <span className="font-sans text-[20px] font-extrabold tracking-[.18em] text-white">KHQR</span>
        </div>
        <span aria-hidden className="absolute right-0 top-[54px] h-0 w-0 border-l-[24px] border-t-[18px] border-l-transparent" style={{ borderTopColor: RED }} />
        <div className="px-6 pt-5">
          <p className="truncate text-[13px] font-medium" style={{ color: 'rgba(0,0,0,.7)' }}>{name || 'TicketNest'}</p>
          <p className="mt-1 flex items-baseline gap-1.5 tabular-nums">
            <span className="font-sans text-[30px] font-extrabold leading-none tracking-tight">{shown}</span>
            <span className="text-[13px] font-semibold" style={{ color: 'rgba(0,0,0,.55)' }}>{currency}</span>
          </p>
        </div>
        <div className="mx-5 my-4 border-t-[1.5px] border-dashed" style={{ borderColor: 'rgba(0,0,0,.18)' }} />
        <div className="px-6 pb-6">
          {value && <QRCodeSVG value={value} size={232} level="Q" bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full"
            imageSettings={{ src: mark(currency === 'KHR' ? '៛' : '$'), height: 40, width: 40, excavate: true }} />}
        </div>
      </div>
    </div>
  )
}
