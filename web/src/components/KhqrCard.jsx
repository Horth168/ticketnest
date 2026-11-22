// KHQR payment card in the official KHQR card layout: red header with the KHQR logo and folded corner,
// merchant name, amount, dashed line, and the QR with the KHQR mark in the middle. Always white so every
// banking app can scan it, also in dark mode. Error correction "H" keeps it scannable under the mark.
// The saved image (backend app/services/khqr_card.py) is drawn the same way.
import { QRCodeSVG } from 'qrcode.react'

const RED = '#E21A2C'

export default function KhqrCard({ value, name, amount, currency = 'USD', dim = false }) {
  const shown = currency === 'KHR' ? Number(amount).toLocaleString('en-US') : (amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="relative mx-auto w-full max-w-[300px] select-none">
      <div className={`relative overflow-hidden rounded-[18px] shadow-lift ring-1 ring-black/5 transition-opacity ${dim ? 'opacity-30' : ''}`} style={{ background: '#fff', color: '#000' }}>
        <div className="relative grid h-[54px] place-items-center" style={{ background: RED }}>
          <img src="/khqr/khqr-logo-white.png" alt="KHQR" className="h-[20px] w-auto" draggable="false" />
        </div>
        {/* folded corner under the header, as on the official card */}
        <span aria-hidden className="absolute right-0 top-[54px] h-0 w-0 border-l-[32px] border-t-[21px] border-l-transparent" style={{ borderTopColor: RED }} />
        <div className="px-6 pt-4">
          <p className="truncate text-[14px]" style={{ color: 'rgba(0,0,0,.82)' }}>{name || 'TicketNest'}</p>
          <p className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[26px] font-bold leading-none tracking-tight">{shown}</span>
            <span className="text-[12px] font-medium" style={{ color: 'rgba(0,0,0,.6)' }}>{currency}</span>
          </p>
        </div>
        <div className="mt-4 border-t-[1.5px] border-dashed" style={{ borderColor: 'rgba(0,0,0,.22)' }} />
        <div className="px-6 pb-6 pt-5">
          {value && <QRCodeSVG value={value} size={252} level="H" bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full"
            imageSettings={{ src: '/khqr/khqr-mark.png', height: 46, width: 46, excavate: true }} />}
        </div>
      </div>
    </div>
  )
}
